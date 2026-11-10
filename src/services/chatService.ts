import { nanoid } from 'nanoid';
import {
  db,
  auth,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as limitQuery,
  serverTimestamp
} from '../firebase';
import {
  DailyChatMessage,
  DailyChatThread,
  ChatOperationRecord,
  getLocalDateString,
  SessionMode
} from '../types';
import { cleanUndefined, handleFirestoreError, OperationType } from './dbService';
import {
  createStudySession,
  createPlannedSession,
  updateSession,
  updatePlannedSession,
  scheduleAdaptiveRevisionToPlan,
  normalizeSubjectKey,
  CreatePlanInput,
  CreateSessionInput
} from './axionActionService';
import { parseNaturalDate } from '../utils/dateParser';
import { generateWithGemini, sendChatMessage } from '../lib/gemini';

export { generateWithGemini, sendChatMessage };

/**
 * Queries the user's active Firestore data (plans, logs, and revisionQueue)
 * and returns a structured JSON context string for real-time AI grounding.
 */
export async function getWorkspaceContext(uid: string, todayStr: string): Promise<string> {
  if (!uid) {
    return JSON.stringify({
      today: todayStr,
      todaysTasks: [],
      dueRevisions: [],
      recentStudyHistory: []
    });
  }

  let plans: any[] = [];
  let recentLogs: any[] = [];
  let dueRevisions: any[] = [];

  try {
    const plansSnap = await getDocs(
      query(collection(db, `users/${uid}/plans`), where('date', '==', todayStr))
    );
    plans = plansSnap.docs.map(d => d.data());
    if (plans.length === 0) {
      const todayPlanDoc = await getDoc(doc(db, 'users', uid, 'plans', todayStr));
      if (todayPlanDoc.exists()) {
        const docData = todayPlanDoc.data();
        if (docData && Array.isArray(docData.items)) {
          plans = docData.items;
        }
      }
    }
  } catch {}

  try {
    const logsSnap = await getDocs(
      query(collection(db, `users/${uid}/logs`), orderBy('timestamp', 'desc'), limitQuery(15))
    );
    recentLogs = logsSnap.docs.map(d => d.data());
  } catch {}

  try {
    const revSnap = await getDocs(
      query(collection(db, `users/${uid}/revisionQueue`), where('dueDate', '<=', todayStr))
    );
    dueRevisions = revSnap.docs.map(d => d.data());
  } catch {}

  return JSON.stringify({
    today: todayStr,
    todaysTasks: plans,
    dueRevisions,
    recentStudyHistory: recentLogs
  });
}

const LOCAL_CHAT_PREFIX = 'axion_daily_chat_';
const LOCAL_CLEAR_TS_PREFIX = 'axion_chat_cleared_at_';

export const WELCOME_ASSISTANT_MESSAGE: DailyChatMessage = {
  id: 'welcome-msg',
  sender: 'assistant',
  text:
    "👋 Hi! I'm your **Axion Study Companion**.\n\n" +
    "Your conversations are automatically indexed by day (`YYYY-MM-DD`). Here is what I can do:\n" +
    "• ⚡ **Batch Logging & Planning (Up to 8+ Sessions)**: *\"Plan 7 sessions for tomorrow across Physics, Chemistry, and Biology\"* or *\"Log 45m Physics Electrostatics and 60m Chemistry Solutions with 25 MCQs\"*\n" +
    "• 📊 **Daily Summaries**: *\"Summarize today's progress\"*\n" +
    "• 🔍 **Smart Queries**: *\"When did I last study Spermatogenesis?\"*, *\"How many MCQs did I solve this week?\"*\n" +
    "• 🎨 **Concept Diagrams**: *\"Diagram of photosynthesis\"*",
  timestamp: Date.now()
};

function getLocalMessages(dateKey: string): DailyChatMessage[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_CHAT_PREFIX}${dateKey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function setLocalMessages(dateKey: string, messages: DailyChatMessage[]): void {
  try {
    localStorage.setItem(`${LOCAL_CHAT_PREFIX}${dateKey}`, JSON.stringify(messages));
  } catch {}
}

/**
 * Returns the timestamp when the user clicked "New Thread / Clear View" for a given dateKey,
 * allowing a clean sub-session viewport without deleting stored Firestore messages.
 */
export function getViewportClearedTimestamp(dateKey: string): number {
  try {
    const val = localStorage.getItem(`${LOCAL_CLEAR_TS_PREFIX}${dateKey}`);
    return val ? Number(val) || 0 : 0;
  } catch {
    return 0;
  }
}

export function setViewportClearedTimestamp(dateKey: string, ts: number | null): void {
  try {
    if (ts === null) {
      localStorage.removeItem(`${LOCAL_CLEAR_TS_PREFIX}${dateKey}`);
    } else {
      localStorage.setItem(`${LOCAL_CLEAR_TS_PREFIX}${dateKey}`, String(ts));
    }
  } catch {}
}

/**
 * Loads all messages for a specific `dateKey` ("YYYY-MM-DD") from
 * `users/{uid}/dailyChats/{dateKey}/messages`.
 */
export async function getDailyChatMessages(
  dateKey: string,
  includeArchivedViewport = false
): Promise<DailyChatMessage[]> {
  const clearAfterTs = includeArchivedViewport ? 0 : getViewportClearedTimestamp(dateKey);

  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    try {
      const msgsRef = collection(db, 'users', uid, 'dailyChats', dateKey, 'messages');
      const q = query(msgsRef, orderBy('timestamp', 'asc'), limitQuery(200));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const loaded: DailyChatMessage[] = snap.docs.map(d => {
          const data = d.data() as any;
          const ts =
            typeof data.timestamp === 'number'
              ? data.timestamp
              : data.timestamp && typeof data.timestamp.toMillis === 'function'
              ? data.timestamp.toMillis()
              : Date.now();
          return {
            id: d.id,
            sender: data.sender === 'user' || data.role === 'user' ? 'user' : 'assistant',
            text: data.text || data.content || '',
            timestamp: ts,
            operationsExecuted: Array.isArray(data.operationsExecuted)
              ? data.operationsExecuted
              : undefined,
            diagramData: data.diagramData || undefined
          };
        });
        setLocalMessages(dateKey, loaded);
        const filtered = clearAfterTs > 0 ? loaded.filter(m => m.timestamp > clearAfterTs) : loaded;
        return filtered;
      }
    } catch (err) {
      console.warn(`getDailyChatMessages failed for ${dateKey}, falling back to local:`, err);
    }
  }

  const localMsgs = getLocalMessages(dateKey);
  return clearAfterTs > 0 ? localMsgs.filter(m => m.timestamp > clearAfterTs) : localMsgs;
}

/**
 * Persists a single chat message to `users/{uid}/dailyChats/{dateKey}/messages/{messageId}`
 * and updates the parent `users/{uid}/dailyChats/{dateKey}` document metadata.
 */
export async function saveDailyChatMessage(
  dateKey: string,
  input: {
    id?: string;
    sender: 'user' | 'assistant';
    text: string;
    timestamp?: number;
    operationsExecuted?: ChatOperationRecord[];
    diagramData?: DailyChatMessage['diagramData'];
  },
  summaryOverride?: string
): Promise<DailyChatMessage> {
  const msg: DailyChatMessage = {
    id: input.id || nanoid(),
    sender: input.sender,
    text: input.text,
    timestamp: input.timestamp || Date.now(),
    operationsExecuted:
      input.operationsExecuted && input.operationsExecuted.length > 0
        ? input.operationsExecuted
        : undefined,
    diagramData: input.diagramData
  };

  // 1. Update local cache immediately
  const existingLocal = getLocalMessages(dateKey);
  const updatedLocal = [...existingLocal, msg];
  setLocalMessages(dateKey, updatedLocal);

  // 2. Persist to Firestore under `users/{uid}/dailyChats/{dateKey}`
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    const parentPath = `users/${uid}/dailyChats/${dateKey}`;
    const msgPath = `users/${uid}/dailyChats/${dateKey}/messages/${msg.id}`;

    try {
      const snippet =
        summaryOverride ||
        (msg.sender === 'user'
          ? `Last query: ${msg.text.slice(0, 80)}`
          : msg.text.replace(/[#*_`]/g, '').slice(0, 90));

      const parentRef = doc(db, 'users', uid, 'dailyChats', dateKey);
      await setDoc(
        parentRef,
        cleanUndefined({
          dateKey,
          updatedAt: serverTimestamp(),
          summary: snippet
        }),
        { merge: true }
      );

      const msgRef = doc(db, 'users', uid, 'dailyChats', dateKey, 'messages', msg.id);
      await setDoc(msgRef, cleanUndefined(msg), { merge: true });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, msgPath);
      } catch (errInfo) {
        console.warn('Handled Firestore write exception in saveDailyChatMessage:', errInfo);
      }
    }
  }

  return msg;
}

/**
 * Lists available daily chat threads (combining recent 7 days and stored threads in Firestore).
 */
export async function getAvailableChatDates(): Promise<DailyChatThread[]> {
  const threadsMap = new Map<string, DailyChatThread>();

  // Always populate the last 7 days so the user can jump to recent days easily
  for (let i = 0; i < 7; i++) {
    const dk = getLocalDateString(-i);
    const localMsgs = getLocalMessages(dk);
    const lastMsg = localMsgs[localMsgs.length - 1];
    threadsMap.set(dk, {
      dateKey: dk,
      summary: lastMsg ? lastMsg.text.replace(/[#*_`]/g, '').slice(0, 60) : i === 0 ? "Today's Workspace" : 'No messages yet'
    });
  }

  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    try {
      const chatsCol = collection(db, 'users', uid, 'dailyChats');
      const snap = await getDocs(query(chatsCol, limitQuery(30)));
      snap.docs.forEach(d => {
        const data = d.data() as any;
        const dk = data.dateKey || d.id;
        if (dk) {
          threadsMap.set(dk, {
            dateKey: dk,
            summary: data.summary || 'Saved conversation'
          });
        }
      });
    } catch (err) {
      console.warn('getAvailableChatDates Firestore notice:', err);
    }
  }

  return Array.from(threadsMap.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

// ── High-Capacity Multi-Action Batch Execution Engine ─────────────────

export interface BatchCommandPayload {
  command: 'add_log' | 'add_plan' | 'schedule_revision' | 'update_log' | 'update_plan';
  date?: string;
  subject?: string;
  chapter?: string;
  topic?: string;
  sessionType?: SessionMode;
  activeMins?: number;
  studyMinutes?: number;
  practiceMins?: number;
  practiceMinutes?: number;
  checkingMins?: number;
  checkingMinutes?: number;
  distractionMins?: number;
  targetMins?: number;
  mcqCount?: number;
  questionsAttempted?: number;
  errors?: number;
  retentionScore?: number;
  notes?: string;
  planId?: string;
  logId?: string;
}

/**
 * Extracts all embedded JSON command blocks from an AI response.
 * Supports:
 * - Multiple `:::{ ... }:::` blocks (up to 8+ actions)
 * - Array block `:::[ { ... }, { ... } ]:::`
 * - Markdown code blocks ```json { "operations": [ ... ] } ```
 * - Naked JSON with `operations` or `commands` array
 */
export function extractEmbeddedCommands(rawText: string): {
  cleanedText: string;
  commands: BatchCommandPayload[];
} {
  const commands: BatchCommandPayload[] = [];
  let workingText = rawText;

  const tryPushParsed = (parsed: any) => {
    if (Array.isArray(parsed)) {
      parsed.forEach(item => {
        if (item && typeof item === 'object') {
          commands.push(item as BatchCommandPayload);
        }
      });
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.operations)) {
        parsed.operations.forEach((op: any) => commands.push(op));
      } else if (Array.isArray(parsed.commands)) {
        parsed.commands.forEach((op: any) => commands.push(op));
      } else if (parsed.command) {
        commands.push(parsed as BatchCommandPayload);
      }
    }
  };

  // 1. Triple-colon wrappers ::: ... :::
  const blockRegex = /:::([\s\S]*?):::/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(rawText)) !== null) {
    const rawJson = match[1].trim();
    if (!rawJson) continue;
    try {
      const parsed = JSON.parse(rawJson);
      tryPushParsed(parsed);
    } catch (err) {
      console.warn('Failed to parse ::: block:', err);
    }
  }
  workingText = workingText.replace(blockRegex, '');

  // 2. Markdown code blocks ```json ... ``` or ``` ... ```
  if (commands.length === 0) {
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
    let cbMatch: RegExpExecArray | null;
    while ((cbMatch = codeBlockRegex.exec(rawText)) !== null) {
      const blockContent = cbMatch[1].trim();
      if (blockContent.includes('"operations"') || blockContent.includes('"command"')) {
        try {
          const parsed = JSON.parse(blockContent);
          tryPushParsed(parsed);
          workingText = workingText.replace(cbMatch[0], '');
        } catch {}
      }
    }
  }

  // 3. Raw JSON object or array containing operations/command
  if (commands.length === 0) {
    const rawOpsMatch = rawText.match(/\{[\s\S]*?"operations"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/);
    if (rawOpsMatch) {
      try {
        const parsed = JSON.parse(rawOpsMatch[0]);
        tryPushParsed(parsed);
        workingText = workingText.replace(rawOpsMatch[0], '');
      } catch {}
    }
  }

  if (commands.length === 0) {
    const rawArrayMatch = rawText.match(/\[[\s\S]*?\{[\s\S]*?"command"[\s\S]*?\}[\s\S]*?\]/);
    if (rawArrayMatch) {
      try {
        const parsed = JSON.parse(rawArrayMatch[0]);
        tryPushParsed(parsed);
        workingText = workingText.replace(rawArrayMatch[0], '');
      } catch {}
    }
  }

  const cleanedText = workingText.trim();
  return { cleanedText, commands };
}

/**
 * Executes a batch of up to 8+ study log, plan, or revision commands in sequence,
 * performing UID Plan Linking automatically for every logged session.
 */
export async function executeBatchCommands(
  commands: BatchCommandPayload[],
  defaultSubjectId = 'bio',
  defaultDateKey = getLocalDateString(0)
): Promise<{
  operationsExecuted: ChatOperationRecord[];
  createdLogsCount: number;
  createdPlansCount: number;
  linkedPlansCount: number;
}> {
  const operationsExecuted: ChatOperationRecord[] = [];
  let createdLogsCount = 0;
  let createdPlansCount = 0;
  let linkedPlansCount = 0;

  for (const cmd of commands) {
    const subject = normalizeSubjectKey(cmd.subject || defaultSubjectId);
    const chapter = (cmd.chapter || cmd.topic || 'General Study').trim();
    const topic = (cmd.topic || cmd.chapter || chapter).trim();
    const targetDate = cmd.date ? parseNaturalDate(cmd.date) : defaultDateKey;

    if (cmd.command === 'add_log') {
      const studyMinutes = cmd.studyMinutes ?? cmd.activeMins ?? 30;
      const practiceMinutes = cmd.practiceMinutes ?? cmd.practiceMins ?? 0;
      const checkingMinutes = cmd.checkingMinutes ?? cmd.checkingMins ?? 0;

      const sessionInput: CreateSessionInput = {
        date: targetDate,
        planId: cmd.planId,
        subject,
        chapter,
        topic,
        sessionType: cmd.sessionType || 'Study',
        activeMins: studyMinutes,
        studyMinutes,
        practiceMins: practiceMinutes,
        practiceMinutes,
        checkingMins: checkingMinutes,
        checkingMinutes,
        distractionMins: cmd.distractionMins || 0,
        mcqCount: cmd.mcqCount,
        questionsAttempted: cmd.questionsAttempted ?? cmd.mcqCount,
        errors: cmd.errors,
        retentionScore: cmd.retentionScore || 5,
        notes: cmd.notes
      };

      const res = await createStudySession(sessionInput);
      if (res.success) {
        createdLogsCount++;
        if (res.matchedPlanId) linkedPlansCount++;
      }
      operationsExecuted.push({
        type: cmd.sessionType === 'Revise' ? 'revision' : 'log',
        subject,
        chapter,
        topic,
        status: res.success ? 'success' : 'failed'
      });
    } else if (cmd.command === 'add_plan') {
      const planInput: CreatePlanInput = {
        date: targetDate,
        subject,
        chapter,
        topic,
        sessionType: cmd.sessionType || 'Study',
        targetMins: cmd.targetMins || cmd.activeMins || 45,
        mcqCount: cmd.mcqCount
      };
      const res = await createPlannedSession(planInput);
      if (res.success) {
        createdPlansCount++;
      }
      operationsExecuted.push({
        type: cmd.sessionType === 'Revise' ? 'revision' : 'plan',
        subject,
        chapter,
        topic,
        status: res.success ? 'success' : 'failed'
      });
    } else if (cmd.command === 'schedule_revision') {
      const res = await scheduleAdaptiveRevisionToPlan(
        subject,
        topic,
        chapter,
        targetDate,
        cmd.targetMins || 30
      );
      if (res.success) {
        createdPlansCount++;
      }
      operationsExecuted.push({
        type: 'revision',
        subject,
        chapter,
        topic,
        status: res.success ? 'success' : 'failed'
      });
    } else if (cmd.command === 'update_log' && cmd.logId) {
      const res = await updateSession(cmd.logId, {
        subject,
        chapter,
        topic,
        activeMins: cmd.studyMinutes ?? cmd.activeMins,
        mcqCount: cmd.mcqCount,
        retentionScore: cmd.retentionScore,
        notes: cmd.notes
      });
      operationsExecuted.push({
        type: 'log',
        subject,
        chapter,
        topic,
        status: res.success ? 'success' : 'failed'
      });
    } else if (cmd.command === 'update_plan' && cmd.planId) {
      const res = await updatePlannedSession(targetDate, cmd.planId, {
        subject,
        chapter,
        topic,
        targetMins: cmd.targetMins,
        sessionType: cmd.sessionType
      });
      operationsExecuted.push({
        type: 'plan',
        subject,
        chapter,
        topic,
        status: res.success ? 'success' : 'failed'
      });
    }
  }

  return {
    operationsExecuted,
    createdLogsCount,
    createdPlansCount,
    linkedPlansCount
  };
}

/**
 * Intelligent deterministic pipeline that categorizes mixed multi-action requests
 * (e.g. Planning 3 sessions AND Logging 1 session in the same message) and extracts
 * structured operations even when offline or if the API key is not yet configured.
 */
export function categorizeAndExtractOperations(
  rawText: string,
  defaultSubjectId = 'bio',
  defaultDateKey = getLocalDateString(0)
): BatchCommandPayload[] {
  const operations: BatchCommandPayload[] = [];
  const text = rawText.trim();

  // Guard against questions or pure query statements
  const lower = text.toLowerCase();
  if (
    lower.startsWith('how many') ||
    lower.startsWith('what did') ||
    lower.startsWith('when did') ||
    lower.startsWith('show me') ||
    lower.startsWith('did i') ||
    lower.startsWith('have i')
  ) {
    return [];
  }

  // Detect Plan section vs Log section
  const planSectionMatch = text.match(
    /(?:^|\n+)(?:[^\n:]*\b(?:plan|schedule)\b[^\n:]*:?)([\s\S]*?)(?=(?:\n+[^\n:]*\b(?:log|studied|completed)\b[^\n:]*:?)|$)/i
  );
  const logSectionMatch = text.match(
    /(?:^|\n+)(?:[^\n:]*\b(?:log|studied|completed)\b[^\n:]*:?)([\s\S]*?)(?=(?:\n+[^\n:]*\b(?:plan|schedule)\b[^\n:]*:?)|$)/i
  );

  interface SectionTask {
    cmd: 'add_plan' | 'add_log';
    text: string;
  }

  const sectionsToProcess: SectionTask[] = [];
  if (planSectionMatch && logSectionMatch) {
    sectionsToProcess.push({ cmd: 'add_plan', text: planSectionMatch[1] || planSectionMatch[0] });
    sectionsToProcess.push({ cmd: 'add_log', text: logSectionMatch[1] || logSectionMatch[0] });
  } else {
    const isPlan = /\b(?:plan|schedule)\b/i.test(text);
    const isLog = /\b(?:log|completed|studied|done)\b/i.test(text);
    if (isPlan || isLog) {
      sectionsToProcess.push({
        cmd: isLog && !isPlan ? 'add_log' : 'add_plan',
        text
      });
    }
  }

  for (const sec of sectionsToProcess) {
    const secText = sec.text;
    const cmd = sec.cmd;

    // Determine baseline duration from section header or first duration clause (e.g. "duration will be 60 minutes")
    let defaultDuration = 45;
    const durMatch = secText.match(/(\d+)\s*(?:mins?|minutes?|hours?|hrs?)/i);
    if (durMatch) {
      let val = parseInt(durMatch[1], 10);
      if (/hours?|hrs?/i.test(durMatch[0])) val *= 60;
      defaultDuration = val;
    }

    // Identify subject anchors
    const subPattern =
      /(?:^|\n|[\s;.-])\b(biology|physics|chemistry|mathematics|math|english|bio|chem|phys)\b\s*[:\-–]/gi;
    const matches: { subject: string; index: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = subPattern.exec(secText)) !== null) {
      matches.push({ subject: m[1].toLowerCase(), index: m.index });
    }

    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const cur = matches[i];
        const startIdx = cur.index;
        const endIdx = i < matches.length - 1 ? matches[i + 1].index : secText.length;
        const block = secText.slice(startIdx, endIdx).trim();

        let subKey = cur.subject;
        if (subKey === 'biology') subKey = 'bio';
        if (subKey === 'physics') subKey = 'phys';
        if (subKey === 'chemistry') subKey = 'chem';
        if (subKey === 'mathematics') subKey = 'math';

        let mins = defaultDuration;
        const blockDur = block.match(/(\d+)\s*(?:mins?|minutes?|hours?|hrs?)/i);
        if (blockDur) {
          let val = parseInt(blockDur[1], 10);
          if (/hours?|hrs?/i.test(blockDur[0])) val *= 60;
          mins = val;
        }

        let retention: number | undefined;
        const retMatch = block.match(/(\d+)\s*(?:out of|\/)\s*10/i);
        if (retMatch) {
          retention = parseInt(retMatch[1], 10);
        }

        const cleanBlock = block.replace(/^[A-Za-z]+\s*[:\-–]\s*/i, '').trim();
        let chapter = '';
        let topic = '';

        const whereStudiedMatch = cleanBlock.match(
          /^(.*?)\s*,\s*where\s+(?:I\s+(?:will\s+be\s+studying|am\s+studying|studied|have\s+studied))\s+(.*)$/i
        );
        if (whereStudiedMatch) {
          chapter = whereStudiedMatch[1].trim();
          topic = whereStudiedMatch[2].trim();
        } else {
          const topicMatch = cleanBlock.match(
            /^(.*?)[.;]\s*(?:the\s+)?topic\s+(?:is(?:\s+going\s+to\s+be)?|=|\:)\s*(.*)$/i
          );
          if (topicMatch) {
            chapter = topicMatch[1].trim();
            topic = topicMatch[2].trim();
          } else {
            const studiedInBlock = cleanBlock.match(/where\s+I\s+(?:have\s+studied|studied)\s+([^.]+)/i);
            const firstComma = cleanBlock.match(/^([^,.]+)/);
            if (studiedInBlock && firstComma) {
              chapter = firstComma[1].trim();
              topic = studiedInBlock[1].trim();
            } else {
              const parts = cleanBlock.split(/[.;\n]/).map(p => p.trim()).filter(Boolean);
              chapter = parts[0] || 'General';
              topic = parts[1] || chapter;
            }
          }
        }

        // Clean conversational artifacts
        chapter = chapter
          .replace(/^(the usual,?\s*)/i, '')
          .replace(/\s*,\s*where\s+my\s+attention.*$/i, '')
          .replace(/[.;,]+$/, '')
          .trim();
        topic = topic
          .replace(/^(the usual,?\s*)/i, '')
          .replace(/^(?:the\s+)?topic\s+(?:is(?:\s+going\s+to\s+be)?|=|\:)\s*/i, '')
          .replace(/[.;,]+$/, '')
          .trim();

        operations.push({
          command: cmd,
          date: defaultDateKey,
          subject: subKey,
          chapter: chapter || topic || 'General Study',
          topic: topic || chapter || 'Study Topic',
          sessionType: 'Study',
          targetMins: cmd === 'add_plan' ? mins : undefined,
          studyMinutes: cmd === 'add_log' ? mins : undefined,
          activeMins: mins,
          retentionScore: retention,
          notes: cmd === 'add_log' ? block : undefined
        });
      }
    }
  }

  return operations;
}


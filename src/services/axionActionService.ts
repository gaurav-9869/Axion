import { nanoid } from 'nanoid';
import { 
  LogItem, 
  PlanItem, 
  SessionMode, 
  SubjectKey, 
  dynamicSubjects, 
  getLocalDateString, 
  getTotalStudyTime, 
  getFocusScore, 
  calculateNextReviewDate,
  deduplicateLogs,
  ShortcutItem,
  normalizeLogRecord
} from '../types';
import { 
  saveStudyLog, 
  getStudyLogs, 
  deleteStudyLog, 
  saveDailyPlan, 
  getDailyPlan, 
  getPlansForDateRange, 
  deleteDailyPlanItem,
  getShortcuts as dbGetShortcuts,
  deleteShortcut as dbDeleteShortcut,
  showToast
} from './dbService';
import { addChatShortcut } from './shortcutService';
import { parseNaturalDate, parseDateRange, formatDate } from '../utils/dateParser';
import { 
  generateAdaptiveRecommendations, 
  buildTopicHistories, 
  calculateAdaptiveInterval, 
  generateTopicKey,
  RevisionRecommendation 
} from '../lib/revision/revisionEngine';

// ── Types ─────────────────────────────────────────────────────────────

export interface SessionQueryFilters {
  date?: string;          // Specific YYYY-MM-DD or natural expression ('today', 'yesterday')
  startDate?: string;     // Range start
  endDate?: string;       // Range end
  subject?: string;       // e.g. 'phys', 'Physics'
  chapter?: string;       // Chapter name (matches log.chapter or log.topic)
  topic?: string;         // Topic name (matches log.topic or log.chapter)
  keyword?: string;       // Keyword search across chapter, topic, and notes
  sessionType?: SessionMode;
  minRetention?: number;
  minMins?: number;
  limit?: number;
}

export interface PlanQueryFilters {
  date?: string;
  startDate?: string;
  endDate?: string;
  subject?: string;
  chapter?: string;
  topic?: string;
  status?: 'pending' | 'completed';
}

export interface CreateSessionInput {
  timestamp?: number;
  date?: string;
  planId?: string;
  plannedSessionId?: string;
  subject: string;
  chapter?: string;       // Chapter name (e.g. Breathing and Exchange of Gases)
  topic?: string;         // Specific topic (e.g. Mechanism of Breathing)
  sessionType?: SessionMode;
  activeMins: number;
  studyMinutes?: number;
  practiceMins?: number;
  practiceMinutes?: number;
  checkingMins?: number;
  checkingMinutes?: number;
  distractionMins?: number;
  recoveryMins?: number;
  errors?: number;
  retentionScore?: number;
  mcqCount?: number;
  questionsAttempted?: number;
  startPage?: number;
  endPage?: number;
  notes?: string;
  frictionAnalysis?: string;
}

export interface CreatePlanInput {
  date?: string;          // Defaults to today if not provided
  subject: string;
  chapter?: string;       // Chapter name
  topic?: string;         // Specific topic
  sessionType?: SessionMode;
  targetMins?: number;
  targetUnits?: number;
  mcqCount?: number;
}

export interface DailySummaryResult {
  date: string;
  sessionCount: number;
  totalStudyMinutes: number; // Study + Practice + Checking
  activeMinutes: number;
  practiceMinutes: number;
  checkingMinutes: number;
  distractionMinutes: number;
  recoveryMinutes: number;
  overallFocusScore: number;
  totalQuestionsSolved: number;
  totalErrors: number;
  subjectBreakdown: Record<string, { minutes: number; sessionCount: number; questions: number }>;
  sessions: LogItem[];
  plannedCount: number;
  completedPlanCount: number;
  plans: PlanItem[];
  frictionsRecorded: string[];
}

// ── Subject Resolution Helper ─────────────────────────────────────────

export function normalizeSubjectKey(inputSubject: string | undefined): SubjectKey {
  if (!inputSubject) {
    return dynamicSubjects[0]?.id || 'bio';
  }
  const clean = inputSubject.trim().toLowerCase();
  
  // 1. Exact match against dynamic subject IDs or names
  const exact = dynamicSubjects.find(
    s => s.id.toLowerCase() === clean || s.name.toLowerCase() === clean
  );
  if (exact) return exact.id;

  // 2. Starts-with or inclusion match against configured subject names / IDs
  const partial = dynamicSubjects.find(
    s => s.id.toLowerCase().startsWith(clean) || 
         s.name.toLowerCase().startsWith(clean) ||
         clean.startsWith(s.id.toLowerCase()) ||
         clean.startsWith(s.name.toLowerCase()) ||
         clean.includes(s.name.toLowerCase()) ||
         clean.includes(s.id.toLowerCase())
  );
  if (partial) return partial.id;

  return clean;
}

// ── Query Operations ──────────────────────────────────────────────────

/**
 * Queries sessions with comprehensive filter capabilities
 */
export async function querySessions(filters: SessionQueryFilters = {}): Promise<LogItem[]> {
  const rawLogs = await getStudyLogs(500);
  const allLogs = deduplicateLogs(rawLogs);

  let targetStartDate = filters.startDate;
  let targetEndDate = filters.endDate;

  if (filters.date) {
    const parsed = parseNaturalDate(filters.date);
    targetStartDate = parsed;
    targetEndDate = parsed;
  }

  let filtered = allLogs.filter(log => {
    // Date filter (supports standardized dateKey or timestamp)
    if (targetStartDate || targetEndDate) {
      const logDate = log.dateKey || (log.timestamp ? formatDate(new Date(log.timestamp)) : getLocalDateString(0));
      if (targetStartDate && logDate < targetStartDate) return false;
      if (targetEndDate && logDate > targetEndDate) return false;
    }

    // Subject filter
    if (filters.subject) {
      const targetSub = normalizeSubjectKey(filters.subject);
      if (normalizeSubjectKey(log.subject) !== targetSub) return false;
    }

    // Chapter filter (matches log.chapter_lower, log.chapter, or log.topic)
    if (filters.chapter) {
      const c = filters.chapter.toLowerCase().trim();
      const topicMatches = (log.topic_lower || (log.topic || '').toLowerCase()).includes(c);
      const chapterMatches = (log.chapter_lower || (log.chapter || '').toLowerCase()).includes(c);
      if (!topicMatches && !chapterMatches) return false;
    }

    // Topic filter (matches log.topic or log.chapter)
    if (filters.topic) {
      const t = filters.topic.toLowerCase().trim();
      const topicMatches = (log.topic_lower || (log.topic || '').toLowerCase()).includes(t);
      const chapterMatches = (log.chapter_lower || (log.chapter || '').toLowerCase()).includes(t);
      if (!topicMatches && !chapterMatches) return false;
    }

    // Keyword filter across all text fields
    if (filters.keyword) {
      const k = filters.keyword.toLowerCase().trim();
      const match = (log.topic || '').toLowerCase().includes(k) ||
                    (log.chapter || '').toLowerCase().includes(k) ||
                    (log.notes || '').toLowerCase().includes(k) ||
                    (log.frictionAnalysis || '').toLowerCase().includes(k) ||
                    (log.subject || '').toLowerCase().includes(k);
      if (!match) return false;
    }

    // Session Type filter
    if (filters.sessionType && log.sessionType !== filters.sessionType) {
      return false;
    }

    // Retention filter
    if (filters.minRetention !== undefined) {
      if (log.retentionScore === undefined || log.retentionScore < filters.minRetention) return false;
    }

    // Duration filter
    if (filters.minMins !== undefined) {
      if (getTotalStudyTime(log) < filters.minMins) return false;
    }

    return true;
  });

  if (filters.limit && filters.limit > 0) {
    filtered = filtered.slice(0, filters.limit);
  }

  return filtered;
}

/**
 * Calculates a fully grounded daily summary with deterministic arithmetic
 */
export async function getDailySummary(dateInput?: string): Promise<DailySummaryResult> {
  const dateStr = dateInput ? parseNaturalDate(dateInput) : getLocalDateString(0);
  const logs = await querySessions({ date: dateStr });
  const plans = await getDailyPlan(dateStr);

  let totalStudyMins = 0;
  let activeMins = 0;
  let practiceMins = 0;
  let checkingMins = 0;
  let distractionMins = 0;
  let recoveryMins = 0;
  let totalQuestions = 0;
  let totalErrors = 0;
  const frictions: string[] = [];

  const subjectBreakdown: Record<string, { minutes: number; sessionCount: number; questions: number }> = {};

  logs.forEach(log => {
    if (log.isMissed) return;
    const studyTime = getTotalStudyTime(log);
    totalStudyMins += studyTime;
    activeMins += (log.activeMins || 0);
    practiceMins += (log.practiceMins || 0);
    checkingMins += (log.checkingMins || 0);
    distractionMins += (log.distractionMins || 0);
    recoveryMins += (log.recoveryMins || 0);

    const qs = (log.mcqCount || 0) + (log.vsaCount || 0) + (log.saCount || 0) + (log.laCount || 0);
    totalQuestions += qs;
    totalErrors += (log.errors || 0);

    if (log.frictionAnalysis && log.frictionAnalysis.trim()) {
      frictions.push(log.frictionAnalysis.trim());
    }

    const sub = normalizeSubjectKey(log.subject);
    if (!subjectBreakdown[sub]) {
      subjectBreakdown[sub] = { minutes: 0, sessionCount: 0, questions: 0 };
    }
    subjectBreakdown[sub].minutes += studyTime;
    subjectBreakdown[sub].sessionCount += 1;
    subjectBreakdown[sub].questions += qs;
  });

  const totalTrackedTime = activeMins + distractionMins + recoveryMins;
  const overallFocusScore = totalTrackedTime > 0 ? Math.round((activeMins / totalTrackedTime) * 100) : 0;
  const completedPlanCount = plans.filter(p => p.status === 'completed').length;

  return {
    date: dateStr,
    sessionCount: logs.length,
    totalStudyMinutes: totalStudyMins,
    activeMinutes: activeMins,
    practiceMinutes: practiceMins,
    checkingMinutes: checkingMins,
    distractionMinutes: distractionMins,
    recoveryMinutes: recoveryMins,
    overallFocusScore,
    totalQuestionsSolved: totalQuestions,
    totalErrors,
    subjectBreakdown,
    sessions: logs,
    plannedCount: plans.length,
    completedPlanCount,
    plans,
    frictionsRecorded: frictions
  };
}

/**
 * Queries planned tasks across a date or date range
 */
export async function queryPlannedSessions(filters: PlanQueryFilters = {}): Promise<{ date: string; items: PlanItem[] }[]> {
  let startDate = filters.startDate;
  let endDate = filters.endDate;

  if (filters.date) {
    const p = parseNaturalDate(filters.date);
    startDate = p;
    endDate = p;
  }

  if (!startDate) startDate = getLocalDateString(0);
  if (!endDate) endDate = getLocalDateString(7); // Next 7 days default

  const plansByDate = await getPlansForDateRange(startDate, endDate);
  const result: { date: string; items: PlanItem[] }[] = [];

  // Also include single date if missing from range map
  if (startDate === endDate && !plansByDate[startDate]) {
    const singlePlan = await getDailyPlan(startDate);
    plansByDate[startDate] = singlePlan;
  }

  for (const [date, items] of Object.entries(plansByDate)) {
    let filteredItems = items;
    if (filters.subject) {
      const targetSub = normalizeSubjectKey(filters.subject);
      filteredItems = filteredItems.filter(p => normalizeSubjectKey(p.subject) === targetSub);
    }
    if (filters.status) {
      filteredItems = filteredItems.filter(p => p.status === filters.status);
    }
    if (filteredItems.length > 0) {
      result.push({ date, items: filteredItems });
    }
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

// ── Mutation Operations ───────────────────────────────────────────────

/**
 * Creates or updates a study session record with automatic UID Plan Linking and standardized schema fields.
 * - Queries `users/{uid}/plans` for the target date matching subject and chapter/topic.
 * - If a matching planned session exists, attaches `plannedSessionId: plan.id` and marks `plan.status = "completed"`.
 * - If no matching plan exists, creates an independent completed log without fake placeholder plan IDs.
 */
export async function createStudySession(input: CreateSessionInput): Promise<{ success: boolean; log: LogItem; matchedPlanId?: string; error?: string }> {
  try {
    const subject = normalizeSubjectKey(input.subject);
    const resolvedChapter = input.chapter?.trim() || input.topic?.trim() || 'General Study Block';
    const resolvedTopic = input.topic?.trim() || input.chapter?.trim() || resolvedChapter;
    const timestamp = input.timestamp || (input.date ? new Date(`${parseNaturalDate(input.date)}T12:00:00`).getTime() : Date.now());
    const dateKey = input.date ? parseNaturalDate(input.date) : getLocalDateString(0, new Date(timestamp));
    const sessionType = input.sessionType || 'Study';

    const studyMinutes = Math.max(0, input.studyMinutes ?? input.activeMins ?? 0);
    const practiceMinutes = Math.max(0, input.practiceMinutes ?? input.practiceMins ?? 0);
    const checkingMinutes = Math.max(0, input.checkingMinutes ?? input.checkingMins ?? 0);
    const totalMinutes = studyMinutes + practiceMinutes + checkingMinutes;
    const distractionMins = Math.max(0, input.distractionMins || 0);
    const recoveryMins = Math.max(0, input.recoveryMins || 0);

    // 1. UID Plan Linking: Check explicit planId or match against today's planned sessions
    let resolvedPlanId: string | undefined = input.plannedSessionId || input.planId || undefined;
    let plansForDay: PlanItem[] = [];
    try {
      plansForDay = await getDailyPlan(dateKey);
    } catch {
      plansForDay = [];
    }

    if (!resolvedPlanId && plansForDay.length > 0) {
      const chapLower = resolvedChapter.toLowerCase();
      const topLower = resolvedTopic.toLowerCase();
      const targetKey = generateTopicKey(subject, resolvedTopic, resolvedChapter);

      // Prefer pending plan matching subject + chapter/topic
      const matchingPlan = plansForDay.find(p => {
        if (normalizeSubjectKey(p.subject) !== subject) return false;
        const pChap = (p.chapter || p.topic || '').trim().toLowerCase();
        const pTop = (p.topic || p.chapter || '').trim().toLowerCase();
        const pKey = generateTopicKey(p.subject, p.topic, p.chapter);
        return (
          p.status !== 'completed' &&
          (pKey === targetKey ||
            pChap === chapLower ||
            pTop === chapLower ||
            pChap === topLower ||
            pTop === topLower ||
            (pChap && chapLower.includes(pChap)) ||
            (pTop && chapLower.includes(pTop)))
        );
      });

      if (matchingPlan && matchingPlan.id) {
        resolvedPlanId = matchingPlan.id;
      }
    }

    const existingLogs = await getStudyLogs(300);
    let targetId = nanoid();
    let isUpdate = false;

    if (resolvedPlanId) {
      const existingForPlan = existingLogs.find(
        l => (l.plannedSessionId || l.planId) === resolvedPlanId
      );
      if (existingForPlan) {
        targetId = existingForPlan.id;
        isUpdate = true;
      }
    }

    const mcqVal = input.mcqCount !== undefined && input.mcqCount > 0 ? Math.max(0, input.mcqCount) : undefined;
    const questionsVal =
      input.questionsAttempted !== undefined && input.questionsAttempted > 0
        ? Math.max(0, input.questionsAttempted)
        : mcqVal;

    const rawLogRecord: LogItem = {
      id: targetId,
      planId: resolvedPlanId,
      plannedSessionId: resolvedPlanId,
      dateKey,
      timestamp,
      subject,
      subject_lower: subject.toLowerCase(),
      chapter: resolvedChapter,
      chapter_lower: resolvedChapter.toLowerCase(),
      topic: resolvedTopic,
      topic_lower: resolvedTopic.toLowerCase(),
      sessionType,
      activeMins: studyMinutes,
      practiceMins: practiceMinutes > 0 ? practiceMinutes : undefined,
      checkingMins: checkingMinutes > 0 ? checkingMinutes : undefined,
      studyMinutes,
      practiceMinutes,
      checkingMinutes,
      totalMinutes,
      distractionMins,
      recoveryMins,
      errors: input.errors !== undefined ? Math.max(0, input.errors) : undefined,
      retentionScore: input.retentionScore !== undefined ? Math.min(10, Math.max(1, input.retentionScore)) : 5,
      mcqCount: mcqVal,
      questionsAttempted: questionsVal,
      startPage: input.startPage,
      endPage: input.endPage,
      notes: input.notes?.trim() || '',
      frictionAnalysis: input.frictionAnalysis?.trim() || undefined,
      synced: false
    };

    const logRecord = normalizeLogRecord(rawLogRecord);
    logRecord.nextReviewDate = calculateNextReviewDate(logRecord, existingLogs);

    await saveStudyLog(logRecord);

    // If linked to a planned session, mark the plan item as completed
    if (resolvedPlanId) {
      try {
        const plans = plansForDay.length > 0 ? plansForDay : await getDailyPlan(dateKey);
        const planIdx = plans.findIndex(p => p.id === resolvedPlanId);
        if (planIdx >= 0 && plans[planIdx].status !== 'completed') {
          plans[planIdx] = { ...plans[planIdx], status: 'completed' };
          await saveDailyPlan(dateKey, plans);
          window.dispatchEvent(new CustomEvent('axion-plan-updated', { detail: { date: dateKey, plan: plans[planIdx] } }));
        }
      } catch (err) {
        console.warn("Failed to mark plan as completed in createStudySession:", err);
      }
    }

    // Emit event for real-time reactivity across all UI tabs
    const eventName = isUpdate ? 'axion-log-updated' : 'axion-log-created';
    window.dispatchEvent(new CustomEvent(eventName, { detail: { log: logRecord } }));

    return { success: true, log: logRecord, matchedPlanId: resolvedPlanId };
  } catch (err: any) {
    console.error("createStudySession error:", err);
    return { success: false, log: null as any, error: err.message || String(err) };
  }
}

/**
 * Creates and persists a single planned session
 */
export async function createPlannedSession(input: CreatePlanInput): Promise<{ success: boolean; date: string; plan: PlanItem; error?: string }> {
  try {
    const targetDate = input.date ? parseNaturalDate(input.date) : getLocalDateString(0);
    const subject = normalizeSubjectKey(input.subject);
    const resolvedChapter = input.chapter?.trim() || input.topic?.trim() || 'Scheduled Study Block';
    const resolvedTopic = input.topic?.trim() || input.chapter?.trim() || 'General Concept';
    const sessionType: SessionMode = input.sessionType || 'Study';
    const targetMins = Math.max(5, input.targetMins || 45);

    const newPlanItem: PlanItem = {
      id: nanoid(),
      timestamp: Date.now(),
      subject,
      chapter: resolvedChapter,
      topic: resolvedTopic,
      sessionType,
      targetMins,
      targetUnits: input.targetUnits || 0,
      mcqCount: input.mcqCount || 0,
      status: 'pending'
    };

    const currentPlans = await getDailyPlan(targetDate);
    const updatedPlans = [...currentPlans, newPlanItem];
    await saveDailyPlan(targetDate, updatedPlans);

    window.dispatchEvent(new CustomEvent('axion-plan-created', { detail: { date: targetDate, plan: newPlanItem } }));

    return { success: true, date: targetDate, plan: newPlanItem };
  } catch (err: any) {
    console.error("createPlannedSession error:", err);
    return { success: false, date: '', plan: null as any, error: err.message || String(err) };
  }
}

/**
 * Creates multiple planned sessions across dates with independent validation
 */
export async function createMultiplePlans(plans: CreatePlanInput[]): Promise<{
  totalRequested: number;
  createdCount: number;
  failedCount: number;
  results: { success: boolean; date: string; plan?: PlanItem; error?: string }[];
}> {
  const results: { success: boolean; date: string; plan?: PlanItem; error?: string }[] = [];
  let createdCount = 0;
  let failedCount = 0;

  for (const p of plans) {
    const res = await createPlannedSession(p);
    if (res.success) {
      createdCount++;
      results.push({ success: true, date: res.date, plan: res.plan });
    } else {
      failedCount++;
      results.push({ success: false, date: p.date || '', error: res.error });
    }
  }

  return {
    totalRequested: plans.length,
    createdCount,
    failedCount,
    results
  };
}

/**
 * Updates an existing study session preserving all other fields
 */
export async function updateSession(logId: string, updates: Partial<LogItem>): Promise<{ success: boolean; log?: LogItem; error?: string }> {
  try {
    const allLogs = await getStudyLogs(100);
    const existing = allLogs.find(l => l.id === logId);

    if (!existing) {
      return { success: false, error: `Session with ID "${logId}" was not found.` };
    }

    const updatedLog: LogItem = {
      ...existing,
      ...updates,
      id: existing.id, // Preserve ID
      timestamp: updates.timestamp || existing.timestamp || Date.now()
    };

    if (updates.subject) {
      updatedLog.subject = normalizeSubjectKey(updates.subject);
    }

    // Recompute review date if relevant study metrics changed
    if (updates.sessionType || updates.retentionScore || updates.checkingMins || updates.practiceMins || updates.errors) {
      updatedLog.nextReviewDate = calculateNextReviewDate(updatedLog, allLogs);
    }

    await saveStudyLog(updatedLog);
    window.dispatchEvent(new CustomEvent('axion-log-updated', { detail: { log: updatedLog } }));

    return { success: true, log: updatedLog };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Updates a planned session on a specific date
 */
export async function updatePlannedSession(date: string, planId: string, updates: Partial<PlanItem>): Promise<{ success: boolean; plan?: PlanItem; error?: string }> {
  try {
    const targetDate = parseNaturalDate(date);
    const currentPlans = await getDailyPlan(targetDate);
    const itemIndex = currentPlans.findIndex(p => p.id === planId);

    if (itemIndex === -1) {
      return { success: false, error: `Planned task with ID "${planId}" was not found on ${targetDate}.` };
    }

    const updatedItem: PlanItem = {
      ...currentPlans[itemIndex],
      ...updates,
      id: currentPlans[itemIndex].id
    };

    if (updates.subject) {
      updatedItem.subject = normalizeSubjectKey(updates.subject);
    }

    currentPlans[itemIndex] = updatedItem;
    await saveDailyPlan(targetDate, currentPlans);
    window.dispatchEvent(new CustomEvent('axion-plan-updated', { detail: { date: targetDate, plan: updatedItem } }));

    return { success: true, plan: updatedItem };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Finds matching sessions for safe deletion with ambiguity detection
 */
export async function findMatchingSessions(criteria: { date?: string; subject?: string; keyword?: string }): Promise<LogItem[]> {
  const filters: SessionQueryFilters = {};
  if (criteria.date) filters.date = criteria.date;
  if (criteria.subject) filters.subject = criteria.subject;
  if (criteria.keyword) filters.chapter = criteria.keyword;

  return await querySessions(filters);
}

/**
 * Finds matching plans for safe deletion with ambiguity detection
 */
export async function findMatchingPlans(criteria: { date?: string; subject?: string; keyword?: string }): Promise<{ date: string; plan: PlanItem }[]> {
  const targetDate = criteria.date ? parseNaturalDate(criteria.date) : getLocalDateString(0);
  const plans = await getDailyPlan(targetDate);
  const matches: { date: string; plan: PlanItem }[] = [];

  plans.forEach(p => {
    let match = true;
    if (criteria.subject && normalizeSubjectKey(p.subject) !== normalizeSubjectKey(criteria.subject)) {
      match = false;
    }
    if (criteria.keyword) {
      const kw = criteria.keyword.toLowerCase();
      const topicMatches = (p.topic || '').toLowerCase().includes(kw);
      const chapterMatches = (p.chapter || '').toLowerCase().includes(kw);
      if (!topicMatches && !chapterMatches) match = false;
    }
    if (match) {
      matches.push({ date: targetDate, plan: p });
    }
  });

  return matches;
}

/**
 * Deletes a session by log ID
 */
export async function deleteSession(logId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await deleteStudyLog(logId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Deletes a planned session by date and plan ID
 */
export async function deletePlannedSession(date: string, planId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const targetDate = parseNaturalDate(date);
    const deleted = await deleteDailyPlanItem(targetDate, planId);
    if (!deleted) {
      return { success: false, error: `Plan item "${planId}" not found on ${targetDate}.` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

// ── Shortcuts Helpers ─────────────────────────────────────────────────

export async function getShortcuts(): Promise<ShortcutItem[]> {
  return await dbGetShortcuts();
}

export async function createShortcut(label: string, prompt: string, symbol?: string): Promise<ShortcutItem> {
  const { shortcut } = await addChatShortcut({
    label,
    promptTemplate: prompt,
    symbol: symbol || '⚡'
  });
  return shortcut;
}

export async function deleteShortcut(shortcutId: string): Promise<void> {
  await dbDeleteShortcut(shortcutId);
}

/**
 * Retrieves deterministic adaptive revision recommendations across all historical study logs
 */
export async function getAdaptiveRevisionRecommendations(referenceDate?: string): Promise<RevisionRecommendation[]> {
  const allLogs = await getStudyLogs(500);
  return generateAdaptiveRecommendations(allLogs, referenceDate);
}

/**
 * Schedules a revision session to the user's daily plan based on topic key or criteria
 */
export async function scheduleAdaptiveRevisionToPlan(
  subject: string,
  topic: string,
  chapter?: string,
  targetDate?: string,
  targetMins?: number
): Promise<{ success: boolean; planItem?: PlanItem; message?: string }> {
  const parsedDate = targetDate ? parseNaturalDate(targetDate) : getLocalDateString(0);
  const normalizedSubject = normalizeSubjectKey(subject);

  const newPlanItem: PlanItem = {
    id: nanoid(),
    timestamp: Date.now(),
    subject: normalizedSubject,
    topic: topic.trim(),
    chapter: chapter?.trim() || undefined,
    sessionType: 'Revise',
    isScheduledRevision: true,
    targetMins: targetMins || 30,
    status: 'pending'
  };

  const currentPlans = await getDailyPlan(parsedDate);
  const targetKey = generateTopicKey(normalizedSubject, topic, chapter);
  const alreadyExists = currentPlans.some(
    p => generateTopicKey(p.subject, p.topic, p.chapter) === targetKey &&
         p.sessionType === 'Revise'
  );

  if (alreadyExists) {
    return {
      success: false,
      message: `Revision for "${topic}" already exists in the plan for ${parsedDate}.`
    };
  }

  const updatedPlans = [...currentPlans, newPlanItem];
  await saveDailyPlan(parsedDate, updatedPlans);

  return {
    success: true,
    planItem: newPlanItem,
    message: `Scheduled revision for "${topic}" (${normalizedSubject.toUpperCase()}) on ${parsedDate}.`
  };
}

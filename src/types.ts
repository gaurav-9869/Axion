export type SubjectKey = string;
export type SessionMode = 'Study' | 'Revise' | 'Exercise';

export interface PlanItem {
  id: string;
  subject: SubjectKey;
  topic: string;
  sessionType: SessionMode;
  targetUnits?: number; // pages or questions
  targetMins: number;
  status: 'pending' | 'completed';
  timestamp?: number;
  chapter?: string;
  mcqCount?: number;
  isScheduledRevision?: boolean;
}

export interface LogItem {
  id: string;
  planId?: string;
  plannedSessionId?: string; // Standardized UID plan linkage
  dateKey?: string; // Standardized YYYY-MM-DD local date string
  subject: SubjectKey;
  subject_lower?: string; // Lowercase normalized subject search field
  topic: string;
  topic_lower?: string;
  chapter?: string;
  chapter_lower?: string; // Lowercase normalized chapter search field
  sessionType: SessionMode;
  revisionType?: string; // "Quick Recap", "Standard Review", "Deep Dive"
  activeMins: number;
  distractionMins: number;
  recoveryMins: number;
  checkingMins?: number; // Legacy field for Exercise and Study
  practiceMins?: number; // Legacy field for Study
  // Standardized dedicated metric buckets
  studyMinutes?: number;
  practiceMinutes?: number;
  checkingMinutes?: number;
  totalMinutes?: number; // studyMinutes + practiceMinutes + checkingMinutes
  errors?: number; // For Exercise and Study
  retentionScore?: number; // 1 to 10 (Used across Study, Revise, and Exercise sessions to adaptively determine next review)
  startPage?: number;
  endPage?: number;
  vsaCount?: number;
  saCount?: number;
  laCount?: number;
  mcqCount?: number;
  questionsAttempted?: number; // Recorded only when questions were actually solved (> 0)
  notes: string;
  frictionAnalysis?: string; // Explicitly records bottleneck items
  tinyWin?: string; // Optional: one small change / next session intention
  scratchpadImage?: string; // Captures and retains full-screen Base64 canvas drawings
  systemRefinement?: string; // Experimental changes to study system
  systemRefinementWorks?: boolean; // Evaluated during Sunday Loop
  isMissed?: boolean;
  synced?: boolean;
  nextReviewDate?: string; // Calculated SR date
  timestamp?: number;
}

export interface ArchiveState {
  logs: Record<string, LogItem[]>; // Keyed by date
  systemRefinements: LogItem[]; // Quick access to logs with system Refinements
}

export interface SubjectPreference {
  id: string;
  name: string;
  color: string;
  bg: string;
  text: string;
  border: string;
}

export interface UserSettings {
  name: string;
  className: string;
  activeSubjects: SubjectKey[];
  subjectGoals: Record<string, string>;
  subjectPageTotals: Record<string, number>;
  uiSounds?: boolean; // Total syllabus pages per subject
  customWallpaper?: string;
}

export interface SubjectConfig {
  name: string;
  color: string;
  bg: string;
  text: string;
  border: string;
}

// Data models for the pre-made charts and Gemini context summary processing
export interface TimeBlockMetrics {
  morning: number;
  afternoon: number;
  evening: number;
  night: number;
}

export interface AnalysisInsights {
  frictionSpotlight: string;
  trendCalibration: string;
  retentionAlerts: string;
  lastUpdated: string;
}

export const PRESET_COLORS = [
  { name: 'Emerald', hex: '#10B981', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  { name: 'Blue', hex: '#3B82F6', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  { name: 'Amber', hex: '#F59E0B', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  { name: 'Pink', hex: '#EC4899', bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30' },
  { name: 'Violet', hex: '#8B5CF6', bg: 'bg-violet-500/20', text: 'text-violet-400', border: 'border-violet-500/30' },
  { name: 'Red', hex: '#EF4444', bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  { name: 'Cyan', hex: '#06B6D4', bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  { name: 'Orange', hex: '#F97316', bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  { name: 'Slate', hex: '#64748B', bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/30' },
];

export let dynamicSubjects: SubjectPreference[] = [
  { id: 'bio', name: 'Biology', color: '#10B981', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  { id: 'phys', name: 'Physics', color: '#3B82F6', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  { id: 'chem', name: 'Chemistry', color: '#F59E0B', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  { id: 'math', name: 'Mathematics', color: '#EC4899', bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30' }
];

export function setDynamicSubjects(subjects: SubjectPreference[]) {
  dynamicSubjects = subjects;
}

// 100% Fail-Safe Subject Configuration Engine
export function getSubjectConfig(sub: string | undefined): SubjectConfig {
  if (!sub) {
    return {
      name: 'General Study',
      color: '#64748b',
      bg: 'bg-slate-500/20',
      text: 'text-slate-400',
      border: 'border-slate-500/30'
    };
  }

  const found = dynamicSubjects.find(s => s.id === sub || s.name.toLowerCase() === sub.toLowerCase());
  if (found) {
    return {
      name: found.name,
      color: found.color,
      bg: found.bg || 'bg-slate-500/20',
      text: found.text || 'text-slate-400',
      border: found.border || 'border-slate-500/30'
    };
  }

  // Safe fallback
  return {
    name: sub.charAt(0).toUpperCase() + sub.slice(1),
    color: '#64748b',
    bg: 'bg-slate-500/20',
    text: 'text-slate-400',
    border: 'border-slate-500/30'
  };
}

export function getLocalDateString(offsetDays = 0, baseDate?: Date): string {
  const d = (baseDate && !isNaN(baseDate.getTime())) ? new Date(baseDate.getTime()) : new Date();
  if (offsetDays !== 0) {
    d.setDate(d.getDate() + offsetDays);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getTotalStudyTime(log: LogItem): number {
  if (log.isMissed) return 0;
  if (typeof log.totalMinutes === 'number' && log.totalMinutes > 0) {
    return log.totalMinutes;
  }
  const studyM = log.studyMinutes ?? log.activeMins ?? 0;
  const practiceM = log.practiceMinutes ?? log.practiceMins ?? 0;
  const checkingM = log.checkingMinutes ?? log.checkingMins ?? 0;
  return studyM + practiceM + checkingM;
}

export function getFocusScore(log: LogItem): number {
  if (log.isMissed) return 0;
  const active = log.studyMinutes ?? log.activeMins ?? 0;
  const total = active + (log.distractionMins || 0) + (log.recoveryMins || 0);
  if (total === 0) return 0;
  const ratio = active / total;
  return Math.round(ratio * 100);
}

/**
 * Standardizes a LogItem prior to Firestore persistence or runtime indexing:
 * - Ensures distinct string fields for chapter and topic
 * - Computes chapter_lower and subject_lower
 * - Populates dateKey ("YYYY-MM-DD") and numeric timestamp
 * - Populates studyMinutes, practiceMinutes, checkingMinutes, totalMinutes
 * - Records mcqCount and questionsAttempted only when questions were actually solved (> 0)
 * - Synchronizes plannedSessionId and planId
 */
export function normalizeLogRecord(log: LogItem): LogItem {
  const rawTs: any = log.timestamp;
  let tsMillis = Date.now();
  if (typeof rawTs === 'number' && !isNaN(rawTs)) {
    tsMillis = rawTs;
  } else if (rawTs && typeof rawTs.toMillis === 'function') {
    tsMillis = rawTs.toMillis();
  } else if (rawTs && typeof rawTs.seconds === 'number') {
    tsMillis = rawTs.seconds * 1000;
  } else if (typeof rawTs === 'string') {
    const parsed = Date.parse(rawTs);
    if (!isNaN(parsed)) tsMillis = parsed;
  }

  const d = new Date(tsMillis);
  const safeDate = !isNaN(d.getTime()) ? d : new Date();
  const dateKey = (log.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(log.dateKey))
    ? log.dateKey
    : getLocalDateString(0, safeDate);
  const chapterStr = (log.chapter || log.topic || 'General Study').trim();
  const topicStr = (log.topic || log.chapter || 'General Study').trim();
  const subjectStr = (log.subject || 'bio').trim();

  const studyMinutes = Math.max(0, Number(log.studyMinutes ?? log.activeMins ?? 0) || 0);
  const practiceMinutes = Math.max(0, Number(log.practiceMinutes ?? log.practiceMins ?? 0) || 0);
  const checkingMinutes = Math.max(0, Number(log.checkingMinutes ?? log.checkingMins ?? 0) || 0);
  const totalMinutes = studyMinutes + practiceMinutes + checkingMinutes;

  const mcqVal = Number(log.mcqCount || 0);
  const vsaVal = Number(log.vsaCount || 0);
  const saVal = Number(log.saCount || 0);
  const laVal = Number(log.laCount || 0);
  const computedQuestions = mcqVal + vsaVal + saVal + laVal;
  const rawAttempted = Number(log.questionsAttempted || 0);
  const finalQuestionsAttempted = rawAttempted > 0 ? rawAttempted : (computedQuestions > 0 ? computedQuestions : undefined);
  const finalMcqCount = mcqVal > 0 ? mcqVal : undefined;

  const linkedPlanId = log.plannedSessionId || log.planId || undefined;

  return {
    ...log,
    timestamp: tsMillis,
    dateKey,
    subject: subjectStr,
    subject_lower: subjectStr.toLowerCase(),
    chapter: chapterStr,
    chapter_lower: chapterStr.toLowerCase(),
    topic: topicStr,
    topic_lower: topicStr.toLowerCase(),
    planId: linkedPlanId,
    plannedSessionId: linkedPlanId,
    activeMins: studyMinutes,
    practiceMins: practiceMinutes > 0 ? practiceMinutes : undefined,
    checkingMins: checkingMinutes > 0 ? checkingMinutes : undefined,
    studyMinutes,
    practiceMinutes,
    checkingMinutes,
    totalMinutes,
    mcqCount: finalMcqCount,
    questionsAttempted: finalQuestionsAttempted
  };
}

import { 
  generateAdaptiveRecommendations, 
  buildTopicHistories, 
  calculateAdaptiveInterval,
  generateTopicKey,
  SPACED_REPETITION_CONFIG 
} from './lib/revision/revisionEngine';

/**
 * Deduplicates an array of study logs based on session identity invariants:
 * 1. LogItem.id is the primary unique identifier of a log.
 * 2. LogItem.planId / LogItem.plannedSessionId is the unique identifier linking a log to its underlying planned session (PlanItem.id).
 * 3. Multiple logs sharing the same planId represent the same underlying study event and are deduplicated,
 *    preserving the most complete/latest non-missed record.
 * 4. Unplanned sessions (no planId) are uniquely identified by their distinct LogItem.id.
 */
export function deduplicateLogs(logs: LogItem[]): LogItem[] {
  if (!logs || !Array.isArray(logs) || logs.length <= 1) {
    return logs || [];
  }

  const seenIds = new Set<string>();
  const planIdToLogIndex = new Map<string, number>();
  const result: LogItem[] = [];

  for (const log of logs) {
    if (!log) continue;
    const effectivePlanId = log.plannedSessionId || log.planId;

    // If log has planId, check if we already have a log for this planned session
    if (effectivePlanId) {
      if (planIdToLogIndex.has(effectivePlanId)) {
        const existingIdx = planIdToLogIndex.get(effectivePlanId)!;
        const existing = result[existingIdx];
        // Prefer non-missed over missed, or the log with more study time / later timestamp
        const existingTotalTime = getTotalStudyTime(existing);
        const newTotalTime = getTotalStudyTime(log);
        const shouldReplace = 
          (existing.isMissed && !log.isMissed) ||
          (!existing.isMissed && !log.isMissed && newTotalTime >= existingTotalTime) ||
          (existing.isMissed && log.isMissed && (log.timestamp || 0) >= (existing.timestamp || 0));

        if (shouldReplace) {
          result[existingIdx] = log;
          if (existing.id) seenIds.delete(existing.id);
          if (log.id) seenIds.add(log.id);
        }
        continue;
      }
    }

    // Check by LogItem.id
    if (log.id) {
      if (seenIds.has(log.id)) {
        continue;
      }
      seenIds.add(log.id);
    }

    const index = result.length;
    result.push(log);
    if (effectivePlanId) {
      planIdToLogIndex.set(effectivePlanId, index);
    }
  }

  return result;
}

/**
 * Safely inspects logs for legacy duplicate records and returns details without deleting them automatically.
 */
export function detectDuplicateLogs(logs: LogItem[]): {
  duplicateCount: number;
  duplicatePlanIds: string[];
  duplicateLogIds: string[];
} {
  const planIdCounts = new Map<string, number>();
  const logIdCounts = new Map<string, number>();

  for (const log of logs) {
    const pId = log.plannedSessionId || log.planId;
    if (pId) {
      planIdCounts.set(pId, (planIdCounts.get(pId) || 0) + 1);
    }
    if (log.id) {
      logIdCounts.set(log.id, (logIdCounts.get(log.id) || 0) + 1);
    }
  }

  const duplicatePlanIds = Array.from(planIdCounts.entries()).filter(([_, c]) => c > 1).map(([id]) => id);
  const duplicateLogIds = Array.from(logIdCounts.entries()).filter(([_, c]) => c > 1).map(([id]) => id);

  return {
    duplicateCount: duplicatePlanIds.length + duplicateLogIds.length,
    duplicatePlanIds,
    duplicateLogIds
  };
}

export function calculateNextReviewDate(log: LogItem, allLogs?: LogItem[]): string {
  const baseDate = log.timestamp ? new Date(log.timestamp) : new Date();
  const logPlanId = log.plannedSessionId || log.planId;

  // Deduplicate and combine logs ensuring the current session is not counted twice
  let combined: LogItem[] = [log];
  if (allLogs && Array.isArray(allLogs) && allLogs.length > 0) {
    const existingIndex = allLogs.findIndex(l => {
      const lPlanId = l.plannedSessionId || l.planId;
      return (log.id && l.id === log.id) || (logPlanId && lPlanId && lPlanId === logPlanId);
    });
    combined = existingIndex >= 0
      ? allLogs.map((l, i) => (i === existingIndex ? log : l))
      : [...allLogs, log];
  }

  const deduplicated = deduplicateLogs(combined);
  const histories = buildTopicHistories(deduplicated);
  const key = generateTopicKey(log.subject, log.topic, log.chapter);
  const summary = histories.get(key);

  if (summary) {
    const { intervalDays } = calculateAdaptiveInterval(summary);
    return getLocalDateString(intervalDays, baseDate);
  }

  return getLocalDateString(SPACED_REPETITION_CONFIG.initialStudyIntervalDays, baseDate);
}

export interface ChatShortcut {
  id: string;
  label: string;          // e.g. "Focus Advice", "Plan Tomorrow"
  symbol: string;         // e.g. "🎯", "📅", "📝", "⚡"
  promptTemplate: string; // The text injected or auto-sent
  order: number;
  isSystemDefault?: boolean;
  // Backwards compatibility fields
  prompt: string;
  icon?: string;
  timestamp?: number;
}

export type ShortcutItem = ChatShortcut;

export interface ChatOperationRecord {
  type: 'plan' | 'log' | 'revision';
  subject: string;
  chapter: string;
  topic?: string;
  status: 'success' | 'failed';
}

export interface DailyChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  operationsExecuted?: ChatOperationRecord[];
  diagramData?: {
    title: string;
    type: 'flow' | 'cycle' | 'comparison' | 'hierarchy';
    steps: { label: string; desc: string; icon?: string }[];
    svgCode?: string;
  };
  archived?: boolean;
}

export interface DailyChatThread {
  dateKey: string;
  updatedAt?: number;
  summary: string;
}



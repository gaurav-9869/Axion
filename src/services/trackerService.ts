import { nanoid } from 'nanoid';
import {
  PlanItem,
  LogItem,
  SubjectKey,
  SessionMode,
  getLocalDateString,
  getFocusScore,
  getTotalStudyTime,
  calculateNextReviewDate,
  normalizeLogRecord
} from '../types';
import { saveStudyLog, saveDailyPlan } from './dbService';
import { calculateNextReview } from './revisionService';

export interface TrackerMetrics {
  totalStudyMinutes: number;
  formattedTotalTime: string;
  totalPlanned: number;
  completedPlanned: number;
  progressPercent: number;
  averageFocus: number;
  revisionDueCount: number;
  streakDays: number;
}

export interface TrackerShortcut {
  id: string;
  label: string;
  subject: SubjectKey;
  mode: SessionMode;
  targetMins: number;
  mcqCount?: number;
}

export interface InPlaceSessionInput {
  planId?: string;
  dateStr: string;
  subject: SubjectKey;
  topic: string;
  chapter?: string;
  sessionType: SessionMode;
  activeMins: number;
  distractionMins?: number;
  recoveryMins?: number;
  checkingMins?: number;
  practiceMins?: number;
  startPage?: number;
  endPage?: number;
  mcqCount?: number;
  vsaCount?: number;
  saCount?: number;
  laCount?: number;
  errors?: number;
  retentionScore: number;
  notes?: string;
  frictionAnalysis?: string;
  scratchpadImage?: string;
}

export const DEFAULT_TRACKER_SHORTCUTS: TrackerShortcut[] = [
  { id: 'sc-1', label: '+ Physics Sprint', subject: 'phys', mode: 'Revise', targetMins: 30, mcqCount: 25 },
  { id: 'sc-2', label: '+ Chemistry Core', subject: 'chem', mode: 'Study', targetMins: 45 },
  { id: 'sc-3', label: '+ Math Proofs', subject: 'math', mode: 'Exercise', targetMins: 45, mcqCount: 20 },
  { id: 'sc-4', label: '+ Biology Recall', subject: 'bio', mode: 'Revise', targetMins: 30 }
];

/**
 * Calculates real-time tracker operational metrics for a selected day.
 */
export function calculateTrackerMetrics(
  plan: PlanItem[],
  logs: LogItem[],
  dateStr: string = getLocalDateString(0)
): TrackerMetrics {
  // Filter logs for the target date
  const dayLogs = filterLogsByDate(logs, dateStr).filter(l => !l.isMissed);

  const totalStudyMinutes = dayLogs.reduce((acc, l) => acc + getTotalStudyTime(l), 0);
  const hrs = Math.floor(totalStudyMinutes / 60);
  const mins = totalStudyMinutes % 60;
  const formattedTotalTime = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

  const totalPlanned = plan.length;
  const completedPlanned = plan.filter(p => p.status === 'completed').length;
  const progressPercent = totalPlanned === 0 ? 0 : Math.round((completedPlanned / totalPlanned) * 100);

  const averageFocus =
    dayLogs.length === 0
      ? 0
      : Math.round(dayLogs.reduce((acc, log) => acc + getFocusScore(log), 0) / dayLogs.length);

  const revisionDueCount = plan.filter(
    p => p.sessionType === 'Revise' && p.status !== 'completed'
  ).length;

  const streakDays = calculateStreakDays(logs);

  return {
    totalStudyMinutes,
    formattedTotalTime,
    totalPlanned,
    completedPlanned,
    progressPercent,
    averageFocus,
    revisionDueCount,
    streakDays
  };
}

/**
 * Filters logs for a specific calendar date (YYYY-MM-DD).
 */
export function filterLogsByDate(logs: LogItem[], dateStr: string): LogItem[] {
  return logs.filter(log => {
    if (log.dateKey) {
      return log.dateKey === dateStr;
    }
    if (log.timestamp) {
      const d = getLocalDateString(0, new Date(log.timestamp));
      return d === dateStr;
    }
    return log.nextReviewDate === dateStr;
  });
}

/**
 * Calculates current active study streak in consecutive days.
 */
export function calculateStreakDays(logs: LogItem[]): number {
  if (!logs || logs.length === 0) return 0;

  const activeDates = new Set<string>();
  logs.forEach(l => {
    if (!l.isMissed && (l.activeMins > 0 || (l.totalMinutes && l.totalMinutes > 0))) {
      const dStr = l.dateKey || (l.timestamp ? getLocalDateString(0, new Date(l.timestamp)) : '');
      if (dStr) activeDates.add(dStr);
    }
  });

  if (activeDates.size === 0) return 0;

  let streak = 0;
  const today = new Date();

  // Check today or yesterday as anchor
  let checkDate = new Date(today);
  let checkStr = getLocalDateString(0, checkDate);

  if (!activeDates.has(checkStr)) {
    // Check if yesterday had activity
    checkDate.setDate(checkDate.getDate() - 1);
    checkStr = getLocalDateString(0, checkDate);
    if (!activeDates.has(checkStr)) {
      return 0;
    }
  }

  while (activeDates.has(checkStr)) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
    checkStr = getLocalDateString(0, checkDate);
  }

  return streak;
}

/**
 * Filters plans based on search string and filter tab ('all' | 'active' | 'done').
 */
export function filterPlans(
  plans: PlanItem[],
  query: string,
  filterTab: 'all' | 'active' | 'done' = 'all'
): PlanItem[] {
  const cleanQ = query.trim().toLowerCase();

  return plans.filter(p => {
    if (filterTab === 'active' && p.status === 'completed') return false;
    if (filterTab === 'done' && p.status !== 'completed') return false;

    if (cleanQ) {
      const matchTopic = p.topic.toLowerCase().includes(cleanQ);
      const matchChap = (p.chapter || '').toLowerCase().includes(cleanQ);
      const matchSub = p.subject.toLowerCase().includes(cleanQ);
      if (!matchTopic && !matchChap && !matchSub) return false;
    }

    return true;
  });
}

/**
 * Completes an in-place session: creates a normalized LogItem and marks matching PlanItem completed.
 */
export async function completeInPlaceSession(
  input: InPlaceSessionInput,
  currentPlan: PlanItem[]
): Promise<{ newLog: LogItem; updatedPlan: PlanItem[] }> {
  const totalQs =
    (input.mcqCount || 0) +
    (input.vsaCount || 0) +
    (input.saCount || 0) +
    (input.laCount || 0);

  const draftLog: LogItem = {
    id: nanoid(),
    timestamp: Date.now(),
    dateKey: input.dateStr,
    planId: input.planId,
    plannedSessionId: input.planId,
    subject: input.subject,
    topic: input.topic.trim(),
    chapter: input.chapter?.trim() || undefined,
    sessionType: input.sessionType,
    activeMins: input.activeMins,
    distractionMins: input.distractionMins || 0,
    recoveryMins: input.recoveryMins || 0,
    checkingMins: input.checkingMins || 0,
    practiceMins: input.practiceMins || 0,
    startPage: input.startPage || undefined,
    endPage: input.endPage || undefined,
    mcqCount: input.mcqCount || undefined,
    vsaCount: input.vsaCount || undefined,
    saCount: input.saCount || undefined,
    laCount: input.laCount || undefined,
    questionsAttempted: totalQs > 0 ? totalQs : undefined,
    errors: input.errors || 0,
    retentionScore: input.retentionScore,
    notes: input.notes || '',
    frictionAnalysis: input.frictionAnalysis || '',
    scratchpadImage: input.scratchpadImage,
    synced: false
  };

  const scaledReview = calculateNextReview(
    input.sessionType === 'Revise' ? 1 : 0,
    input.retentionScore,
    undefined,
    input.dateStr
  );
  const nextReviewDate = scaledReview.dueDate || calculateNextReviewDate(draftLog);
  const newLog: LogItem = normalizeLogRecord({
    ...draftLog,
    nextReviewDate
  });

  // Save log silently in the background
  await saveStudyLog(newLog);

  // Update plan item status if linked
  let updatedPlan = currentPlan;
  if (input.planId) {
    updatedPlan = currentPlan.map(p =>
      p.id === input.planId ? { ...p, status: 'completed' as const } : p
    );
    await saveDailyPlan(input.dateStr, updatedPlan);
  }

  return { newLog, updatedPlan };
}

/**
 * Creates a new directive task in the daily plan.
 */
export async function appendDirectiveTask(
  dateStr: string,
  subject: SubjectKey,
  chapter: string,
  topic: string,
  mode: SessionMode,
  targetMins: number,
  mcqCount?: number,
  currentPlan: PlanItem[] = []
): Promise<PlanItem[]> {
  const resolvedChapter = chapter.trim();
  const resolvedTopic = topic.trim() || resolvedChapter;

  const newItem: PlanItem = {
    id: nanoid(),
    timestamp: Date.now(),
    subject,
    chapter: resolvedChapter,
    topic: resolvedTopic,
    sessionType: mode,
    targetMins: targetMins || 45,
    status: 'pending',
    mcqCount: mcqCount || undefined
  };

  const updatedPlan = [...currentPlan, newItem];
  await saveDailyPlan(dateStr, updatedPlan);
  return updatedPlan;
}

/**
 * Removes a plan item from the daily queue.
 */
export async function removePlanItem(
  dateStr: string,
  planId: string,
  currentPlan: PlanItem[]
): Promise<PlanItem[]> {
  const updatedPlan = currentPlan.filter(p => p.id !== planId);
  await saveDailyPlan(dateStr, updatedPlan);
  return updatedPlan;
}

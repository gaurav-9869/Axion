import { nanoid } from 'nanoid';
import { LogItem, PlanItem, getLocalDateString, normalizeLogRecord, getFocusScore, deduplicateLogs } from '../types';
import {
  RevisionRecommendation,
  TopicEvidenceSummary,
  buildTopicHistories,
  calculateAdaptiveInterval,
  generateAdaptiveRecommendations,
  generateTopicKey,
  SPACED_REPETITION_CONFIG
} from '../lib/revision/revisionEngine';
import { deleteStudyLog, saveDailyPlan, saveStudyLog, cleanUndefined } from './dbService';
import { getIntervalSettings, IntervalSettings } from './settingsService';
import { db, auth, doc, deleteDoc, getDoc, writeBatch } from '../firebase';

export {
  buildTopicHistories,
  calculateAdaptiveInterval,
  generateAdaptiveRecommendations,
  generateTopicKey,
  SPACED_REPETITION_CONFIG
};
export type { RevisionRecommendation, TopicEvidenceSummary, IntervalSettings };

export interface RevisionItem {
  id: string;
  subject: string;
  chapter: string;
  topic: string;
  reviewCount: number;
  streak: number;
  lastRetentionScore: number;
  dueDate: string; // YYYY-MM-DD
  intervalDays: number;
}

export interface InspectorMetrics {
  sessionsCount: number;
  retentionFormatted: string;
  focusPercentage: number;
  accuracyPercentage: number;
}

export function addDaysToDateString(baseDateStr: string, daysToAdd: number): string {
  try {
    const [year, month, day] = baseDateStr.split('-').map(Number);
    if (!year || !month || !day) return getLocalDateString(daysToAdd);
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + daysToAdd);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return getLocalDateString(daysToAdd);
  }
}

export function getTomorrowDateString(todayStr: string): string {
  return addDaysToDateString(todayStr, 1);
}

/**
 * Settings-Configured Retention-Scaled Interval Engine
 */
export function calculateNextReview(
  currentCycleIndex: number,
  retentionScore: number, // 1 to 10
  settings: IntervalSettings = getIntervalSettings(),
  todayStr: string = getLocalDateString(0)
): { nextIntervalDays: number; nextCycleIndex: number; dueDate: string } {
  const cycles = settings.cycles?.length ? settings.cycles : [1, 3, 7, 14, 30, 60];
  const safeIndex = Math.min(Math.max(0, currentCycleIndex), cycles.length - 1);
  const baseInterval = cycles[safeIndex];

  let nextIntervalDays = baseInterval;
  let nextCycleIndex = safeIndex;

  if (retentionScore >= 9) {
    // Strong mastery: advance to next cycle and apply full configured interval
    nextCycleIndex = Math.min(safeIndex + 1, cycles.length - 1);
    nextIntervalDays = cycles[nextCycleIndex];
  } else if (retentionScore >= 6) {
    // Moderate recall: advance cycle, scale interval by 0.75x (minimum 1 day)
    nextCycleIndex = Math.min(safeIndex + 1, cycles.length - 1);
    nextIntervalDays = Math.max(1, Math.round(cycles[nextCycleIndex] * 0.75));
  } else {
    // Weak recall (< 6): reinforce tomorrow or in 2 days without advancing cycle
    nextIntervalDays = retentionScore <= 3 ? 1 : 2;
    nextCycleIndex = Math.max(0, safeIndex - 1);
  }

  const dueDate = addDaysToDateString(todayStr, nextIntervalDays);
  return { nextIntervalDays, nextCycleIndex, dueDate };
}

export function formatDateDDMMYYYY(timestampOrDate?: number | string): string {
  if (!timestampOrDate) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  if (typeof timestampOrDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(timestampOrDate)) {
    const [yyyy, mm, dd] = timestampOrDate.split('-');
    return `${dd}/${mm}/${yyyy}`;
  }
  const d = new Date(timestampOrDate);
  if (isNaN(d.getTime())) return String(timestampOrDate);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Intelligent Rescheduling Algorithm:
 * Implements the missed-session slip logic without resetting established memory curves.
 */
export function handleMissedSession(item: RevisionItem, todayStr: string): RevisionItem {
  if (item.dueDate >= todayStr) return item;

  if (item.reviewCount >= 3 || item.lastRetentionScore >= 7) {
    return {
      ...item,
      dueDate: getTomorrowDateString(todayStr)
    };
  }

  return {
    ...item,
    dueDate: getTomorrowDateString(todayStr),
    intervalDays: 1
  };
}

/**
 * Computes the 4 metrics for the Right Column Details Inspector:
 * Sessions, Retention, Focus, and Accuracy.
 */
export function computeTopicInspectorMetrics(summary: TopicEvidenceSummary | null): InspectorMetrics {
  if (!summary || summary.history.length === 0) {
    return {
      sessionsCount: 0,
      retentionFormatted: '0.0 / 10',
      focusPercentage: 100,
      accuracyPercentage: 100
    };
  }

  const sessionsCount = summary.history.length;
  const avgRetention =
    summary.averageRetentionScore > 0
      ? summary.averageRetentionScore
      : summary.latestRetentionScore || 8;
  const retentionFormatted = `${avgRetention.toFixed(1)} / 10`;

  let totalFocus = 0;
  let totalQuestions = 0;
  let totalErrors = 0;

  summary.history.forEach(log => {
    totalFocus += getFocusScore(log);
    const qs =
      (log.mcqCount || 0) +
      (log.vsaCount || 0) +
      (log.saCount || 0) +
      (log.laCount || 0) +
      (log.questionsAttempted || 0);
    totalQuestions += qs;
    totalErrors += log.errors || 0;
  });

  const focusPercentage = Math.round(totalFocus / sessionsCount);
  const accuracyPercentage =
    totalQuestions > 0
      ? Math.max(
          0,
          Math.min(100, Math.round(((totalQuestions - totalErrors) / totalQuestions) * 100))
        )
      : Math.min(100, Math.max(75, Math.round(avgRetention * 10)));

  return {
    sessionsCount,
    retentionFormatted,
    focusPercentage,
    accuracyPercentage
  };
}

export async function rescheduleRevisionToTomorrow(
  rec: RevisionRecommendation,
  allLogs: LogItem[]
): Promise<LogItem | null> {
  const topicLogs = allLogs
    .filter(l => generateTopicKey(l.subject, l.topic, l.chapter) === rec.topicKey)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  if (topicLogs.length === 0) return null;

  const latest = topicLogs[topicLogs.length - 1];
  const reviewCount = topicLogs.filter(l => !l.isMissed).length;
  const lastScore = rec.latestRetentionScore || latest.retentionScore || 5;
  const todayStr = getLocalDateString(0);

  const item: RevisionItem = {
    id: latest.id,
    subject: rec.subject,
    chapter: rec.chapter || rec.topic,
    topic: rec.topic,
    reviewCount,
    streak: rec.retrievalStreak,
    lastRetentionScore: lastScore,
    dueDate: rec.targetReviewDate < todayStr ? rec.targetReviewDate : getLocalDateString(-1),
    intervalDays: Math.max(1, rec.recommendedIntervalDays)
  };

  const slipped = handleMissedSession(item, todayStr);

  const updatedLatest: LogItem = normalizeLogRecord({
    ...latest,
    timestamp: Date.now(),
    retentionScore: slipped.intervalDays > 1 ? Math.max(7, lastScore) : Math.max(4, lastScore),
    nextReviewDate: slipped.dueDate
  });

  await saveStudyLog(updatedLatest);
  return updatedLatest;
}

export async function queueAllDueRevisions(
  recommendations: RevisionRecommendation[],
  currentPlan: PlanItem[],
  todayDateStr: string
): Promise<PlanItem[]> {
  const actionable = recommendations.filter(
    r => r.urgency === 'overdue' || r.urgency === 'due_today'
  );
  const toQueue = actionable.length > 0 ? actionable : recommendations;

  const additions: PlanItem[] = [];
  for (const rec of toQueue) {
    const alreadyQueued =
      currentPlan.some(
        p =>
          p.subject === rec.subject &&
          p.topic.toLowerCase() === rec.topic.toLowerCase() &&
          p.sessionType === 'Revise'
      ) ||
      additions.some(
        a =>
          a.subject === rec.subject &&
          a.topic.toLowerCase() === rec.topic.toLowerCase()
      );

    if (!alreadyQueued) {
      additions.push({
        id: nanoid(),
        timestamp: Date.now(),
        subject: rec.subject,
        topic: rec.topic,
        chapter: rec.chapter,
        sessionType: 'Revise',
        targetMins: rec.retentionBand === 'Very Weak' || rec.retentionBand === 'Weak' ? 45 : 30,
        mcqCount: rec.totalQuestionsSolved > 0 ? Math.min(45, rec.totalQuestionsSolved) : undefined,
        status: 'pending',
        isScheduledRevision: true
      });
    }
  }

  if (additions.length === 0) return currentPlan;

  const updatedPlan = [...currentPlan, ...additions];
  try {
    await saveDailyPlan(todayDateStr, updatedPlan);
  } catch {}
  return updatedPlan;
}

/**
 * Synthesizes a clean unified topic title when merging topics
 * (e.g., "Thermodynamics (Part 1)" + "Thermodynamics (Part 2)" -> "Thermodynamics (Part 1 & 2)")
 */
export function synthesizeUnifiedTopicTitle(topics: string[]): string {
  const distinct = Array.from(new Set(topics.map(t => t.trim()).filter(Boolean)));
  if (distinct.length === 0) return 'Merged Revision';
  if (distinct.length === 1) return distinct[0];

  const partRegex = /^(.*?)\s*\(\s*Part\s*(\d+|[A-Za-z]+)\s*\)$/i;
  const parsedParts = distinct.map(t => {
    const m = t.match(partRegex);
    return m ? { base: m[1].trim(), part: m[2].trim() } : null;
  });

  if (
    parsedParts.every(Boolean) &&
    parsedParts.every(p => p!.base.toLowerCase() === parsedParts[0]!.base.toLowerCase())
  ) {
    const baseName = parsedParts[0]!.base;
    const partLabels = parsedParts.map(p => p!.part).join(' & ');
    return `${baseName} (Part ${partLabels})`;
  }

  return distinct.join(' + ');
}

export async function mergeRevisionItems(
  selectedRecs: RevisionRecommendation[],
  allLogs: LogItem[],
  currentPlan: PlanItem[]
): Promise<{
  mergedLog: LogItem;
  mergedPlanItem: PlanItem;
  deletedLogIds: string[];
  updatedPlan: PlanItem[];
}> {
  if (selectedRecs.length < 2) {
    throw new Error('Select at least 2 sessions to merge.');
  }

  const primarySubject = selectedRecs[0].subject;
  const combinedTopic = synthesizeUnifiedTopicTitle(selectedRecs.map(r => r.topic));
  const uniqueChapters = Array.from(
    new Set(
      selectedRecs
        .map(r => (r.chapter || r.topic || '').trim())
        .filter(Boolean)
    )
  );
  const combinedChapter = uniqueChapters.join(' + ');

  const selectedKeys = new Set(selectedRecs.map(r => r.topicKey));
  const logsToMerge = allLogs.filter(l =>
    selectedKeys.has(generateTopicKey(l.subject, l.topic, l.chapter))
  );

  const summedMcqs = logsToMerge.reduce((sum, l) => sum + (l.mcqCount || 0), 0);
  const recMcqs = selectedRecs.reduce((sum, r) => sum + (r.totalQuestionsSolved || 0), 0);
  const totalMcqs = Math.max(summedMcqs, recMcqs);

  const totalActiveMins = Math.max(
    30,
    logsToMerge.reduce((sum, l) => sum + (l.activeMins || 0), 0)
  );
  const avgRetention = Math.round(
    selectedRecs.reduce((sum, r) => sum + (r.latestRetentionScore || 7), 0) / selectedRecs.length
  );

  const earliestDueDate =
    selectedRecs
      .map(r => r.targetReviewDate || getLocalDateString(0))
      .sort()[0] || getLocalDateString(0);

  const mergedLog: LogItem = normalizeLogRecord({
    id: nanoid(),
    timestamp: Date.now(),
    subject: primarySubject,
    topic: combinedTopic,
    chapter: combinedChapter || undefined,
    sessionType: 'Revise',
    activeMins: Math.min(90, totalActiveMins),
    distractionMins: 0,
    recoveryMins: 0,
    mcqCount: totalMcqs > 0 ? totalMcqs : undefined,
    retentionScore: avgRetention,
    notes: `${selectedRecs.map(r => r.topic).join(' + ')}`,
    nextReviewDate: earliestDueDate
  });

  const mergedPlanItem: PlanItem = {
    id: nanoid(),
    timestamp: Date.now(),
    subject: primarySubject,
    topic: combinedTopic,
    chapter: combinedChapter || undefined,
    sessionType: 'Revise',
    targetMins: Math.min(90, Math.max(30, selectedRecs.length * 25)),
    mcqCount: totalMcqs > 0 ? totalMcqs : undefined,
    status: 'pending',
    isScheduledRevision: true
  };

  const deletedLogIds = logsToMerge.map(l => l.id).filter(Boolean);

  await saveStudyLog(mergedLog);
  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      const batch = writeBatch(db);
      const queueDocRef = doc(db, 'users', uid, 'revisionQueue', mergedLog.id);
      batch.set(
        queueDocRef,
        cleanUndefined({
          id: mergedLog.id,
          subject: primarySubject,
          topic: combinedTopic,
          chapter: combinedChapter || 'General',
          targetMCQs: totalMcqs,
          revisionMinutes: totalActiveMins,
          streak: Math.min(...selectedRecs.map(r => r.retrievalStreak || 1)),
          lastRetentionScore: avgRetention,
          dueDate: earliestDueDate,
          updatedAt: Date.now()
        })
      );
      for (const id of deletedLogIds) {
        batch.delete(doc(db, 'users', uid, 'logs', id));
        batch.delete(doc(db, 'users', uid, 'revisionQueue', id));
      }
      for (const rec of selectedRecs) {
        batch.delete(doc(db, 'users', uid, 'revisionQueue', encodeURIComponent(rec.topicKey)));
      }
      await batch.commit();
    } catch {}
  } else {
    for (const id of deletedLogIds) {
      await deleteStudyLog(id);
    }
  }

  const filteredPlan = currentPlan.filter(
    p => !selectedKeys.has(generateTopicKey(p.subject, p.topic, p.chapter))
  );
  const updatedPlan = [...filteredPlan, mergedPlanItem];
  await saveDailyPlan(getLocalDateString(0), updatedPlan);

  return {
    mergedLog,
    mergedPlanItem,
    deletedLogIds,
    updatedPlan
  };
}

export async function deleteRevisionTopic(
  rec: RevisionRecommendation,
  allLogs: LogItem[],
  currentPlan: PlanItem[]
): Promise<{
  deletedLogIds: string[];
  updatedPlan: PlanItem[];
}> {
  const matchingLogs = allLogs.filter(
    l => generateTopicKey(l.subject, l.topic, l.chapter) === rec.topicKey
  );
  const deletedLogIds = matchingLogs.map(l => l.id).filter(Boolean);

  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'revisionQueue', encodeURIComponent(rec.topicKey)));
    } catch {}
  }

  for (const id of deletedLogIds) {
    await deleteStudyLog(id);
    if (uid) {
      try {
        await deleteDoc(doc(db, 'users', uid, 'revisionQueue', id));
      } catch {}
    }
  }

  const updatedPlan = currentPlan.filter(
    p => generateTopicKey(p.subject, p.topic, p.chapter) !== rec.topicKey
  );
  if (updatedPlan.length !== currentPlan.length) {
    await saveDailyPlan(getLocalDateString(0), updatedPlan);
  }

  return {
    deletedLogIds,
    updatedPlan
  };
}

export type UrgencyFilter = 'All' | 'Overdue' | 'Due Today' | 'Upcoming';

export interface RevisionTopicGroup {
  key: string;
  subject: string;
  chapter?: string;
  topic: string;
  urgency: 'Overdue' | 'Due Today' | 'Upcoming';
  nextReviewDate: string;
  intervalDays: number;
  streak: number;
  totalStudyMins: number;
  totalPracticeMins: number;
  totalMcqs: number;
  pageRange?: string;
  averageRetention: number;
  sessionCount: number;
  isQueuedToday: boolean;
  sessions: LogItem[];
}

export function buildRevisionTopicGroups(
  logs: LogItem[],
  currentPlan: PlanItem[],
  todayDateStr: string
): RevisionTopicGroup[] {
  // Deduplicate logs by id and planId so planned sessions flagged for revision never double-count
  const deduped = deduplicateLogs(logs).filter(l => l && !l.isMissed);
  const histories = buildTopicHistories(deduped);
  const intervalSettings = getIntervalSettings();
  const groups: RevisionTopicGroup[] = [];

  histories.forEach((summary, key) => {
    const latestSession = summary.history[summary.history.length - 1];
    const lastDateStr = latestSession?.timestamp
      ? getLocalDateString(0, new Date(latestSession.timestamp))
      : todayDateStr;

    const currentCycleIndex = Math.max(0, summary.history.length - 1);
    const latestRet =
      latestSession?.retentionScore ||
      summary.latestRetentionScore ||
      summary.averageRetentionScore ||
      8;

    const scaled = calculateNextReview(
      currentCycleIndex,
      latestRet,
      intervalSettings,
      lastDateStr
    );

    const nextReviewDate = latestSession?.nextReviewDate || scaled.dueDate;

    let urgency: RevisionTopicGroup['urgency'] = 'Upcoming';
    if (nextReviewDate < todayDateStr) {
      urgency = 'Overdue';
    } else if (nextReviewDate === todayDateStr) {
      urgency = 'Due Today';
    }

    let totalStudyMins = 0;
    let totalPracticeMins = 0;
    let totalMcqs = 0;
    let minPage: number | null = null;
    let maxPage: number | null = null;

    summary.history.forEach(s => {
      if (s.sessionType === 'Exercise') {
        totalPracticeMins += s.practiceMinutes ?? s.practiceMins ?? s.activeMins ?? 0;
      } else {
        totalStudyMins += s.studyMinutes ?? s.activeMins ?? 0;
        totalPracticeMins += s.practiceMinutes ?? s.practiceMins ?? 0;
      }
      totalMcqs += (s.mcqCount || 0) + (s.vsaCount || 0) + (s.saCount || 0) + (s.laCount || 0);
      if (typeof s.startPage === 'number' && s.startPage > 0) {
        minPage = minPage === null ? s.startPage : Math.min(minPage, s.startPage);
      }
      if (typeof s.endPage === 'number' && s.endPage > 0) {
        maxPage = maxPage === null ? s.endPage : Math.max(maxPage, s.endPage);
      }
    });

    const pageRange =
      minPage !== null && maxPage !== null && maxPage >= minPage
        ? `${minPage}–${maxPage}`
        : undefined;

    const topicName =
      latestSession?.topic || (summary as any).topicDisplay || (summary as any).topic || 'General Topic';
    const chapterName =
      latestSession?.chapter || (summary as any).chapterDisplay || (summary as any).chapter || undefined;

    const isQueuedToday = currentPlan.some(
      p =>
        p.subject.toLowerCase() === summary.subject.toLowerCase() &&
        p.topic.toLowerCase() === topicName.toLowerCase() &&
        p.status !== 'completed'
    );

    const avgRet =
      summary.averageRetentionScore > 0
        ? Math.round(summary.averageRetentionScore * 10) / 10
        : summary.latestRetentionScore || 8;

    groups.push({
      key,
      subject: summary.subject,
      chapter: chapterName,
      topic: topicName,
      urgency,
      nextReviewDate,
      intervalDays: scaled.nextIntervalDays,
      streak: summary.retrievalStreak || summary.history.length,
      totalStudyMins,
      totalPracticeMins,
      totalMcqs,
      pageRange,
      averageRetention: avgRet,
      sessionCount: summary.history.length,
      isQueuedToday,
      sessions: [...summary.history].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    });
  });

  const urgencyWeight = { Overdue: 0, 'Due Today': 1, Upcoming: 2 };
  return groups.sort((a, b) => {
    if (urgencyWeight[a.urgency] !== urgencyWeight[b.urgency]) {
      return urgencyWeight[a.urgency] - urgencyWeight[b.urgency];
    }
    return a.nextReviewDate.localeCompare(b.nextReviewDate);
  });
}

export async function queueTopicForToday(
  group: RevisionTopicGroup,
  currentPlan: PlanItem[],
  todayDateStr: string
): Promise<PlanItem[]> {
  // Check if an existing plan item matches this topic so we update it in-place rather than duplicating
  const existingIdx = currentPlan.findIndex(
    p =>
      p.subject.toLowerCase() === group.subject.toLowerCase() &&
      p.topic.toLowerCase() === group.topic.toLowerCase()
  );

  if (existingIdx >= 0) {
    const updatedExisting = currentPlan.map((p, idx) =>
      idx === existingIdx
        ? {
            ...p,
            sessionType: 'Revise' as const,
            status: 'pending' as const,
            isScheduledRevision: true
          }
        : p
    );
    try {
      await saveDailyPlan(todayDateStr, updatedExisting);
    } catch {}
    return updatedExisting;
  }

  const newItem: PlanItem = {
    id: nanoid(),
    timestamp: Date.now(),
    subject: group.subject,
    chapter: group.chapter,
    topic: group.topic,
    sessionType: 'Revise',
    targetMins: group.averageRetention < 6 ? 45 : 30,
    mcqCount: group.totalMcqs > 0 ? Math.min(30, group.totalMcqs) : undefined,
    status: 'pending',
    isScheduledRevision: true
  };

  const updated = [...currentPlan, newItem];
  try {
    await saveDailyPlan(todayDateStr, updated);
  } catch {}
  return updated;
}

export async function deleteIndividualSession(
  sessionId: string,
  logs: LogItem[]
): Promise<LogItem[]> {
  const uid = auth.currentUser?.uid;
  try {
    await deleteStudyLog(sessionId);
    if (uid) {
      await deleteDoc(doc(db, 'users', uid, 'revisionQueue', sessionId));
    }
  } catch {}
  return logs.filter(l => l.id !== sessionId);
}

export async function deleteEntireTopicHistory(
  group: RevisionTopicGroup,
  logs: LogItem[]
): Promise<LogItem[]> {
  const idsToDelete = new Set(group.sessions.map(s => s.id));
  const uid = auth.currentUser?.uid;

  if (uid) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'revisionQueue', encodeURIComponent(group.key)));
    } catch {}
  }

  for (const id of idsToDelete) {
    try {
      await deleteStudyLog(id);
      if (uid) {
        await deleteDoc(doc(db, 'users', uid, 'revisionQueue', id));
      }
    } catch {}
  }
  return logs.filter(l => !idsToDelete.has(l.id));
}

/**
 * Atomic Firestore writeBatch consolidation for merging >= 2RevisionTopicGroups:
 * - Synthesizes unified topic title
 * - Sums targetMCQs and revisionMinutes
 * - Sets dueDate to earliest due date among selected cards
 * - Sets streak to lowest streak and averages retention scores
 * - Creates consolidated doc in users/{uid}/revisionQueue and unified log in users/{uid}/logs,
 *   and deletes original source documents.
 */
export async function mergeSelectedTopics(
  groupsToMerge: RevisionTopicGroup[],
  targetTopicName: string,
  targetChapter: string | undefined,
  logs: LogItem[]
): Promise<LogItem[]> {
  if (groupsToMerge.length < 2) return logs;

  const synthesizedTopic =
    targetTopicName.trim() ||
    synthesizeUnifiedTopicTitle(groupsToMerge.map(g => g.topic));
  const distinctChapters = Array.from(
    new Set(groupsToMerge.map(g => g.chapter).filter(Boolean))
  );
  const unifiedChapter = targetChapter || distinctChapters.join(' + ') || undefined;
  const primarySubject = groupsToMerge[0].subject;

  const summedMcqs = groupsToMerge.reduce((acc, g) => acc + (g.totalMcqs || 0), 0);
  const summedMinutes = groupsToMerge.reduce(
    (acc, g) => acc + (g.totalStudyMins || 0) + (g.totalPracticeMins || 0),
    0
  );
  const earliestDueDate =
    groupsToMerge
      .map(g => g.nextReviewDate)
      .filter(Boolean)
      .sort()[0] || getLocalDateString(0);
  const lowestStreak = Math.min(...groupsToMerge.map(g => g.streak || 1));
  const avgRetention =
    Math.round(
      (groupsToMerge.reduce((acc, g) => acc + (g.averageRetention || 8), 0) /
        groupsToMerge.length) *
        10
    ) / 10;

  const sourceSessionIds = new Set<string>();
  groupsToMerge.forEach(g => g.sessions.forEach(s => sourceSessionIds.add(s.id)));

  const consolidatedLogId = `rev-merged-${nanoid(8)}`;
  const consolidatedLog: LogItem = normalizeLogRecord({
    id: consolidatedLogId,
    timestamp: Date.now(),
    dateKey: getLocalDateString(0),
    subject: primarySubject,
    topic: synthesizedTopic,
    chapter: unifiedChapter,
    sessionType: 'Revise',
    activeMins: Math.max(30, summedMinutes),
    studyMinutes: Math.max(30, summedMinutes),
    distractionMins: 0,
    recoveryMins: 0,
    mcqCount: summedMcqs > 0 ? summedMcqs : undefined,
    retentionScore: Math.round(avgRetention),
    notes: `Merged: ${groupsToMerge.map(g => g.topic).join(' + ')}`,
    nextReviewDate: earliestDueDate
  });

  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      const batch = writeBatch(db);
      const newQueueRef = doc(db, 'users', uid, 'revisionQueue', consolidatedLogId);
      batch.set(
        newQueueRef,
        cleanUndefined({
          id: consolidatedLogId,
          subject: primarySubject,
          topic: synthesizedTopic,
          chapter: unifiedChapter || 'General',
          targetMCQs: summedMcqs,
          revisionMinutes: Math.max(30, summedMinutes),
          streak: Math.max(1, lowestStreak),
          lastRetentionScore: avgRetention,
          dueDate: earliestDueDate,
          mergedSourceIds: Array.from(sourceSessionIds),
          updatedAt: Date.now()
        })
      );

      const newLogRef = doc(db, 'users', uid, 'logs', consolidatedLogId);
      batch.set(newLogRef, cleanUndefined(consolidatedLog));

      sourceSessionIds.forEach(id => {
        batch.delete(doc(db, 'users', uid, 'logs', id));
        batch.delete(doc(db, 'users', uid, 'revisionQueue', id));
      });

      groupsToMerge.forEach(g => {
        batch.delete(doc(db, 'users', uid, 'revisionQueue', encodeURIComponent(g.key)));
      });

      await batch.commit();
    } catch (err) {
      console.warn('Firestore batch merge fallback:', err);
      await saveStudyLog(consolidatedLog);
      for (const id of sourceSessionIds) {
        await deleteStudyLog(id);
      }
    }
  } else {
    await saveStudyLog(consolidatedLog);
    for (const id of sourceSessionIds) {
      await deleteStudyLog(id);
    }
  }

  const remainingLogs = logs.filter(l => !sourceSessionIds.has(l.id));
  return [consolidatedLog, ...remainingLogs];
}

/**
 * Backend persistence logic for merging revision sessions directly in Cloud Firestore
 * using an atomic batch write (writeBatch).
 */
export async function mergeRevisionSessions(
  uid: string,
  selectedIds: string[]
): Promise<{
  id: string;
  topic: string;
  chapter: string;
  targetMCQs: number;
  revisionMinutes: number;
  streak: number;
  lastRetentionScore: number;
  dueDate: string;
  [key: string]: any;
} | null> {
  if (!uid || !selectedIds || selectedIds.length === 0) return null;

  try {
    const docSnaps = await Promise.all(
      selectedIds.map(id => getDoc(doc(db, 'users', uid, 'revisionQueue', id)))
    );

    const validDocs: Array<Record<string, any>> = docSnaps
      .filter(s => s.exists())
      .map(s => {
        const data = s.data() || {};
        return { id: s.id, ...data };
      });

    if (validDocs.length === 0) return null;

    const mergedTopic = synthesizeUnifiedTopicTitle(validDocs.map(d => d.topic || ''));
    const distinctChapters = Array.from(new Set(validDocs.map(d => d.chapter).filter(Boolean)));
    const mergedChapter = distinctChapters.join(' + ') || (validDocs[0].chapter || 'General');

    const totalMCQs = validDocs.reduce(
      (acc, d) => acc + (Number(d.targetMCQs) || Number(d.mcqCount) || 0),
      0
    );
    const totalRevisionMinutes = validDocs.reduce(
      (acc, d) => acc + (Number(d.revisionMinutes) || Number(d.activeMins) || 30),
      0
    );

    const lowestStreak = Math.min(
      ...validDocs.map(d => (typeof d.streak === 'number' ? d.streak : 1))
    );
    const retentionScores = validDocs.map(
      d => Number(d.lastRetentionScore) || Number(d.retentionScore) || 7
    );
    const avgRetention =
      retentionScores.length > 0
        ? Math.round(
            (retentionScores.reduce((a, b) => a + b, 0) / retentionScores.length) * 10
          ) / 10
        : 7;

    const dueDates = validDocs
      .map(d => d.dueDate || d.targetDate || getLocalDateString(0))
      .filter(Boolean);
    dueDates.sort();
    const earliestDueDate = dueDates[0] || getLocalDateString(0);

    const newDocId = `rev-merge-${nanoid(8)}`;
    const mergedPayload = {
      id: newDocId,
      topic: mergedTopic,
      chapter: mergedChapter,
      subject: validDocs[0].subject || 'phys',
      targetMCQs: totalMCQs,
      revisionMinutes: totalRevisionMinutes,
      streak: Math.max(0, lowestStreak),
      lastRetentionScore: avgRetention,
      dueDate: earliestDueDate,
      mergedSourceIds: selectedIds,
      updatedAt: Date.now()
    };

    const batch = writeBatch(db);
    const newDocRef = doc(db, 'users', uid, 'revisionQueue', newDocId);
    batch.set(newDocRef, mergedPayload);

    for (const id of selectedIds) {
      const sourceRef = doc(db, 'users', uid, 'revisionQueue', id);
      batch.delete(sourceRef);
    }

    await batch.commit();

    return mergedPayload;
  } catch (err) {
    console.error('Error merging revision sessions in Firestore:', err);
    throw err;
  }
}


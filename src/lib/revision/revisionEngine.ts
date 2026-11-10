import { LogItem, getLocalDateString } from '../../types';

export type RetentionBand = 'Very Weak' | 'Weak' | 'Moderate' | 'Strong' | 'Mastered';

export interface SpacedRepetitionConfig {
  initialStudyIntervalDays: number;
  initialStudyStrongIntervalDays: number;
  minIntervalDays: number;
  maxIntervalDays: number;
  failedRetrievalIntervalDays: number;
  weakRetrievalIntervalDays: number;
  retentionThresholds: {
    failedMax: number;
    weakMax: number;
    moderateMax: number;
    strongMin: number;
    masteredMin: number;
  };
  progressionMultipliers: {
    strong: number;
    moderate: number;
    weak: number;
    failed: number;
  };
  accuracyThresholds: {
    highAccuracy: number;
    lowAccuracy: number;
  };
  modifiers: {
    highAccuracyBonusDays: number;
    lowAccuracyPenaltyDays: number;
    frictionPenaltyDays: number;
    lowFocusPenaltyFactor: number;
    missedRevisionPenaltyDays: number;
  };
}

export const SPACED_REPETITION_CONFIG: SpacedRepetitionConfig = {
  initialStudyIntervalDays: 1,
  initialStudyStrongIntervalDays: 2,
  minIntervalDays: 1,
  maxIntervalDays: 60,
  failedRetrievalIntervalDays: 1,
  weakRetrievalIntervalDays: 1,
  retentionThresholds: {
    failedMax: 3,
    weakMax: 5,
    moderateMax: 7,
    strongMin: 8,
    masteredMin: 10,
  },
  progressionMultipliers: {
    strong: 2.3,
    moderate: 1.5,
    weak: 1.0,
    failed: 0.0,
  },
  accuracyThresholds: {
    highAccuracy: 85,
    lowAccuracy: 50,
  },
  modifiers: {
    highAccuracyBonusDays: 1,
    lowAccuracyPenaltyDays: 2,
    frictionPenaltyDays: 1,
    lowFocusPenaltyFactor: 0.85,
    missedRevisionPenaltyDays: 1,
  }
};

export interface TopicEvidenceSummary {
  topicKey: string;
  subject: string;
  topicName: string;
  subTopicName?: string;
  totalSessions: number;
  studyCount: number;
  reviseCount: number;
  exerciseCount: number;
  firstStudiedAt?: number;
  lastStudiedAt?: number;
  latestSessionType?: string;
  latestRetentionScore?: number;
  averageRetentionScore: number;
  averageFocusScore: number;
  totalActiveMinutes: number;
  totalQuestionsSolved: number;
  totalErrors: number;
  accuracyRate?: number;
  retentionBand: RetentionBand;
  retrievalStreak: number;
  failedRetrievalCount: number;
  lastCalculatedIntervalDays?: number;
  slippedToTomorrow?: boolean;
  history: LogItem[];
}

export interface RevisionRecommendation {
  topicKey: string;
  subject: string;
  topic: string;
  chapter?: string;
  recommendedIntervalDays: number;
  targetReviewDate: string;
  retentionBand: RetentionBand;
  confidenceScore: number;
  urgency: 'overdue' | 'due_today' | 'upcoming' | 'stable';
  daysOverdueOrUntil: number;
  retrievalStreak: number;
  latestRetentionScore: number;
  totalQuestionsSolved: number;
  logIds: string[];
  explanation: {
    primaryReason: string;
    factors: string[];
    evidenceSummary: string;
  };
}

export function generateTopicKey(subject: string, topic: string, chapter?: string): string {
  const sub = (subject || '').trim().toLowerCase();
  const top = (topic || '').trim().toLowerCase();
  const chap = (chapter || '').trim().toLowerCase();
  return `${sub}::${top}${chap ? `::${chap}` : ''}`;
}

export function calculateRetentionBand(
  avgRetention: number,
  latestRetention?: number,
  accuracyRate?: number,
  retrievalStreak = 0,
  totalSessions = 1
): RetentionBand {
  const latest = latestRetention !== undefined && latestRetention > 0 ? latestRetention : avgRetention;

  if (latest > 0 && latest <= 3.5) return 'Very Weak';
  if (latest >= 8 && retrievalStreak >= 3) return 'Mastered';
  if (latest >= 8 || (avgRetention >= 7.5 && retrievalStreak >= 1)) return 'Strong';
  if (latest >= 6 || avgRetention >= 5.5) return 'Moderate';
  if (latest >= 4 || avgRetention >= 3.5) return 'Weak';
  return 'Very Weak';
}

export function buildTopicHistories(logs: LogItem[]): Map<string, TopicEvidenceSummary> {
  const map = new Map<string, TopicEvidenceSummary>();

  const seenIds = new Set<string>();
  const seenPlanIds = new Map<string, number>();
  const uniqueLogs: LogItem[] = [];

  for (const log of logs) {
    if (!log || !log.topic) continue;

    if (log.planId) {
      if (seenPlanIds.has(log.planId)) {
        const existingIdx = seenPlanIds.get(log.planId)!;
        const existing = uniqueLogs[existingIdx];
        const existingTime = (existing.activeMins || 0) + (existing.practiceMins || 0) + (existing.checkingMins || 0);
        const logTime = (log.activeMins || 0) + (log.practiceMins || 0) + (log.checkingMins || 0);
        const shouldReplace = (existing.isMissed && !log.isMissed) ||
          (!existing.isMissed && !log.isMissed && logTime >= existingTime) ||
          (existing.isMissed && log.isMissed && (log.timestamp || 0) >= (existing.timestamp || 0));

        if (shouldReplace) {
          uniqueLogs[existingIdx] = log;
          if (existing.id) seenIds.delete(existing.id);
          if (log.id) seenIds.add(log.id);
        }
        continue;
      }
    }

    if (log.id) {
      if (seenIds.has(log.id)) continue;
      seenIds.add(log.id);
    }

    const idx = uniqueLogs.length;
    uniqueLogs.push(log);
    if (log.planId) {
      seenPlanIds.set(log.planId, idx);
    }
  }

  const validLogs = uniqueLogs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  for (const log of validLogs) {
    const key = generateTopicKey(log.subject, log.topic, log.chapter);
    let summary = map.get(key);

    const questionsInLog = (log.mcqCount || 0) + (log.vsaCount || 0) + (log.saCount || 0) + (log.laCount || 0);
    const errorsInLog = log.errors || 0;
    const focusTotal = (log.activeMins || 0) + (log.distractionMins || 0) + (log.recoveryMins || 0);
    const focusScore = focusTotal > 0 ? Math.round(((log.activeMins || 0) / focusTotal) * 100) : 100;

    if (!summary) {
      summary = {
        topicKey: key,
        subject: log.subject,
        topicName: log.topic,
        subTopicName: log.chapter,
        totalSessions: 0,
        studyCount: 0,
        reviseCount: 0,
        exerciseCount: 0,
        firstStudiedAt: log.timestamp || Date.now(),
        lastStudiedAt: log.timestamp || Date.now(),
        latestSessionType: log.sessionType,
        latestRetentionScore: log.retentionScore,
        averageRetentionScore: log.retentionScore || 0,
        averageFocusScore: focusScore,
        totalActiveMinutes: 0,
        totalQuestionsSolved: 0,
        totalErrors: 0,
        retentionBand: 'Moderate',
        retrievalStreak: 0,
        failedRetrievalCount: 0,
        history: []
      };
      map.set(key, summary);
    }

    summary.totalSessions += 1;
    if (log.sessionType === 'Study') summary.studyCount += 1;
    else if (log.sessionType === 'Revise') summary.reviseCount += 1;
    else if (log.sessionType === 'Exercise') summary.exerciseCount += 1;

    summary.lastStudiedAt = log.timestamp || summary.lastStudiedAt;
    summary.latestSessionType = log.sessionType;
    if (!log.isMissed && log.retentionScore !== undefined && log.retentionScore > 0) {
      summary.latestRetentionScore = log.retentionScore;
    }

    if (!log.isMissed) {
      summary.totalActiveMinutes += (log.activeMins || 0) + (log.practiceMins || 0) + (log.checkingMins || 0);
      summary.totalQuestionsSolved += questionsInLog;
      summary.totalErrors += errorsInLog;
    }
    summary.history.push(log);
  }

  for (const summary of map.values()) {
    const scoresWithValues = summary.history
      .filter(h => !h.isMissed)
      .map(h => h.retentionScore)
      .filter((s): s is number => s !== undefined && s > 0);

    summary.averageRetentionScore = scoresWithValues.length > 0
      ? scoresWithValues.reduce((a, b) => a + b, 0) / scoresWithValues.length
      : (summary.latestRetentionScore || 5);

    const focusScores = summary.history
      .filter(h => !h.isMissed)
      .map(h => {
        const tot = (h.activeMins || 0) + (h.distractionMins || 0) + (h.recoveryMins || 0);
        return tot > 0 ? Math.round(((h.activeMins || 0) / tot) * 100) : 100;
      });
    summary.averageFocusScore = focusScores.length > 0
      ? Math.round(focusScores.reduce((a, b) => a + b, 0) / focusScores.length)
      : 100;

    if (summary.totalQuestionsSolved > 0) {
      const correct = Math.max(0, summary.totalQuestionsSolved - summary.totalErrors);
      summary.accuracyRate = Math.round((correct / summary.totalQuestionsSolved) * 100);
    }

    const adaptiveResult = calculateAdaptiveInterval(summary);
    summary.retrievalStreak = adaptiveResult.retrievalStreak;
    summary.lastCalculatedIntervalDays = adaptiveResult.intervalDays;
    summary.slippedToTomorrow = adaptiveResult.slippedToTomorrow;

    summary.retentionBand = calculateRetentionBand(
      summary.averageRetentionScore,
      summary.latestRetentionScore,
      summary.accuracyRate,
      summary.retrievalStreak,
      summary.totalSessions
    );
  }

  return map;
}

/**
 * Smart Rescheduling & Spaced Repetition Interval Engine:
 * - High-Streak Topics (reviewCount >= 3 or last score >= 7):
 *   When a scheduled revision is missed, do NOT reset interval curves or drop streak to 0.
 *   Slip the due date forward to Tomorrow (+1d) while preserving the existing streak.
 * - Early-Stage Topics (reviewCount < 2 or last score < 5):
 *   Reschedule to Tomorrow (+1d) with short reinforcement spacing to rebuild stability.
 */
export function calculateAdaptiveInterval(
  summary: TopicEvidenceSummary,
  config: SpacedRepetitionConfig = SPACED_REPETITION_CONFIG
): {
  intervalDays: number;
  confidenceScore: number;
  retrievalStreak: number;
  slippedToTomorrow?: boolean;
  factors: string[];
  primaryReason: string;
} {
  const factors: string[] = [];
  const history = summary.history || [];

  if (history.length === 0) {
    return {
      intervalDays: config.initialStudyIntervalDays,
      confidenceScore: 40,
      retrievalStreak: 0,
      factors: ['Scheduled for tomorrow (+1d).'],
      primaryReason: 'Scheduled for tomorrow (+1d)'
    };
  }

  let currentInterval = config.initialStudyIntervalDays;
  let streak = 0;
  let lastValidScore = 5;
  let completedReviews = 0;
  let slippedToTomorrow = false;

  for (let i = 0; i < history.length; i++) {
    const log = history[i];

    if (log.isMissed) {
      // Smart Rescheduling Logic: Preserve Momentum
      const isHighMomentum = completedReviews >= 3 || streak >= 3 || lastValidScore >= 7;
      if (isHighMomentum) {
        // Preserve streak & interval curve; slip due date to Tomorrow (+1d from missed date)
        slippedToTomorrow = true;
        currentInterval = 1;
      } else {
        // Early-Stage Topic (reviewCount < 2 or last score < 5): short reinforcement spacing tomorrow
        streak = Math.max(0, streak - 1);
        slippedToTomorrow = true;
        currentInterval = config.failedRetrievalIntervalDays;
      }
      continue;
    }

    slippedToTomorrow = false;
    const score = log.retentionScore ?? 5;
    lastValidScore = score;
    if (log.sessionType === 'Revise' || i > 0) {
      completedReviews += 1;
    }

    const qCount = (log.mcqCount || 0) + (log.vsaCount || 0) + (log.saCount || 0) + (log.laCount || 0);
    const errCount = log.errors || 0;
    const accuracy = qCount > 0 ? Math.round(((qCount - errCount) / qCount) * 100) : undefined;
    const hasFriction = Boolean(log.frictionAnalysis && log.frictionAnalysis.trim().length > 15);
    const fTotal = (log.activeMins || 0) + (log.distractionMins || 0) + (log.recoveryMins || 0);
    const fScore = fTotal > 0 ? Math.round(((log.activeMins || 0) / fTotal) * 100) : 100;

    if (i === 0) {
      if (score >= config.retentionThresholds.strongMin && (errCount === 0 || accuracy === 100)) {
        currentInterval = config.initialStudyStrongIntervalDays;
      } else {
        currentInterval = config.initialStudyIntervalDays;
      }
      streak = score >= 7 ? 1 : 0;
    } else {
      if (score <= config.retentionThresholds.failedMax || (accuracy !== undefined && accuracy < 40 && qCount >= 4)) {
        streak = 0;
        currentInterval = config.failedRetrievalIntervalDays;
      } else if (score <= config.retentionThresholds.weakMax || (accuracy !== undefined && accuracy < 60 && qCount >= 4)) {
        streak = Math.max(0, streak - 1);
        currentInterval = Math.max(config.minIntervalDays, Math.min(2, currentInterval));
      } else if (score <= config.retentionThresholds.moderateMax) {
        streak += 1;
        const multiplier = config.progressionMultipliers.moderate;
        currentInterval = Math.max(currentInterval + 1, Math.round(currentInterval * multiplier));
      } else {
        streak += 1;
        if (streak === 1) {
          currentInterval = score === 10 ? 4 : 3;
        } else if (streak === 2) {
          currentInterval = Math.max(6, Math.round(currentInterval * config.progressionMultipliers.strong));
        } else if (streak === 3) {
          currentInterval = Math.max(14, Math.round(currentInterval * config.progressionMultipliers.strong));
        } else {
          currentInterval = Math.max(28, Math.round(currentInterval * 2.0));
        }
      }

      if (i === history.length - 1) {
        if (accuracy !== undefined && qCount >= 5) {
          if (accuracy >= config.accuracyThresholds.highAccuracy) {
            currentInterval += config.modifiers.highAccuracyBonusDays;
            factors.push(`${accuracy}% accuracy (+${config.modifiers.highAccuracyBonusDays}d)`);
          } else if (accuracy < config.accuracyThresholds.lowAccuracy) {
            currentInterval = Math.max(1, currentInterval - config.modifiers.lowAccuracyPenaltyDays);
            factors.push(`${accuracy}% accuracy (-${config.modifiers.lowAccuracyPenaltyDays}d)`);
          }
        }

        if (hasFriction) {
          currentInterval = Math.max(1, currentInterval - config.modifiers.frictionPenaltyDays);
          factors.push('Note recorded (-1d)');
        }

        if (fScore < 60) {
          currentInterval = Math.max(1, Math.round(currentInterval * config.modifiers.lowFocusPenaltyFactor));
          factors.push(`Focus ${fScore}%`);
        }
      }
    }
  }

  const finalInterval = Math.max(config.minIntervalDays, Math.min(config.maxIntervalDays, Math.round(currentInterval)));
  const latestLog = history[history.length - 1];
  const latestScore = latestLog.retentionScore ?? lastValidScore;
  let primaryReason = '';

  if (latestLog.isMissed) {
    if (completedReviews >= 3 || streak >= 3 || lastValidScore >= 7) {
      primaryReason = `Moved to tomorrow • Streak ${streak} preserved`;
      factors.unshift(`Streak ${streak} preserved • Rescheduled for tomorrow.`);
    } else {
      primaryReason = `Moved to tomorrow • Short reinforcement`;
      factors.unshift('Scheduled for tomorrow to build stability.');
    }
  } else if (history.length === 1) {
    primaryReason = `Next review in ${finalInterval}d`;
    factors.unshift(`First review in ${finalInterval}d.`);
  } else if (latestScore <= config.retentionThresholds.failedMax) {
    primaryReason = `Score ${latestScore}/10 • Review in 1d`;
    factors.unshift(`Score ${latestScore}/10 • Scheduled for tomorrow.`);
  } else if (latestScore <= config.retentionThresholds.weakMax) {
    primaryReason = `Score ${latestScore}/10 • Review in ${finalInterval}d`;
    factors.unshift(`Score ${latestScore}/10 • ${finalInterval}d spacing.`);
  } else {
    primaryReason = `Score ${latestScore}/10 • Streak ${streak} (+${finalInterval}d)`;
    factors.unshift(`Score ${latestScore}/10 • Streak ${streak}.`);
  }

  let confidence = Math.min(85, 40 + history.length * 15);
  if (summary.totalQuestionsSolved >= 5) confidence = Math.min(100, confidence + 10);
  if (latestLog.retentionScore !== undefined) confidence = Math.min(100, confidence + 5);

  return {
    intervalDays: finalInterval,
    confidenceScore: confidence,
    retrievalStreak: streak,
    slippedToTomorrow,
    factors,
    primaryReason
  };
}

export function generateAdaptiveRecommendations(
  logs: LogItem[],
  referenceDateStr?: string
): RevisionRecommendation[] {
  const refDateStr = referenceDateStr || getLocalDateString(0);
  const refDate = new Date(`${refDateStr}T00:00:00`);
  const topicHistories = buildTopicHistories(logs);
  const recommendations: RevisionRecommendation[] = [];

  for (const summary of topicHistories.values()) {
    const { intervalDays, confidenceScore, retrievalStreak, factors, primaryReason } = calculateAdaptiveInterval(summary);

    const lastDate = new Date(summary.lastStudiedAt || Date.now());
    lastDate.setHours(0, 0, 0, 0);

    const targetDate = new Date(lastDate);
    targetDate.setDate(targetDate.getDate() + intervalDays);

    const targetYear = targetDate.getFullYear();
    const targetMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
    const targetDay = String(targetDate.getDate()).padStart(2, '0');
    const targetReviewDate = `${targetYear}-${targetMonth}-${targetDay}`;

    const diffTime = targetDate.getTime() - refDate.getTime();
    const daysOverdueOrUntil = Math.round(diffTime / (1000 * 60 * 60 * 24));

    let urgency: 'overdue' | 'due_today' | 'upcoming' | 'stable';
    if (daysOverdueOrUntil < 0) {
      urgency = 'overdue';
    } else if (daysOverdueOrUntil === 0) {
      urgency = 'due_today';
    } else if (daysOverdueOrUntil <= 2) {
      urgency = 'upcoming';
    } else {
      urgency = 'stable';
    }

    const evidenceSummary = `${summary.totalSessions} sessions • R ${summary.averageRetentionScore.toFixed(1)}/10 • Streak ${retrievalStreak}`;

    recommendations.push({
      topicKey: summary.topicKey,
      subject: summary.subject,
      topic: summary.topicName,
      chapter: summary.subTopicName,
      recommendedIntervalDays: intervalDays,
      targetReviewDate,
      retentionBand: summary.retentionBand,
      confidenceScore,
      urgency,
      daysOverdueOrUntil,
      retrievalStreak,
      latestRetentionScore: summary.latestRetentionScore ?? Math.round(summary.averageRetentionScore),
      totalQuestionsSolved: summary.totalQuestionsSolved,
      logIds: summary.history.map(h => h.id).filter(Boolean),
      explanation: {
        primaryReason,
        factors,
        evidenceSummary
      }
    });
  }

  return recommendations.sort((a, b) => a.daysOverdueOrUntil - b.daysOverdueOrUntil);
}

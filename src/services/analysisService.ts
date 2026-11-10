import { LogItem, SubjectKey, getLocalDateString, getTotalStudyTime } from '../types';
import { calculateStreakDays } from './trackerService';

export type TimeframeWindow = '7d' | '14d' | '30d' | 'all';

export interface SubjectDonutSegment {
  id: SubjectKey;
  name: string;
  color: string;
  minutes: number;
  hoursLabel: string;
  percent: number;
  strokeDasharray: string;
  strokeDashoffset: number;
}

export interface DailyStackedBar {
  dateStr: string;
  dayShort: string;
  totalMins: number;
  segments: {
    subject: SubjectKey;
    color: string;
    minutes: number;
    heightPx: number;
    yPx: number;
  }[];
}

export interface SubjectPracticeTrack {
  id: SubjectKey;
  name: string;
  color: string;
  questions: number;
  errors: number;
  accuracy: number;
}

export interface PaceCoordinateNode {
  dateStr: string;
  dayLabel: string;
  pagesPerHour: number;
  questionsPerHour: number;
  combinedPace: number;
  x: number;
  y: number;
}

export interface AnalysisDashboardData {
  totalStudyMinutes: number;
  totalTimeLabel: string;
  donutSegments: SubjectDonutSegment[];
  dailyBars: DailyStackedBar[];
  maxDailyHours: number;
  practiceTracks: SubjectPracticeTrack[];
  overallAccuracy: number;
  avgSecondsPerItem: number;
  streakDays: number;
  paceNodes: PaceCoordinateNode[];
  bezierLinePath: string;
  bezierAreaPath: string;
  avgPaceLabel: string;
  peakPaceLabel: string;
}

const CANONICAL_SUBJECTS: { id: SubjectKey; name: string; color: string }[] = [
  { id: 'phys', name: 'Physics', color: '#38bdf8' },
  { id: 'chem', name: 'Chemistry', color: '#f59e0b' },
  { id: 'math', name: 'Maths', color: '#a855f7' },
  { id: 'bio', name: 'Biology', color: '#10b981' }
];

export function formatHoursMinsShort(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Computes all 4 chart datasets for the Analysis view.
 */
export function computeAnalysisDashboardData(
  logs: LogItem[],
  timeframe: TimeframeWindow
): AnalysisDashboardData {
  const validLogs = logs.filter(l => !l.isMissed);
  const now = Date.now();
  const daysLimit =
    timeframe === '7d' ? 7 : timeframe === '14d' ? 14 : timeframe === '30d' ? 30 : 3650;
  const cutoffMs = now - daysLimit * 86400000;

  const filteredLogs =
    timeframe === 'all'
      ? validLogs
      : validLogs.filter(l => (l.timestamp || 0) >= cutoffMs);

  // 1. Study Time Donut (r = 74, circumference = 2 * pi * 74 = 464.955)
  const circumference = 2 * Math.PI * 74;
  const subjectMinsMap: Record<SubjectKey, number> = {
    phys: 0,
    chem: 0,
    math: 0,
    bio: 0
  };

  filteredLogs.forEach(l => {
    const sub = (l.subject || 'phys') as SubjectKey;
    if (subjectMinsMap[sub] !== undefined) {
      subjectMinsMap[sub] += getTotalStudyTime(l);
    }
  });

  const totalStudyMinutes = Object.values(subjectMinsMap).reduce((a, b) => a + b, 0);
  const totalTimeLabel = formatHoursMinsShort(totalStudyMinutes);

  let cumulativeLength = 0;
  const donutSegments: SubjectDonutSegment[] = CANONICAL_SUBJECTS.map(sub => {
    const minutes = subjectMinsMap[sub.id] || 0;
    const ratio = totalStudyMinutes > 0 ? minutes / totalStudyMinutes : 0;
    const arcLen = ratio * circumference;
    const offset = -cumulativeLength;
    cumulativeLength += arcLen;

    return {
      id: sub.id,
      name: sub.name,
      color: sub.color,
      minutes,
      hoursLabel: `${(minutes / 60).toFixed(1)}h`,
      percent: Math.round(ratio * 100),
      strokeDasharray: `${arcLen.toFixed(1)} ${circumference.toFixed(1)}`,
      strokeDashoffset: Number(offset.toFixed(1))
    };
  });

  // 2. Daily Activity Stacked Bars (7-day window anchored to today)
  const barDaysCount = 7;
  const rawDailyData: {
    dateStr: string;
    dayShort: string;
    perSubject: Record<SubjectKey, number>;
    totalMins: number;
  }[] = [];

  for (let i = barDaysCount - 1; i >= 0; i--) {
    const dStr = getLocalDateString(-i);
    const dateObj = new Date(`${dStr}T12:00:00`);
    const dayShort = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const perSubject: Record<SubjectKey, number> = { phys: 0, chem: 0, math: 0, bio: 0 };

    validLogs.forEach(l => {
      const logDate =
        l.dateKey || (l.timestamp ? getLocalDateString(0, new Date(l.timestamp)) : '');
      if (logDate === dStr) {
        const sub = (l.subject || 'phys') as SubjectKey;
        if (perSubject[sub] !== undefined) {
          perSubject[sub] += getTotalStudyTime(l);
        }
      }
    });

    const totalMins = Object.values(perSubject).reduce((a, b) => a + b, 0);
    rawDailyData.push({ dateStr: dStr, dayShort, perSubject, totalMins });
  }

  const peakDailyMins = Math.max(...rawDailyData.map(d => d.totalMins), 360); // Minimum scale 6h (360m)
  const maxDailyHours = Math.max(8, Math.ceil(peakDailyMins / 120) * 2);
  const maxScaleMins = maxDailyHours * 60;
  const chartTopY = 20;
  const chartBottomY = 180;
  const chartHeightPx = chartBottomY - chartTopY; // 160px

  const dailyBars: DailyStackedBar[] = rawDailyData.map(day => {
    let currentBottomY = chartBottomY;
    const segments: DailyStackedBar['segments'] = [];

    CANONICAL_SUBJECTS.forEach(sub => {
      const mins = day.perSubject[sub.id] || 0;
      if (mins > 0) {
        const hPx = Math.max(3, Math.round((mins / maxScaleMins) * chartHeightPx));
        const yPx = Math.max(chartTopY, currentBottomY - hPx);
        segments.push({
          subject: sub.id,
          color: sub.color,
          minutes: mins,
          heightPx: currentBottomY - yPx,
          yPx
        });
        currentBottomY = yPx - 2; // 2px gap between stacked segments
      }
    });

    return {
      dateStr: day.dateStr,
      dayShort: day.dayShort,
      totalMins: day.totalMins,
      segments
    };
  });

  // 3. Practice Activity (MCQ Accuracy + Empirical Benchmarks)
  let totalAllQs = 0;
  let totalAllErrors = 0;
  let totalPracticeSeconds = 0;

  const practiceTracks: SubjectPracticeTrack[] = CANONICAL_SUBJECTS.map(sub => {
    const subLogs = filteredLogs.filter(l => l.subject === sub.id);
    let qs = 0;
    let errs = 0;

    subLogs.forEach(l => {
      const qCount =
        (l.mcqCount || 0) + (l.vsaCount || 0) + (l.saCount || 0) + (l.laCount || 0);
      if (qCount > 0) {
        qs += qCount;
        errs += Math.min(qCount, l.errors || 0);
        totalPracticeSeconds += getTotalStudyTime(l) * 60;
      }
    });

    totalAllQs += qs;
    totalAllErrors += errs;

    const accuracy = qs > 0 ? Math.max(0, Math.round(((qs - errs) / qs) * 100)) : 0;

    return {
      id: sub.id,
      name: sub.name,
      color: sub.color,
      questions: qs,
      errors: errs,
      accuracy
    };
  });

  const overallAccuracy =
    totalAllQs > 0
      ? Math.max(0, Math.round(((totalAllQs - totalAllErrors) / totalAllQs) * 100))
      : 0;
  const avgSecondsPerItem =
    totalAllQs > 0 ? Math.max(10, Math.round(totalPracticeSeconds / totalAllQs)) : 0;
  const streakDays = calculateStreakDays(validLogs);

  // 4. Study Pace (Smooth Cubic-Bezier Area Trendline)
  const pacePointsRaw = rawDailyData.map((day, idx) => {
    const dayLogs = validLogs.filter(l => {
      const ld = l.dateKey || (l.timestamp ? getLocalDateString(0, new Date(l.timestamp)) : '');
      return ld === day.dateStr;
    });

    let pages = 0;
    let qs = 0;
    let mins = 0;

    dayLogs.forEach(l => {
      mins += getTotalStudyTime(l);
      if (l.startPage !== undefined && l.endPage !== undefined && l.endPage > l.startPage) {
        pages += l.endPage - l.startPage;
      }
      qs += (l.mcqCount || 0) + (l.vsaCount || 0) + (l.saCount || 0) + (l.laCount || 0);
    });

    const hours = mins / 60;
    const pagesPerHour = hours > 0 ? Number((pages / hours).toFixed(1)) : 0;
    const questionsPerHour = hours > 0 ? Number((qs / hours).toFixed(1)) : 0;
    const combinedPace = Number((pagesPerHour + questionsPerHour * 0.5).toFixed(1));

    return {
      dateStr: day.dateStr,
      dayLabel: `D${idx + 1}`,
      pagesPerHour,
      questionsPerHour,
      combinedPace
    };
  });

  const maxPaceVal = Math.max(...pacePointsRaw.map(p => p.combinedPace), 20);
  const startX = 20;
  const endX = 440;
  const stepX = (endX - startX) / Math.max(1, pacePointsRaw.length - 1);

  const paceNodes: PaceCoordinateNode[] = pacePointsRaw.map((pt, idx) => {
    const x = Math.round(startX + idx * stepX);
    const normalizedY = pt.combinedPace / maxPaceVal;
    const y = Math.round(145 - normalizedY * 115); // Maps [0, max] -> [145, 30]
    return {
      ...pt,
      x,
      y
    };
  });

  // Construct smooth cubic-bezier SVG path through paceNodes
  let bezierLinePath = '';
  if (paceNodes.length > 0) {
    bezierLinePath = `M ${paceNodes[0].x},${paceNodes[0].y}`;
    for (let i = 0; i < paceNodes.length - 1; i++) {
      const curr = paceNodes[i];
      const next = paceNodes[i + 1];
      const midX = Math.round((curr.x + next.x) / 2);
      bezierLinePath += ` C ${midX},${curr.y} ${midX},${next.y} ${next.x},${next.y}`;
    }
  }

  const bezierAreaPath =
    paceNodes.length > 0
      ? `${bezierLinePath} L ${paceNodes[paceNodes.length - 1].x},160 L ${paceNodes[0].x},160 Z`
      : '';

  const activePaceVals = pacePointsRaw.map(p => p.combinedPace).filter(v => v > 0);
  const avgPace =
    activePaceVals.length > 0
      ? (activePaceVals.reduce((a, b) => a + b, 0) / activePaceVals.length).toFixed(1)
      : '0.0';
  const peakPace =
    activePaceVals.length > 0 ? Math.max(...activePaceVals).toFixed(1) : '0.0';

  return {
    totalStudyMinutes,
    totalTimeLabel,
    donutSegments,
    dailyBars,
    maxDailyHours,
    practiceTracks,
    overallAccuracy,
    avgSecondsPerItem,
    streakDays,
    paceNodes,
    bezierLinePath,
    bezierAreaPath,
    avgPaceLabel: `${avgPace} / hr`,
    peakPaceLabel: `${peakPace} / hr`
  };
}

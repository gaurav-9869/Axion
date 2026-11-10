import { LogItem, getFocusScore, getTotalStudyTime, getLocalDateString } from '../types';

export interface ArchiveFilterOptions {
  searchQuery?: string;
  selectedSubject?: string;
  selectedMode?: string;
  selectedDate?: string | null;
  selectedMonth?: string;
  sortBy?: 'newest' | 'oldest' | 'focusHigh' | 'focusLow';
}

export interface DaySummary {
  dateKey: string;
  dayLabel: string;
  fullDateLabel: string;
  isToday: boolean;
  isYesterday: boolean;
  totalStudyMinutes: number;
  totalPracticeMinutes: number;
  totalQuestions: number;
  averageFocus: number;
  logs: LogItem[];
}

export function extractDateKeyFromLog(log: LogItem | undefined | null): string {
  if (!log) return getLocalDateString(0);
  if (log.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(log.dateKey)) {
    return log.dateKey;
  }
  const rawTs: any = log.timestamp;
  let tsMillis: number | null = null;
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

  if (tsMillis !== null && !isNaN(tsMillis)) {
    try {
      const d = new Date(tsMillis);
      if (!isNaN(d.getTime())) {
        return getLocalDateString(0, d);
      }
    } catch {}
  }

  if (log.nextReviewDate && /^\d{4}-\d{2}-\d{2}$/.test(log.nextReviewDate)) {
    return log.nextReviewDate;
  }
  return getLocalDateString(0);
}

export function formatDayLabel(dateStr: string): { dayLabel: string; fullDateLabel: string; isToday: boolean; isYesterday: boolean } {
  const todayStr = getLocalDateString(0);
  const yesterdayStr = getLocalDateString(-1);

  const isToday = dateStr === todayStr;
  const isYesterday = dateStr === yesterdayStr;

  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const weekdayShort = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const weekdayFull = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const monthFull = dateObj.toLocaleDateString('en-US', { month: 'long' });

    const dayLabel = isToday ? 'Today' : isYesterday ? 'Yesterday' : `${weekdayShort} ${day}`;
    const fullDateLabel = `${weekdayFull}, ${monthFull} ${day}`;

    return { dayLabel, fullDateLabel, isToday, isYesterday };
  } catch {
    return {
      dayLabel: isToday ? 'Today' : isYesterday ? 'Yesterday' : dateStr,
      fullDateLabel: dateStr,
      isToday,
      isYesterday
    };
  }
}

export function formatTimeHoursMins(minutes: number): string {
  if (minutes <= 0) return '0m';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export function groupLogsByDate(logs: LogItem[]): Record<string, LogItem[]> {
  const groups: Record<string, LogItem[]> = {};
  logs.forEach(log => {
    if (!log) return;
    const dateKey = extractDateKeyFromLog(log);
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(log);
  });
  return groups;
}

export function calculateDaySummary(dateKey: string, dayLogs: LogItem[]): DaySummary {
  const { dayLabel, fullDateLabel, isToday, isYesterday } = formatDayLabel(dateKey);

  let totalStudyMinutes = 0;
  let totalPracticeMinutes = 0;
  let totalQuestions = 0;
  let totalFocusScore = 0;

  dayLogs.forEach(log => {
    const duration = getTotalStudyTime(log);
    totalStudyMinutes += duration;
    totalPracticeMinutes += log.activeMins || duration;
    totalQuestions +=
      (log.mcqCount || 0) + (log.vsaCount || 0) + (log.saCount || 0) + (log.laCount || 0);
    totalFocusScore += getFocusScore(log);
  });

  const averageFocus = dayLogs.length > 0 ? Math.round(totalFocusScore / dayLogs.length) : 0;

  return {
    dateKey,
    dayLabel,
    fullDateLabel,
    isToday,
    isYesterday,
    totalStudyMinutes,
    totalPracticeMinutes,
    totalQuestions,
    averageFocus,
    logs: dayLogs
  };
}

export function filterLogs(logs: LogItem[], options: ArchiveFilterOptions): LogItem[] {
  const {
    searchQuery = '',
    selectedSubject = 'all',
    selectedMode = 'all',
    selectedDate = null,
    selectedMonth = 'all',
    sortBy = 'newest'
  } = options;

  const queryNormalized = searchQuery.trim().toLowerCase();

  const filtered = logs.filter(log => {
    // Subject filter
    if (selectedSubject !== 'all' && log.subject !== selectedSubject) {
      return false;
    }

    // Session Mode filter
    if (selectedMode !== 'all') {
      const mode = (log.sessionType || '').toLowerCase();
      const targetMode = selectedMode.toLowerCase();
      if (!mode.includes(targetMode)) {
        return false;
      }
    }

    // Date filter
    const logDateKey = extractDateKeyFromLog(log);
    if (selectedDate && logDateKey !== selectedDate) {
      return false;
    }

    // Month filter
    if (selectedMonth !== 'all' && !logDateKey.startsWith(selectedMonth)) {
      return false;
    }

    // Search query filter
    if (queryNormalized) {
      const topic = (log.topic || '').toLowerCase();
      const chapter = (log.chapter || '').toLowerCase();
      const notes = (log.notes || '').toLowerCase();
      const friction = (log.frictionAnalysis || '').toLowerCase();

      const matches =
        topic.includes(queryNormalized) ||
        chapter.includes(queryNormalized) ||
        notes.includes(queryNormalized) ||
        friction.includes(queryNormalized);

      if (!matches) return false;
    }

    return true;
  });

  // Sort
  return filtered.sort((a, b) => {
    if (sortBy === 'focusHigh') {
      return getFocusScore(b) - getFocusScore(a);
    }
    if (sortBy === 'focusLow') {
      return getFocusScore(a) - getFocusScore(b);
    }
    if (sortBy === 'oldest') {
      const dateA = extractDateKeyFromLog(a);
      const dateB = extractDateKeyFromLog(b);
      return dateA.localeCompare(dateB);
    }
    // newest default
    const dateA = extractDateKeyFromLog(a);
    const dateB = extractDateKeyFromLog(b);
    return dateB.localeCompare(dateA);
  });
}

export interface CalendarCell {
  dateStr: string;
  day: number;
  inMonth: boolean;
  sessionCount: number;
}

export function filterAndSortArchiveLogs(
  logs: LogItem[],
  searchQuery: string,
  selectedSubject: string,
  selectedType: string,
  selectedDate: string | null,
  sortOrder: 'DESC' | 'ASC'
): LogItem[] {
  const q = searchQuery.trim().toLowerCase();

  const filtered = logs.filter(log => {
    if (!log || log.isMissed) return false;
    if (selectedSubject !== 'ALL' && log.subject !== selectedSubject) return false;
    if (selectedType !== 'ALL' && log.sessionType !== selectedType) return false;

    const logDate = extractDateKeyFromLog(log);
    if (selectedDate && logDate !== selectedDate) return false;

    if (q) {
      const topic = (log.topic || '').toLowerCase();
      const chapter = (log.chapter || '').toLowerCase();
      const notes = (log.notes || '').toLowerCase();
      const friction = (log.frictionAnalysis || '').toLowerCase();
      if (
        !topic.includes(q) &&
        !chapter.includes(q) &&
        !notes.includes(q) &&
        !friction.includes(q)
      ) {
        return false;
      }
    }

    return true;
  });

  return filtered.sort((a, b) => {
    const tsA = typeof a.timestamp === 'number' ? a.timestamp : 0;
    const tsB = typeof b.timestamp === 'number' ? b.timestamp : 0;
    return sortOrder === 'DESC' ? tsB - tsA : tsA - tsB;
  });
}

export function buildCalendarMonthGrid(
  year: number,
  month: number,
  logs: LogItem[]
): CalendarCell[] {
  const countMap: Record<string, number> = {};
  logs.forEach(log => {
    if (!log || log.isMissed) return;
    const dk = extractDateKeyFromLog(log);
    countMap[dk] = (countMap[dk] || 0) + 1;
  });

  const firstDayOfMonth = new Date(year, month, 1);
  const startWeekday = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: CalendarCell[] = [];

  const formatYMD = (y: number, m: number, d: number) => {
    const dt = new Date(y, m, d);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  for (let i = startWeekday - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    const dateStr = formatYMD(year, month - 1, dayNum);
    cells.push({
      dateStr,
      day: dayNum,
      inMonth: false,
      sessionCount: countMap[dateStr] || 0
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatYMD(year, month, d);
    cells.push({
      dateStr,
      day: d,
      inMonth: true,
      sessionCount: countMap[dateStr] || 0
    });
  }

  const remaining = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const dateStr = formatYMD(year, month + 1, d);
    cells.push({
      dateStr,
      day: d,
      inMonth: false,
      sessionCount: countMap[dateStr] || 0
    });
  }

  return cells;
}

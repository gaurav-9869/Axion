import { getLocalDateString } from '../types';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

const DAY_NAME_TO_INDEX: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6
};

/**
 * Format a JavaScript Date into YYYY-MM-DD in local time
 */
export function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse a natural language date expression into a deterministic YYYY-MM-DD string.
 * Returns fallbackDate if unable to parse.
 */
export function parseNaturalDate(input: string, fallbackDate?: string): string {
  if (!input || typeof input !== 'string') {
    return fallbackDate || getLocalDateString(0);
  }

  const clean = input.trim().toLowerCase();

  // 1. Direct YYYY-MM-DD pattern
  const isoMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const yyyy = isoMatch[1];
    const mm = isoMatch[2].padStart(2, '0');
    const dd = isoMatch[3].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // 2. Direct DD/MM/YYYY or DD-MM-YYYY pattern
  const ddmmyyyyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyyMatch) {
    const dd = ddmmyyyyMatch[1].padStart(2, '0');
    const mm = ddmmyyyyMatch[2].padStart(2, '0');
    const yyyy = ddmmyyyyMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const now = new Date();
  const currentDayIndex = now.getDay(); // 0 is Sunday, 1 is Monday...

  // 3. Simple relative terms
  if (clean === 'today' || clean === 'now' || clean === 'tonight') {
    return getLocalDateString(0);
  }
  if (clean === 'yesterday') {
    return getLocalDateString(-1);
  }
  if (clean === 'tomorrow' || clean === 'tmrw') {
    return getLocalDateString(1);
  }
  if (clean === 'day before yesterday') {
    return getLocalDateString(-2);
  }
  if (clean === 'day after tomorrow') {
    return getLocalDateString(2);
  }

  // 4. "in X days" or "X days ago"
  const inDaysMatch = clean.match(/in\s+(\d+)\s+days?/);
  if (inDaysMatch) {
    return getLocalDateString(parseInt(inDaysMatch[1], 10));
  }
  const daysAgoMatch = clean.match(/(\d+)\s+days?\s+ago/);
  if (daysAgoMatch) {
    return getLocalDateString(-parseInt(daysAgoMatch[1], 10));
  }

  // 5. Weekday references: "last friday", "next monday", "this wednesday", "friday"
  const weekdayRegex = /(last|next|this)?\s*(monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)/;
  const match = clean.match(weekdayRegex);

  if (match) {
    const modifier = match[1];
    const dayName = match[2];
    const targetDayIndex = DAY_NAME_TO_INDEX[dayName];

    if (targetDayIndex !== undefined) {
      if (modifier === 'last') {
        // Find most recent past instance of this day
        let diff = currentDayIndex - targetDayIndex;
        if (diff <= 0) diff += 7;
        return getLocalDateString(-diff);
      } else if (modifier === 'next') {
        // Find upcoming instance next week
        let diff = targetDayIndex - currentDayIndex;
        if (diff <= 0) diff += 7;
        return getLocalDateString(diff);
      } else if (modifier === 'this') {
        // Day in the current week (Monday to Sunday)
        // We consider Monday as start of week (1) and Sunday as end of week (0 -> 7)
        const currentMondayOffset = (currentDayIndex === 0 ? -6 : 1 - currentDayIndex);
        const targetOffset = (targetDayIndex === 0 ? 6 : targetDayIndex - 1);
        const totalOffset = currentMondayOffset + targetOffset;
        return getLocalDateString(totalOffset);
      } else {
        // Unmodified day name (e.g. "on friday", "monday"): pick the closest future or today
        let diff = targetDayIndex - currentDayIndex;
        if (diff < 0) diff += 7;
        return getLocalDateString(diff);
      }
    }
  }

  // 6. Natural month expressions like "September 18" or "18th Sep" or "18 September 2026"
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  for (let m = 0; m < monthNames.length; m++) {
    const mName = monthNames[m];
    if (clean.includes(mName)) {
      const dayMatch = clean.match(/(\d{1,2})(?:st|nd|rd|th)?/);
      if (dayMatch) {
        const day = parseInt(dayMatch[1], 10);
        const yearMatch = clean.match(/20\d{2}/);
        const year = yearMatch ? parseInt(yearMatch[0], 10) : now.getFullYear();
        const d = new Date(year, m, day);
        if (!isNaN(d.getTime())) {
          return formatDate(d);
        }
      }
    }
  }

  return fallbackDate || getLocalDateString(0);
}

/**
 * Parses time periods (e.g. "this week", "last week", "past 7 days", "this month")
 * into a structured start and end date range.
 */
export function parseDateRange(input: string): DateRange {
  const clean = input.trim().toLowerCase();
  const today = new Date();
  const currentDayIndex = today.getDay(); // 0 is Sun, 1 is Mon...

  if (clean.includes('last week') || clean.includes('past week')) {
    const currentMondayOffset = (currentDayIndex === 0 ? -6 : 1 - currentDayIndex);
    const lastMondayOffset = currentMondayOffset - 7;
    const lastSundayOffset = currentMondayOffset - 1;
    return {
      startDate: getLocalDateString(lastMondayOffset),
      endDate: getLocalDateString(lastSundayOffset)
    };
  }

  if (clean.includes('this week') || clean.includes('current week')) {
    const currentMondayOffset = (currentDayIndex === 0 ? -6 : 1 - currentDayIndex);
    const currentSundayOffset = currentMondayOffset + 6;
    return {
      startDate: getLocalDateString(currentMondayOffset),
      endDate: getLocalDateString(currentSundayOffset)
    };
  }

  if (clean.includes('next week')) {
    const currentMondayOffset = (currentDayIndex === 0 ? -6 : 1 - currentDayIndex);
    const nextMondayOffset = currentMondayOffset + 7;
    const nextSundayOffset = nextMondayOffset + 6;
    return {
      startDate: getLocalDateString(nextMondayOffset),
      endDate: getLocalDateString(nextSundayOffset)
    };
  }

  if (clean.includes('last 7 days') || clean.includes('past 7 days')) {
    return {
      startDate: getLocalDateString(-6),
      endDate: getLocalDateString(0)
    };
  }

  if (clean.includes('last 30 days') || clean.includes('past 30 days') || clean.includes('last month')) {
    return {
      startDate: getLocalDateString(-29),
      endDate: getLocalDateString(0)
    };
  }

  if (clean.includes('today')) {
    const todayStr = getLocalDateString(0);
    return { startDate: todayStr, endDate: todayStr };
  }

  if (clean.includes('yesterday')) {
    const yestStr = getLocalDateString(-1);
    return { startDate: yestStr, endDate: yestStr };
  }

  // Default to today
  const defaultToday = getLocalDateString(0);
  return { startDate: defaultToday, endDate: defaultToday };
}

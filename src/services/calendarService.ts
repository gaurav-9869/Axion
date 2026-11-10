import { LogItem, getLocalDateString, getSubjectConfig } from '../types';
import { ensureValidToken } from '../lib/auth';

export type CalendarMasterBlockType = 'Study' | 'Revision' | 'Exercise';

const BLOCK_COLOR_IDS: Record<CalendarMasterBlockType, string> = {
  Study: '10',    // Basil / Deep Green (#0B8043)
  Revision: '9',  // Blueberry / Bold Blue (#039BE5)
  Exercise: '11'  // Tomato / Crimson Red (#D50000)
};

function getMasterBlockTitle(type: CalendarMasterBlockType, logs: LogItem[]): string {
  const topics = Array.from(new Set(logs.map(l => l.topic?.trim()).filter(Boolean)));
  const blockLabel = type === 'Exercise' ? 'Daily Practice Block' : `Daily ${type} Block`;
  if (topics.length > 0) {
    const topicSummary =
      topics.slice(0, 3).join(', ') + (topics.length > 3 ? ` +${topics.length - 3} more` : '');
    return `[${type}] ${blockLabel} — ${topicSummary}`;
  }
  return `[${type}] ${blockLabel}`;
}

function buildMasterBlockDescription(type: CalendarMasterBlockType, logs: LogItem[]): string {
  const headerLabel = type === 'Exercise' ? 'DAILY PRACTICE BLOCK' : `DAILY ${type.toUpperCase()} BLOCK`;
  let description = `=== ${headerLabel} ===\n\n`;

  logs.forEach(log => {
    const subjectName = getSubjectConfig(log.subject).name;
    description += `• Subject: ${subjectName}\n`;
    description += `  - Type: ${log.sessionType || type}\n`;
    description += `  - Topic: ${log.topic || 'Untitled Topic'}\n`;
    if (log.chapter) {
      description += `  - Chapter: ${log.chapter}\n`;
    }
    if (log.mcqCount !== undefined && log.mcqCount > 0) {
      description += `  - MCQs Completed: ${log.mcqCount}\n`;
    }
    if (log.startPage !== undefined && log.endPage !== undefined && log.endPage > log.startPage) {
      description += `  - Pages: ${log.startPage} - ${log.endPage}\n`;
    }
    if (log.activeMins) {
      description += `  - Active Mins: ${log.activeMins}\n`;
    }
    if (log.retentionScore !== undefined && log.retentionScore > 0) {
      description += `  - Retention: ${log.retentionScore}/10\n`;
    }
    if (log.notes) {
      description += `  - Notes: ${log.notes}\n`;
    }
    description += `\n`;
  });

  const totalMins = logs.reduce((acc, l) => acc + (l.activeMins || 0), 0);
  description += `Total Active Time: ${totalMins} minutes\n`;
  return description;
}

/**
 * Strictly creates or updates ONLY three master blocks for today:
 * 1. [Study] Daily Study Block -> Green (colorId: "10")
 * 2. [Revision] Daily Revision Block -> Blue (colorId: "9")
 * 3. [Exercise] Daily Practice Block -> Red (colorId: "11")
 * Zero future micro-revision events are created.
 */
export async function syncDailyMasterBlocksToCalendar(
  todayLogs: LogItem[],
  todayDateStr: string = getLocalDateString(0)
): Promise<void> {
  const token = await ensureValidToken();
  if (!token) {
    throw new Error('Google Calendar authentication token is missing or expired.');
  }

  const studyLogs = todayLogs.filter(l => !l.isMissed && l.sessionType === 'Study');
  const revisionLogs = todayLogs.filter(l => l.sessionType === 'Revise' || l.isMissed);
  const exerciseLogs = todayLogs.filter(
    l =>
      !l.isMissed &&
      (l.sessionType === 'Exercise' ||
        (l.sessionType !== 'Study' &&
          l.sessionType !== 'Revise' &&
          ((l.practiceMins && l.practiceMins > 0) || (l.mcqCount && l.mcqCount > 0))))
  );

  const syncSingleMasterBlock = async (type: CalendarMasterBlockType, logs: LogItem[]) => {
    if (logs.length === 0) return;

    const hash = `pcbm_${type.toLowerCase()}_${todayDateStr}`;
    const title = getMasterBlockTitle(type, logs);
    const description = buildMasterBlockDescription(type, logs);
    const colorId = BLOCK_COLOR_IDS[type];

    let existingEvent: any = null;
    try {
      const queryParam = encodeURIComponent(`pcbmHash=${hash}`);
      const listRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=${queryParam}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.items && listData.items.length > 0) {
          existingEvent = listData.items[0];
        }
      }
    } catch (e) {
      console.error('Failed to query existing calendar event:', e);
    }

    if (existingEvent) {
      const patchRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingEvent.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            summary: title,
            description,
            colorId
          })
        }
      );
      if (!patchRes.ok) throw new Error(`PATCH failed for ${hash}`);
    } else {
      const endStr = getLocalDateString(1);
      const postRes = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            summary: title,
            description,
            start: { date: todayDateStr },
            end: { date: endStr },
            colorId,
            extendedProperties: {
              private: { pcbmHash: hash }
            }
          })
        }
      );
      if (!postRes.ok) throw new Error(`POST failed for ${hash}`);
    }
  };

  await syncSingleMasterBlock('Study', studyLogs);
  await syncSingleMasterBlock('Revision', revisionLogs);
  await syncSingleMasterBlock('Exercise', exerciseLogs);
}

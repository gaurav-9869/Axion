import { getStudyLogs, saveSubjectPreferences } from './dbService';
import { generateWithGemini } from '../lib/gemini';
import { db, auth, doc, getDoc, setDoc } from '../firebase';
import { SubjectPreference } from '../types';

export interface IntervalStep {
  cycle: number;
  label: string;
  days: number;
}

export interface IntervalSettings {
  cycles: number[]; // Default: [1, 3, 7, 14, 30, 60]
}

const INTERVALS_STORAGE_KEY = 'axion_revision_intervals_v2';

export const DEFAULT_INTERVAL_DAYS: number[] = [1, 3, 7, 14, 30, 60];

export const CYCLE_LABELS: string[] = [
  'Cycle 1',
  'Cycle 2',
  'Cycle 3',
  'Cycle 4',
  'Cycle 5',
  'Cycle 6'
];

export function loadRevisionIntervals(): IntervalStep[] {
  try {
    const raw = localStorage.getItem(INTERVALS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 6) {
        return DEFAULT_INTERVAL_DAYS.map((def, idx) => ({
          cycle: idx + 1,
          label: CYCLE_LABELS[idx] || `Cycle ${idx + 1}`,
          days: Math.max(1, Number(parsed[idx]?.days ?? parsed[idx]) || def)
        }));
      }
    }
  } catch {}

  return DEFAULT_INTERVAL_DAYS.map((days, idx) => ({
    cycle: idx + 1,
    label: CYCLE_LABELS[idx],
    days
  }));
}

export function getIntervalSettings(): IntervalSettings {
  const steps = loadRevisionIntervals();
  return {
    cycles: steps.map(s => s.days)
  };
}

export async function fetchRevisionIntervalsFromFirestore(): Promise<IntervalStep[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return loadRevisionIntervals();

  try {
    const ref = doc(db, 'users', uid, 'settings', 'revisionIntervals');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      if (data && Array.isArray(data.cycles) && data.cycles.length >= 6) {
        const steps = DEFAULT_INTERVAL_DAYS.map((def, idx) => ({
          cycle: idx + 1,
          label: CYCLE_LABELS[idx],
          days: Math.max(1, Math.min(999, Number(data.cycles[idx]) || def))
        }));
        try {
          localStorage.setItem(INTERVALS_STORAGE_KEY, JSON.stringify(steps.map(s => s.days)));
        } catch {}
        return steps;
      }
    }
  } catch (err) {
    console.warn('fetchRevisionIntervalsFromFirestore notice:', err);
  }

  return loadRevisionIntervals();
}

export function saveRevisionIntervals(steps: IntervalStep[]): IntervalStep[] {
  const normalized = DEFAULT_INTERVAL_DAYS.map((def, idx) => ({
    cycle: idx + 1,
    label: CYCLE_LABELS[idx] || steps[idx]?.label || `Cycle ${idx + 1}`,
    days: Math.max(1, Math.min(999, Math.round(Number(steps[idx]?.days) || def)))
  }));

  const cycles = normalized.map(s => s.days);

  try {
    localStorage.setItem(INTERVALS_STORAGE_KEY, JSON.stringify(cycles));
  } catch {}

  const uid = auth.currentUser?.uid;
  if (uid) {
    const ref = doc(db, 'users', uid, 'settings', 'revisionIntervals');
    setDoc(ref, { cycles, steps: normalized, updatedAt: Date.now() }, { merge: true }).catch(err => {
      console.warn('Firestore saveRevisionIntervals notice:', err);
    });
  }

  window.dispatchEvent(new CustomEvent('axion-intervals-updated', { detail: normalized }));
  return normalized;
}

export function resetRevisionIntervals(): IntervalStep[] {
  const defaults = DEFAULT_INTERVAL_DAYS.map((days, idx) => ({
    cycle: idx + 1,
    label: CYCLE_LABELS[idx],
    days
  }));
  return saveRevisionIntervals(defaults);
}

/**
 * Syncs custom subjects directly to Firestore (`users/{uid}/settings/subjects`)
 * and global subject preferences.
 */
export async function syncSubjectsToFirestore(subjects: SubjectPreference[]): Promise<void> {
  await saveSubjectPreferences(subjects);
  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      const ref = doc(db, 'users', uid, 'settings', 'subjects');
      await setDoc(ref, { subjects, updatedAt: Date.now() }, { merge: true });
    } catch (err) {
      console.warn('Firestore syncSubjectsToFirestore notice:', err);
    }
  }
}

/**
 * Uses Gemini (or empirical retention fallback) to suggest an optimized 6-step spaced repetition schedule.
 */
export async function suggestIntervalsWithGemini(): Promise<IntervalStep[]> {
  const logs = await getStudyLogs(120);
  const validLogs = logs.filter(l => !l.isMissed);

  const avgRetention =
    validLogs.length > 0
      ? validLogs.reduce((acc, l) => acc + (l.retentionScore || 8), 0) / validLogs.length
      : 8;

  try {
    const prompt = `Based on an average student retention score of ${avgRetention.toFixed(
      1
    )}/10 across ${
      validLogs.length
    } sessions, suggest a 6-step spaced repetition interval array in days (6 strictly increasing integers). Return ONLY a JSON array of 6 integers like [1, 3, 7, 14, 30, 60].`;

    const text = await generateWithGemini(prompt);

    const match = (text || '').match(/\[\s*\d+(?:\s*,\s*\d+){5}\s*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length === 6) {
        const steps = parsed.map((d: any, idx: number) => ({
          cycle: idx + 1,
          label: CYCLE_LABELS[idx],
          days: Math.max(1, Number(d) || DEFAULT_INTERVAL_DAYS[idx])
        }));
        return saveRevisionIntervals(steps);
      }
    }
  } catch {}

  const multiplier = avgRetention < 6.5 ? 0.75 : avgRetention > 8.5 ? 1.15 : 0.9;
  const computed = DEFAULT_INTERVAL_DAYS.map((base, idx) => ({
    cycle: idx + 1,
    label: CYCLE_LABELS[idx],
    days: idx === 0 ? 1 : Math.max(idx + 1, Math.round(base * multiplier))
  }));

  return saveRevisionIntervals(computed);
}

/**
 * Immediately binds a wallpaper image URL / Data URL or gradient preset to the Level 0 CSS variables.
 */
export function applyWallpaperToEnvironment(urlOrCss: string, accentColor: string): void {
  const root = document.documentElement;
  if (!root) return;

  const isCssFunction =
    urlOrCss.startsWith('url(') ||
    urlOrCss.startsWith('radial-gradient') ||
    urlOrCss.startsWith('linear-gradient');

  const resolvedCss = isCssFunction ? urlOrCss : `url("${urlOrCss}")`;

  root.style.setProperty('--wallpaper-url', resolvedCss);
  root.style.setProperty('--theme-primary', accentColor);

  try {
    localStorage.setItem('custom_wallpaper_url', resolvedCss);
    localStorage.setItem('custom_wallpaper_color', accentColor);
  } catch {}
}


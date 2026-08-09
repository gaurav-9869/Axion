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
}

export interface LogItem {
  id: string;
  planId?: string;
  subject: SubjectKey;
  topic: string;
  sessionType: SessionMode;
  revisionType?: string; // "Quick Recap", "Standard Review", "Deep Dive"
  activeMins: number;
  distractionMins: number;
  recoveryMins: number;
  checkingMins?: number; // For Exercise and Study
  practiceMins?: number; // For Study
  errors?: number; // For Exercise and Study
  retentionScore?: number; // 1 to 10 (Only in Study mode)
  startPage?: number;
  endPage?: number;
  vsaCount?: number;
  saCount?: number;
  laCount?: number;
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
  chapter?: string;
  mcqCount?: number;
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

export function calculateNextReviewDate(log: LogItem): string | undefined {
  if (log.sessionType === 'Exercise' || log.sessionType === 'Revise') {
      return undefined;
  }

  // Deterministic Math Logic for Spaced Repetition Scheduling
  // Base interval: 1 day
  let intervalDays = 1;

  if (log.sessionType === 'Study') {
    intervalDays = 3; // base 3 days for study
    
    // Penalize by checking mins ratio (high checking mins = shorter interval)
    if (log.checkingMins && log.activeMins) {
      const ratio = log.checkingMins / Math.max(log.activeMins, 1);
      if (ratio > 0.3) intervalDays -= 1; 
    }

    // Reward by low errors in practice
    if (log.practiceMins && log.errors !== undefined) {
      const errorRate = log.errors / Math.max(log.practiceMins, 1);
      if (errorRate < 0.1) intervalDays += 2;
      else if (errorRate > 0.5) intervalDays -= 1;
    }
  }

  // Cognitive load analysis
  if (log.frictionAnalysis && log.frictionAnalysis.length > 50) {
    intervalDays = Math.max(1, intervalDays - 2); // Heavy friction = review sooner
  }

  // Retention score directly affects (if present)
  if (log.retentionScore !== undefined) {
    if (log.retentionScore >= 9) intervalDays += 3;
    else if (log.retentionScore <= 5) intervalDays = Math.max(1, intervalDays - 2);
  }

  return getLocalDateString(Math.max(1, intervalDays));
}

export function getLocalDateString(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getFocusScore(log: LogItem): number {
  if (log.isMissed) return 0;
  const total = log.activeMins + log.distractionMins + log.recoveryMins;
  if (total === 0) return 0;
  const ratio = log.activeMins / total;
  return Math.round(ratio * 100);
}

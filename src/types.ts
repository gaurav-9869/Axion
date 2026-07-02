export type SubjectKey = 'bio' | 'phys' | 'chem' | 'math';
export type SessionMode = 'Study' | 'Revise' | 'Exercise';

export interface PlanItem {
  id: string;
  subject: SubjectKey;
  topic: string;
  sessionType: SessionMode;
  targetUnits?: number; // pages or questions
  targetMins: number;
  status: 'pending' | 'completed';
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
}

export interface ArchiveState {
  logs: Record<string, LogItem[]>; // Keyed by date
  systemRefinements: LogItem[]; // Quick access to logs with system Refinements
}


export interface UserSettings {
  name: string;
  className: string;
  activeSubjects: SubjectKey[];
  subjectGoals: Record<string, string>;
  subjectPageTotals: Record<string, number>; // Total syllabus pages per subject
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

// 100% Fail-Safe Subject Configuration Engine
export function getSubjectConfig(sub: string | undefined): SubjectConfig {
  const mapping: Record<SubjectKey, SubjectConfig> = {
    bio: {
      name: 'Biology',
      color: '#10B981',
      bg: 'bg-emerald-500/20',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30'
    },
    phys: {
      name: 'Physics',
      color: '#3B82F6',
      bg: 'bg-blue-500/20',
      text: 'text-blue-400',
      border: 'border-blue-500/30'
    },
    chem: {
      name: 'Chemistry',
      color: '#F59E0B',
      bg: 'bg-amber-500/20',
      text: 'text-amber-400',
      border: 'border-amber-500/30'
    },
    math: {
      name: 'Mathematics',
      color: '#EC4899',
      bg: 'bg-pink-500/20',
      text: 'text-pink-400',
      border: 'border-pink-500/30'
    }
  };

  // If the browser memory passes a corrupted, missing, or undefined subject,
  // we return a safe generic styling object instead of undefined. 
  // This instantly stops the "reading 'name' of undefined" React crash.
  if (!sub || !(sub in mapping)) {
    return {
      name: 'General Study',
      color: '#64748b',
      bg: 'bg-slate-500/20',
      text: 'text-slate-400',
      border: 'border-slate-500/30'
    };
  }

  return mapping[sub as SubjectKey];
}

export function calculateNextReviewDate(log: LogItem): string {
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
  } else if (log.sessionType === 'Exercise') {
    intervalDays = 5;
    
    if (log.errors !== undefined) {
      if (log.errors === 0) intervalDays += 5;
      else if (log.errors > 5) intervalDays -= 3;
    }
    
    if (log.checkingMins && log.activeMins) {
      const ratio = log.checkingMins / Math.max(log.activeMins, 1);
      if (ratio > 0.4) intervalDays -= 2;
    }
  } else if (log.sessionType === 'Revise') {
    intervalDays = 7;
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

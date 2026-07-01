export type SubjectKey = 'bio' | 'phys' | 'chem' | 'math' | 'cs' | 'eng' | 'lang' | string;
export type SessionMode = 'Study' | 'Revise' | 'Exercise';

export interface PlanItem {
  id: string;
  subject: SubjectKey;
  topic: string;
  sessionType: SessionMode;
  targetMins: number;
  status: 'pending' | 'completed' | 'skipped';
}

export interface LogItem {
  id: string;
  planId?: string;
  subject: SubjectKey;
  topic: string;
  sessionType: SessionMode;
  revisionType?: string;
  activeMins: number;
  distractionMins: number;
  recoveryMins: number;
  retentionScore: number;
  startPage?: number;
  endPage?: number;
  vsaCount?: number;
  saCount?: number;
  laCount?: number;
  frictionAnalysis?: string;
  notes?: string;
  synced?: boolean;
  scratchpadImage?: string;
  isMissed?: boolean;
}

export interface UserSettings {
  name: string;
  className: string;
  activeSubjects: SubjectKey[];
  subjectGoals: Partial<Record<SubjectKey, string>>;
  subjectPageTotals: Partial<Record<SubjectKey, number>>;
}

export function getLocalDateString(offsetDays: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

export function getSubjectConfig(key: SubjectKey) {
  const configs: Record<string, { name: string, color: string }> = {
    bio: { name: 'Biology', color: '#10b981' },
    phys: { name: 'Physics', color: '#3b82f6' },
    chem: { name: 'Chemistry', color: '#eab308' },
    math: { name: 'Mathematics', color: '#ef4444' },
    cs: { name: 'Computer Science', color: '#8b5cf6' },
    eng: { name: 'English', color: '#f97316' },
    lang: { name: 'Language', color: '#ec4899' }
  };
  return configs[key] || { name: key, color: '#9ca3af' };
}

export function getFocusScore(activeMins: number, distractionMins: number): number {
  const total = activeMins + distractionMins;
  if (total === 0) return 0;
  return Math.round((activeMins / total) * 100);
}

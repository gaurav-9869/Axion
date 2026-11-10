import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  PlanItem,
  LogItem,
  UserSettings,
  SubjectKey,
  SessionMode,
  getLocalDateString
} from '../types';
import { useSubjects } from '../context/SubjectContext';
import { AxIcon } from './AxionIcons';
import { sound } from '../utils/sound';
import {
  calculateTrackerMetrics,
  filterPlans,
  completeInPlaceSession,
  appendDirectiveTask,
  removePlanItem
} from '../services/trackerService';

export interface TrackerProps {
  morningPlan: PlanItem[];
  setMorningPlan: React.Dispatch<React.SetStateAction<PlanItem[]>>;
  loggedSessions: LogItem[];
  setLoggedSessions: React.Dispatch<React.SetStateAction<LogItem[]>>;
  userSettings: UserSettings;
  setUserSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
}

type ModalMode = 'plan' | 'session';

interface RetentionSliderProps {
  initialValue: number;
  onCommit: (val: number) => void;
}

const RetentionSlider = React.memo(({ initialValue, onCommit }: RetentionSliderProps) => {
  const [val, setVal] = useState<number>(initialValue);

  useEffect(() => {
    setVal(initialValue);
  }, [initialValue]);

  return (
    <div className="axion-surface-l2 p-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <AxIcon name="retention" className="w-4 h-4 text-emerald-400" />
          <span>Retention</span>
        </span>
        <span className="text-sm font-mono font-bold text-emerald-400 tabular-nums">
          {val}/10
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={val}
        onChange={e => {
          const next = Number(e.target.value);
          setVal(next);
          onCommit(next);
        }}
        className="w-full axion-slider"
      />
    </div>
  );
});

export default function Tracker({
  morningPlan,
  setMorningPlan,
  loggedSessions,
  setLoggedSessions
}: TrackerProps) {
  const { subjects, getSubjectConfig } = useSubjects();
  const todayDateStr = useMemo(() => getLocalDateString(0), []);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'done'>('all');

  // Single Unified Expansion Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('plan');

  // Plan Task Creation Fields
  const [planSubject, setPlanSubject] = useState<SubjectKey>('phys');
  const [planMode, setPlanMode] = useState<SessionMode>('Study');
  const [planChapter, setPlanChapter] = useState('');
  const [planTopic, setPlanTopic] = useState('');
  const [planTargetMins, setPlanTargetMins] = useState(45);
  const [planMcqCount, setPlanMcqCount] = useState<string>('');

  // Session Logging Fields (Date locked strictly to todayDateStr, mode locked to task sessionType)
  const [linkedPlanId, setLinkedPlanId] = useState<string | undefined>(undefined);
  const [logSubject, setLogSubject] = useState<SubjectKey>('phys');
  const [logMode, setLogMode] = useState<SessionMode>('Study');
  const [logChapter, setLogChapter] = useState('');
  const [logTopic, setLogTopic] = useState('');
  const [logActiveMins, setLogActiveMins] = useState<number>(45);
  const [logCheckingMins, setLogCheckingMins] = useState<string>('');
  const [logStartPage, setLogStartPage] = useState<string>('');
  const [logEndPage, setLogEndPage] = useState<string>('');
  const [logMcqCount, setLogMcqCount] = useState<string>('');
  const [logVsaCount, setLogVsaCount] = useState<string>('');
  const [logSaCount, setLogSaCount] = useState<string>('');
  const [logLaCount, setLogLaCount] = useState<string>('');
  const [logErrors, setLogErrors] = useState<string>('');
  const [logRetention, setLogRetention] = useState<number>(8);
  const [logNotes, setLogNotes] = useState('');
  const [logFrictionNotes, setLogFrictionNotes] = useState('');
  const [logScratchpad, setLogScratchpad] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close modal on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalOpen) {
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalOpen]);

  // Real-time Tracker Metrics
  const metrics = useMemo(
    () => calculateTrackerMetrics(morningPlan, loggedSessions, todayDateStr),
    [morningPlan, loggedSessions, todayDateStr]
  );

  // Listen for global Axion task trigger event from the unified fixed action cluster
  useEffect(() => {
    const handleOpenFromGlobal = () => {
      openCreatePlanModal();
    };
    window.addEventListener('axion-open-new-task', handleOpenFromGlobal);
    return () => {
      window.removeEventListener('axion-open-new-task', handleOpenFromGlobal);
    };
  }, []);

  // Filtered Queue
  const visiblePlans = useMemo(
    () => filterPlans(morningPlan, searchQuery, filterTab),
    [morningPlan, searchQuery, filterTab]
  );

  // Open Plan Creation Modal via Floating (+) Button
  const openCreatePlanModal = () => {
    sound.playClick();
    setModalMode('plan');
    setPlanSubject('phys');
    setPlanMode('Study');
    setPlanChapter('');
    setPlanTopic('');
    setPlanTargetMins(45);
    setPlanMcqCount('');
    setModalOpen(true);
  };

  // Open Type-Specific Session Logging Modal from a Task Row
  const openLogModalFromPlan = (item: PlanItem) => {
    sound.playClick();
    setModalMode('session');
    setLinkedPlanId(item.id);
    setLogSubject(item.subject);
    setLogMode(item.sessionType);
    setLogChapter(item.chapter || '');
    setLogTopic(item.topic || item.chapter || '');
    setLogActiveMins(item.targetMins || 45);
    setLogCheckingMins('');
    setLogStartPage('');
    setLogEndPage('');
    setLogMcqCount(item.mcqCount ? String(item.mcqCount) : '');
    setLogVsaCount('');
    setLogSaCount('');
    setLogLaCount('');
    setLogErrors('');
    setLogRetention(8);
    setLogNotes('');
    setLogFrictionNotes('');
    setLogScratchpad(undefined);
    setModalOpen(true);
  };

  // Handle Scratchpad Upload
  const handleScratchpadUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result;
      if (typeof result === 'string') {
        setLogScratchpad(result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Save Planned Task
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planTopic.trim() && !planChapter.trim()) return;
    setIsSubmitting(true);
    try {
      const updated = await appendDirectiveTask(
        todayDateStr,
        planSubject,
        planChapter,
        planTopic,
        planMode,
        planTargetMins,
        planMcqCount ? Number(planMcqCount) : undefined,
        morningPlan
      );
      setMorningPlan(updated);
      sound.playSuccess();
      setModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save Completed Session Log (Date locked strictly to todayDateStr)
  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logTopic.trim() && !logChapter.trim()) return;
    setIsSubmitting(true);
    try {
      const { newLog, updatedPlan } = await completeInPlaceSession(
        {
          planId: linkedPlanId,
          dateStr: todayDateStr,
          subject: logSubject,
          topic: logTopic || logChapter,
          chapter: logChapter || undefined,
          sessionType: logMode,
          activeMins: Math.max(1, Number(logActiveMins) || 45),
          checkingMins: logCheckingMins ? Number(logCheckingMins) : 0,
          practiceMins: logMode === 'Exercise' ? Math.max(1, Number(logActiveMins) || 45) : 0,
          startPage: logStartPage ? Number(logStartPage) : undefined,
          endPage: logEndPage ? Number(logEndPage) : undefined,
          mcqCount: logMcqCount ? Number(logMcqCount) : undefined,
          vsaCount: logVsaCount ? Number(logVsaCount) : undefined,
          saCount: logSaCount ? Number(logSaCount) : undefined,
          laCount: logLaCount ? Number(logLaCount) : undefined,
          errors: logErrors ? Number(logErrors) : 0,
          retentionScore: logMode === 'Revise' ? logRetention : 8,
          notes: logNotes.trim(),
          frictionAnalysis: logFrictionNotes.trim(),
          scratchpadImage: logScratchpad
        },
        morningPlan
      );

      setLoggedSessions(prev => [newLog, ...prev]);
      setMorningPlan(updatedPlan);
      sound.playChime();
      setModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Task from Plan
  const handleDeleteTask = async (planId: string) => {
    sound.playClick();
    const updated = await removePlanItem(todayDateStr, planId, morningPlan);
    setMorningPlan(updated);
  };

  // Semantic accent per session type
  const sessionAccent = useMemo(() => {
    if (logMode === 'Study') {
      return {
        hex: '#38bdf8',
        title: 'Study',
        badgeClass: 'bg-sky-500/15 border-sky-500/30 text-sky-400',
        buttonClass: 'bg-[#38bdf8] text-slate-950 shadow-[0_0_20px_rgba(56,189,248,0.3)]'
      };
    }
    if (logMode === 'Exercise') {
      return {
        hex: '#f43f5e',
        title: 'Exercise',
        badgeClass: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
        buttonClass: 'bg-[#f43f5e] text-white shadow-[0_0_20px_rgba(244,63,94,0.3)]'
      };
    }
    return {
      hex: '#10b981',
      title: 'Revision',
      badgeClass: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
      buttonClass: 'bg-[#10b981] text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
    };
  }, [logMode]);

  return (
    <div className="w-full flex flex-col gap-5 select-none ax-enter">
      {/* 1. TOP METRICS STRIP (12-Column Tablet & Desktop Responsive Grid) */}
      <section className="axion-surface-l1 p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold tracking-tight text-white">Overview</h2>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg tabular-nums">
            {todayDateStr}
          </span>
        </div>

        <div className="grid grid-cols-12 gap-4 lg:gap-5">
          {/* Metric 1: Study Time */}
          <div className="col-span-6 md:col-span-3 axion-surface-l2 p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Time</span>
              <AxIcon name="time" className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {metrics.formattedTotalTime}
            </div>
          </div>

          {/* Metric 2: Queue Progress */}
          <div className="col-span-6 md:col-span-3 axion-surface-l2 p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Done</span>
              <AxIcon name="tasks" className="w-5 h-5 text-sky-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white tabular-nums">
                {metrics.completedPlanned}/{metrics.totalPlanned}
              </span>
              <span className="text-xs font-mono text-emerald-400 tabular-nums">
                {metrics.progressPercent}%
              </span>
            </div>
          </div>

          {/* Metric 3: Focus Score */}
          <div className="col-span-6 md:col-span-3 axion-surface-l2 p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Focus</span>
              <AxIcon name="active" className="w-5 h-5 text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {metrics.averageFocus}%
            </div>
          </div>

          {/* Metric 4: Streak */}
          <div className="col-span-6 md:col-span-3 axion-surface-l2 p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Streak</span>
              <AxIcon name="goals" className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
              {metrics.streakDays}d
            </div>
          </div>
        </div>
      </section>

      {/* 2. TASKS WORKSPACE (Level 1 Glass Shell with 12-Col Responsive Alignment) */}
      <section className="axion-surface-l1 p-5 md:p-6 flex flex-col gap-4">
        <div className="grid grid-cols-12 items-center gap-3">
          <div className="col-span-12 md:col-span-4 flex items-center gap-3">
            <h2 className="text-base font-bold tracking-tight text-white">Tasks</h2>
            <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-xs font-mono text-slate-300 tabular-nums">
              {visiblePlans.length}
            </span>
          </div>

          <div className="col-span-12 md:col-span-8 flex flex-wrap sm:flex-nowrap items-center justify-end gap-2.5">
            {/* Search Input with Dynamic Focus & 90deg Icon Rotation */}
            <div className="ax-search-shell relative flex-1 sm:max-w-xs rounded-xl">
              <div className="ax-search-icon absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex items-center justify-center">
                <AxIcon name="search" className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="w-full bg-transparent pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="ax-clear-btn absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                >
                  <AxIcon name="close" className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Segmented Filter Pills with Sliding Glider */}
            <div className="relative grid grid-cols-3 gap-1 p-1 rounded-xl bg-black/35 border border-white/[0.08] shrink-0 min-w-[192px]">
              <div
                aria-hidden="true"
                className="ax-glider-pill absolute top-1 bottom-1 left-1 w-[calc((100%-16px)/3)] rounded-lg bg-emerald-500/20 border border-emerald-500/35 pointer-events-none"
                style={{
                  transform: `translateX(calc(${(['all', 'active', 'done'] as const).indexOf(filterTab)} * (100% + 4px)))`
                }}
              />
              {(['all', 'active', 'done'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => {
                    sound.playClick();
                    setFilterTab(tab);
                  }}
                  className={`relative z-10 px-3 py-1 rounded-lg text-xs font-semibold capitalize cursor-pointer text-center transition-colors ${
                    filterTab === tab
                      ? 'text-emerald-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Queue List */}
        {visiblePlans.length === 0 ? (
          <div className="axion-surface-l2 py-12 px-4 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-400">
              <AxIcon name="tasks" className="w-5 h-5" />
            </div>
            <p className="text-xs font-mono text-slate-400">No tasks in queue</p>
            <button
              onClick={openCreatePlanModal}
              className="ax-tap px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2 cursor-pointer"
            >
              <AxIcon name="plus" className="w-4 h-4" />
              <span>Add Task</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-3">
            {visiblePlans.map(item => {
              const subConfig = getSubjectConfig(item.subject);
              const isDone = item.status === 'completed';
              const modeColor =
                item.sessionType === 'Study'
                  ? '#38bdf8'
                  : item.sessionType === 'Exercise'
                  ? '#f43f5e'
                  : '#10b981';

              return (
                <div
                  key={item.id}
                  className={`col-span-12 ax-task-insert axion-surface-l2 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 ${
                    isDone ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Complete / Log Trigger Checkbox with Tactile Spring & SVG Tick Draw */}
                    <button
                      onClick={() => {
                        if (!isDone) openLogModalFromPlan(item);
                      }}
                      disabled={isDone}
                      className={`ax-pressable w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer ${
                        isDone
                          ? 'ax-checkbox-checked bg-emerald-500 border-emerald-500 text-slate-950'
                          : 'border-white/20 bg-white/[0.03] hover:border-emerald-400 text-transparent'
                      }`}
                      title={isDone ? 'Completed' : 'Log Session'}
                    >
                      <svg
                        className={`w-3.5 h-3.5 ${isDone ? 'ax-checkbox-tick' : ''}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider border"
                          style={{
                            color: subConfig.color,
                            borderColor: `${subConfig.color}40`,
                            backgroundColor: `${subConfig.color}15`
                          }}
                        >
                          {subConfig.name}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border"
                          style={{
                            color: modeColor,
                            borderColor: `${modeColor}40`,
                            backgroundColor: `${modeColor}15`
                          }}
                        >
                          {item.sessionType}
                        </span>
                        {item.chapter && (
                          <span className="text-xs font-mono text-slate-400 truncate">
                            {item.chapter}
                          </span>
                        )}
                        {(() => {
                          const matchingLog = loggedSessions.find(
                            l => l.planId === item.id || (l.subject === item.subject && l.topic.toLowerCase() === item.topic.toLowerCase())
                          );
                          const rScore = matchingLog?.retentionScore || (item.sessionType === 'Revise' ? 8 : null);
                          if (!rScore) return null;
                          return (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 tabular-nums">
                              Retention: {rScore}.0 / 10
                            </span>
                          );
                        })()}
                      </div>

                      <h3
                        className={`text-sm font-semibold text-white mt-1 truncate ${
                          isDone ? 'line-through text-slate-400' : ''
                        }`}
                      >
                        {item.topic}
                      </h3>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center justify-end gap-2.5 shrink-0">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/30 border border-white/[0.06] text-xs font-mono text-slate-300 tabular-nums">
                      <AxIcon name="time" className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{item.targetMins}m</span>
                    </div>

                    {item.mcqCount && item.mcqCount > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/30 border border-white/[0.06] text-xs font-mono text-amber-400 tabular-nums">
                        <AxIcon name="mcq" className="w-3.5 h-3.5" />
                        <span>{item.mcqCount}</span>
                      </div>
                    )}

                    {!isDone && (
                      <button
                        onClick={() => openLogModalFromPlan(item)}
                        className="ax-tap px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer"
                        style={{
                          color: modeColor,
                          borderColor: `${modeColor}45`,
                          backgroundColor: `${modeColor}18`
                        }}
                      >
                        Log
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteTask(item.id)}
                      className="ax-tap p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                      title="Delete"
                    >
                      <AxIcon name="delete" className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. DETACHED VIEWPORT-LEVEL RIGHT-DOCKED COMPACT TASK / LOG DRAWER VIA REACT PORTAL */}
      {modalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
          {/* Background Scrim */}
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm transition-opacity duration-250 pointer-events-auto"
            onClick={() => setModalOpen(false)}
          />

          {/* Right-Docked Compact Side Sheet:
              - Phone (< 768px): fixed top-0 bottom-0 right-0 w-[88vw] max-w-[360px] rounded-l-[24px]
              - Tablet & Desktop (>= 768px): fixed top-4 bottom-4 right-4 w-[28vw] min-w-[280px] max-w-[360px] rounded-[24px] */}
          <div
            className="ax-right-drawer-enter pointer-events-auto fixed top-0 bottom-0 right-0 w-[88vw] max-w-[360px] rounded-l-[24px] md:top-4 md:bottom-4 md:right-4 md:w-[28vw] md:min-w-[280px] md:max-w-[360px] md:rounded-[24px] z-50 axion-surface-l1 border border-white/10 shadow-2xl p-5 overflow-y-auto flex flex-col gap-4 text-slate-100"
            style={{
              background: 'rgba(13, 19, 31, 0.95)',
              backdropFilter: 'blur(28px)',
              WebkitBackdropFilter: 'blur(28px)'
            }}
          >
            {/* Modal Header: Strictly 1-2 Words, No Mode Switcher */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                {modalMode === 'plan' ? (
                  <h3 className="text-lg font-bold tracking-tight text-white">New Task</h3>
                ) : (
                  <>
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: sessionAccent.hex }}
                    />
                    <h3 className="text-lg font-bold tracking-tight text-white">
                      {sessionAccent.title}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border ${sessionAccent.badgeClass}`}
                    >
                      {todayDateStr}
                    </span>
                  </>
                )}
              </div>

              <button
                onClick={() => setModalOpen(false)}
                className="ax-tap w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
              >
                <AxIcon name="close" className="w-4 h-4" />
              </button>
            </div>

            {modalMode === 'plan' ? (
              /* PLAN TASK FORM */
              <form onSubmit={handleSavePlan} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      Subject
                    </label>
                    <select
                      value={planSubject}
                      onChange={e => setPlanSubject(e.target.value as SubjectKey)}
                      className="ios-glass-input px-3.5 py-2.5 text-xs font-semibold text-white"
                    >
                      {subjects.map(s => (
                        <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      Mode
                    </label>
                    <div className="relative grid grid-cols-3 gap-1 p-1 rounded-xl bg-black/35 border border-white/[0.08]">
                      <div
                        aria-hidden="true"
                        className="ax-glider-pill absolute top-1 bottom-1 left-1 w-[calc((100%-16px)/3)] rounded-lg bg-emerald-500/20 border border-emerald-500/40 pointer-events-none"
                        style={{
                          transform: `translateX(calc(${(['Study', 'Revise', 'Exercise'] as SessionMode[]).indexOf(planMode)} * (100% + 4px)))`
                        }}
                      />
                      {(['Study', 'Revise', 'Exercise'] as SessionMode[]).map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPlanMode(m)}
                          className={`relative z-10 py-1.5 rounded-lg text-xs font-semibold cursor-pointer text-center transition-colors ${
                            planMode === m
                              ? 'text-emerald-400'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      Chapter
                    </label>
                    <input
                      type="text"
                      value={planChapter}
                      onChange={e => setPlanChapter(e.target.value)}
                      placeholder="e.g. Electrostatics"
                      className="ios-glass-input px-3.5 py-2.5 text-xs text-white placeholder-slate-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      Topic
                    </label>
                    <input
                      type="text"
                      required
                      value={planTopic}
                      onChange={e => setPlanTopic(e.target.value)}
                      placeholder="e.g. Gauss Law Applications"
                      className="ios-glass-input px-3.5 py-2.5 text-xs text-white placeholder-slate-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      Target (Mins)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={360}
                      value={planTargetMins}
                      onChange={e => setPlanTargetMins(Number(e.target.value))}
                      className="ios-glass-input px-3.5 py-2.5 text-xs font-mono text-white tabular-nums"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      Target MCQs
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={planMcqCount}
                      onChange={e => setPlanMcqCount(e.target.value)}
                      placeholder="0"
                      className="ios-glass-input px-3.5 py-2.5 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="ax-tap px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="ax-tap px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? 'Adding...' : 'Add Task'}
                  </button>
                </div>
              </form>
            ) : (
              /* TYPE-SPECIFIC SESSION LOGGING FORM (Date locked to todayDateStr, Mode locked to logMode) */
              <form onSubmit={handleSaveSession} className="flex flex-col gap-4">
                {/* Locked Task Summary Pill */}
                <div className="axion-surface-l2 p-3.5 flex items-center justify-between gap-3">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase"
                        style={{
                          color: getSubjectConfig(logSubject).color,
                          backgroundColor: `${getSubjectConfig(logSubject).color}18`
                        }}
                      >
                        {getSubjectConfig(logSubject).name}
                      </span>
                      {logChapter && (
                        <span className="text-xs font-mono text-slate-400 truncate">
                          {logChapter}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-white truncate mt-1">
                      {logTopic || logChapter}
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border shrink-0 ${sessionAccent.badgeClass}`}
                  >
                    {logMode}
                  </span>
                </div>

                {/* STUDY SESSION MODAL (Accent: #38bdf8 Electric Cobalt) */}
                {logMode === 'Study' && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-sky-400">
                          Study Mins
                        </label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={logActiveMins}
                          onChange={e => setLogActiveMins(Number(e.target.value))}
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          Checking Mins
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={logCheckingMins}
                          onChange={e => setLogCheckingMins(e.target.value)}
                          placeholder="0"
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5 col-span-2 sm:col-span-1">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          MCQs
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={logMcqCount}
                          onChange={e => setLogMcqCount(e.target.value)}
                          placeholder="0"
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          Page Start
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={logStartPage}
                          onChange={e => setLogStartPage(e.target.value)}
                          placeholder="0"
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          Page End
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={logEndPage}
                          onChange={e => setLogEndPage(e.target.value)}
                          placeholder="0"
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          Errors
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={logErrors}
                          onChange={e => setLogErrors(e.target.value)}
                          placeholder="0"
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                        Notes
                      </label>
                      <textarea
                        rows={2}
                        value={logNotes}
                        onChange={e => setLogNotes(e.target.value)}
                        placeholder="Key concepts and formulas..."
                        className="ios-glass-input px-3.5 py-2 text-xs text-white placeholder-slate-500 resize-none"
                      />
                    </div>
                  </>
                )}

                {/* EXERCISE SESSION MODAL (Accent: #f43f5e Crimson Ember) */}
                {logMode === 'Exercise' && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-rose-400">
                          Practice Mins
                        </label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={logActiveMins}
                          onChange={e => setLogActiveMins(Number(e.target.value))}
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          Checking Mins
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={logCheckingMins}
                          onChange={e => setLogCheckingMins(e.target.value)}
                          placeholder="0"
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          MCQs
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={logMcqCount}
                          onChange={e => setLogMcqCount(e.target.value)}
                          placeholder="0"
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-rose-400">
                          Errors
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={logErrors}
                          onChange={e => setLogErrors(e.target.value)}
                          placeholder="0"
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                        />
                      </div>
                    </div>

                    {/* Question-Type Breakdown (VSA / SA / LA) */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          VSA Qs
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={logVsaCount}
                          onChange={e => setLogVsaCount(e.target.value)}
                          placeholder="0"
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          SA Qs
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={logSaCount}
                          onChange={e => setLogSaCount(e.target.value)}
                          placeholder="0"
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          LA Qs
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={logLaCount}
                          onChange={e => setLogLaCount(e.target.value)}
                          placeholder="0"
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-rose-400">
                        Friction Notes
                      </label>
                      <textarea
                        rows={2}
                        value={logFrictionNotes}
                        onChange={e => setLogFrictionNotes(e.target.value)}
                        placeholder="Traps, calculation slips, or conceptual blocks..."
                        className="ios-glass-input px-3.5 py-2 text-xs text-white placeholder-slate-500 resize-none"
                      />
                    </div>
                  </>
                )}

                {/* REVISION SESSION MODAL (Accent: #10b981 Sage Mint) */}
                {logMode === 'Revise' && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                          Revision Mins
                        </label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={logActiveMins}
                          onChange={e => setLogActiveMins(Number(e.target.value))}
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          Page Start
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={logStartPage}
                          onChange={e => setLogStartPage(e.target.value)}
                          placeholder="0"
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5 col-span-2 sm:col-span-1">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          Page End
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={logEndPage}
                          onChange={e => setLogEndPage(e.target.value)}
                          placeholder="0"
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          MCQs
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={logMcqCount}
                          onChange={e => setLogMcqCount(e.target.value)}
                          placeholder="0"
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                          Errors
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={logErrors}
                          onChange={e => setLogErrors(e.target.value)}
                          placeholder="0"
                          className="ios-glass-input px-3 py-2 text-xs font-mono text-white tabular-nums placeholder-slate-600"
                        />
                      </div>
                    </div>

                    {/* 1-10 Continuous Retention Slider (0ms Latency Local State) */}
                    <RetentionSlider
                      initialValue={logRetention}
                      onCommit={setLogRetention}
                    />

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                        Error Takeaways
                      </label>
                      <textarea
                        rows={2}
                        value={logNotes}
                        onChange={e => setLogNotes(e.target.value)}
                        placeholder="Recall gaps and takeaways..."
                        className="ios-glass-input px-3.5 py-2 text-xs text-white placeholder-slate-500 resize-none"
                      />
                    </div>
                  </>
                )}

                {/* Scratchpad Attachment */}
                <div className="flex items-center justify-between gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleScratchpadUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="ax-tap px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-mono text-slate-300 flex items-center gap-2 cursor-pointer"
                  >
                    <AxIcon name="notes" className="w-4 h-4 text-sky-400" />
                    <span>{logScratchpad ? 'Change Scratchpad' : 'Attach Scratchpad'}</span>
                  </button>

                  {logScratchpad && (
                    <button
                      type="button"
                      onClick={() => setLogScratchpad(undefined)}
                      className="text-xs font-mono text-rose-400 hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="ax-tap px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`ax-tap px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer disabled:opacity-50 ${sessionAccent.buttonClass}`}
                  >
                    {isSubmitting ? 'Saving...' : 'Complete'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

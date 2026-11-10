import React, { useState, useMemo, useEffect } from 'react';
import { LogItem, PlanItem, getLocalDateString } from '../types';
import { useSubjects } from '../context/SubjectContext';
import { AxIcon } from './AxionIcons';
import { sound } from '../utils/sound';
import {
  buildRevisionTopicGroups,
  queueTopicForToday,
  deleteIndividualSession,
  deleteEntireTopicHistory,
  mergeSelectedTopics,
  synthesizeUnifiedTopicTitle,
  UrgencyFilter,
  RevisionTopicGroup
} from '../services/revisionService';

export interface RevisionProps {
  logs: LogItem[];
  setLogs: React.Dispatch<React.SetStateAction<LogItem[]>>;
  currentPlan: PlanItem[];
  setMorningPlan: React.Dispatch<React.SetStateAction<PlanItem[]>>;
}

export default function Revision({
  logs,
  setLogs,
  currentPlan,
  setMorningPlan
}: RevisionProps) {
  const { subjects, getSubjectConfig } = useSubjects();
  const todayDateStr = useMemo(() => getLocalDateString(0), []);

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Queued' | 'Pending'>('All');
  const [subjectFilter, setSubjectFilter] = useState<string>('All');
  const [intervalVersion, setIntervalVersion] = useState(0);

  useEffect(() => {
    const onIntervalsUpdated = () => setIntervalVersion(v => v + 1);
    window.addEventListener('axion-intervals-updated', onIntervalsUpdated);
    return () => window.removeEventListener('axion-intervals-updated', onIntervalsUpdated);
  }, []);

  // Selected Topic Key for Right-Pane Inspector
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Multi-Select Merge State
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  const [mergedTargetName, setMergedTargetName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [recentlyMergedKey, setRecentlyMergedKey] = useState<string | null>(null);

  // Animated Exit State for Inline Deletion (200ms slide-collapse before removal)
  const [exitingTopicKeys, setExitingTopicKeys] = useState<Record<string, boolean>>({});
  const [exitingSessionIds, setExitingSessionIds] = useState<Record<string, boolean>>({});

  // Full-Screen Scratchpad Zoom Preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Build Adaptive Topic Groups
  const allGroups = useMemo(
    () => buildRevisionTopicGroups(logs, currentPlan, todayDateStr),
    [logs, currentPlan, todayDateStr, intervalVersion]
  );

  // Filtered Topic Queue
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allGroups.filter(g => {
      if (urgencyFilter !== 'All' && g.urgency !== urgencyFilter) return false;
      if (statusFilter === 'Queued' && !g.isQueuedToday) return false;
      if (statusFilter === 'Pending' && g.isQueuedToday) return false;
      if (subjectFilter !== 'All' && g.subject !== subjectFilter) return false;
      if (q) {
        const matchTopic = g.topic.toLowerCase().includes(q);
        const matchChapter = (g.chapter || '').toLowerCase().includes(q);
        const matchSub = g.subject.toLowerCase().includes(q);
        if (!matchTopic && !matchChapter && !matchSub) return false;
      }
      return true;
    });
  }, [allGroups, urgencyFilter, statusFilter, subjectFilter, searchQuery]);

  // Active Group for Right-Pane Details Inspector
  const activeGroup: RevisionTopicGroup | null = useMemo(() => {
    if (selectedKey) {
      const found = allGroups.find(g => g.key === selectedKey);
      if (found) return found;
    }
    return filteredGroups[0] || null;
  }, [allGroups, filteredGroups, selectedKey]);

  // Queue Topic into Today's Plan
  const handleQueueTopic = async (group: RevisionTopicGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    if (group.isQueuedToday || isProcessing) return;
    setIsProcessing(true);
    try {
      sound.playClick();
      const updatedPlan = await queueTopicForToday(group, currentPlan, todayDateStr);
      setMorningPlan(updatedPlan);
      sound.playSuccess();
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete Entire Topic Group (Slide-Collapse Exit over 200ms)
  const handleDeleteTopicGroup = (group: RevisionTopicGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isProcessing || exitingTopicKeys[group.key]) return;
    sound.playClick();
    setExitingTopicKeys(prev => ({ ...prev, [group.key]: true }));
    setSelectedForMerge(prev => prev.filter(k => k !== group.key));

    setTimeout(async () => {
      setIsProcessing(true);
      try {
        const updatedLogs = await deleteEntireTopicHistory(group, logs);
        setLogs(updatedLogs);
        if (selectedKey === group.key) {
          setSelectedKey(null);
        }
      } finally {
        setExitingTopicKeys(prev => {
          const next = { ...prev };
          delete next[group.key];
          return next;
        });
        setIsProcessing(false);
      }
    }, 200);
  };

  // Delete Single Historical Session inside Details Inspector (Slide-Collapse Exit over 200ms)
  const handleDeleteSingleSession = (sessionId: string) => {
    if (isProcessing || exitingSessionIds[sessionId]) return;
    sound.playClick();
    setExitingSessionIds(prev => ({ ...prev, [sessionId]: true }));

    setTimeout(async () => {
      setIsProcessing(true);
      try {
        const updatedLogs = await deleteIndividualSession(sessionId, logs);
        setLogs(updatedLogs);
      } finally {
        setExitingSessionIds(prev => {
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
        setIsProcessing(false);
      }
    }, 200);
  };

  // Toggle Topic Selection via Checkbox
  const toggleSelectForMerge = (key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    sound.playClick();
    setSelectedForMerge(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      if (next.length >= 2) {
        const selectedGroups = allGroups.filter(g => next.includes(g.key));
        setMergedTargetName(synthesizeUnifiedTopicTitle(selectedGroups.map(g => g.topic)));
      } else if (next.length === 1) {
        const firstGroup = allGroups.find(g => g.key === next[0]);
        if (firstGroup) setMergedTargetName(firstGroup.topic);
      } else {
        setMergedTargetName('');
      }
      return next;
    });
  };

  // Execute Topic Consolidation Merge with 300ms Dissolve Flash
  const handleExecuteMerge = async () => {
    if (selectedForMerge.length < 2 || isProcessing) return;
    const groupsToMerge = allGroups.filter(g => selectedForMerge.includes(g.key));
    if (groupsToMerge.length < 2) return;

    const targetTopic =
      mergedTargetName.trim() ||
      synthesizeUnifiedTopicTitle(groupsToMerge.map(g => g.topic));
    const primaryGroup = groupsToMerge[0];
    const distinctChapters = Array.from(
      new Set(groupsToMerge.map(g => g.chapter).filter(Boolean))
    );
    const unifiedChapter = distinctChapters.join(' + ') || primaryGroup.chapter;
    const targetKey = `${primaryGroup.subject.toLowerCase()}::${targetTopic.toLowerCase()}${
      unifiedChapter ? `::${unifiedChapter.toLowerCase()}` : ''
    }`;

    setIsProcessing(true);
    try {
      const updatedLogs = await mergeSelectedTopics(
        groupsToMerge,
        targetTopic,
        unifiedChapter,
        logs
      );
      setLogs(updatedLogs);
      setSelectedForMerge([]);
      setMergedTargetName('');
      setSelectedKey(targetKey);
      setRecentlyMergedKey(targetKey);
      sound.playChime();
      setTimeout(() => setRecentlyMergedKey(null), 450);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderUrgencyPill = (urgency: RevisionTopicGroup['urgency']) => {
    if (urgency === 'Overdue') {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
          Overdue
        </span>
      );
    }
    if (urgency === 'Due Today') {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
          Due Today
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        Upcoming
      </span>
    );
  };

  return (
    <div className="w-full select-none ax-enter pb-16">
      {/* 12-COLUMN DUAL-PANE MASTER-DETAIL WORKSPACE (7 / 5 SPLIT) */}
      <div className="grid grid-cols-12 gap-5 items-start">
        {/* LEFT PANE (7 Columns on Desktop): Queue */}
        <section className="col-span-12 lg:col-span-7 axion-surface-l1 p-5 md:p-6 flex flex-col gap-4">
          {/* Header Row: 1-2 Words Maximum + Item Badge + Clear Selection / Assistant */}
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold tracking-tight text-white">Revision</h2>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg tabular-nums">
                {filteredGroups.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {selectedForMerge.length > 0 && (
                <button
                  onClick={() => {
                    sound.playClick();
                    setSelectedForMerge([]);
                    setMergedTargetName('');
                  }}
                  className="ax-pressable px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border cursor-pointer bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.1] text-slate-200"
                >
                  <span>Clear ({selectedForMerge.length})</span>
                </button>
              )}

              <button
                onClick={() => {
                  sound.playClick();
                  window.dispatchEvent(new CustomEvent('axion-toggle-chatbot'));
                }}
                className="ax-pressable px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border cursor-pointer bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.25)]"
                title="Assistant"
              >
                <AxIcon name="chat" className="w-4 h-4 text-white ax-icon-white" />
                <span>Assistant</span>
              </button>
            </div>
          </div>

          {/* Filter Row: Search Input + Urgency Dropdown + Status Dropdown */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="ax-search-shell sm:col-span-5 relative rounded-xl">
              <div className="ax-search-icon absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex items-center justify-center">
                <AxIcon name="search" className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search topics..."
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

            <div className="sm:col-span-4">
              <select
                value={urgencyFilter}
                onChange={e => setUrgencyFilter(e.target.value as UrgencyFilter)}
                className="ios-glass-input w-full px-3 py-2 text-xs font-semibold text-slate-200 cursor-pointer"
              >
                <option value="All" className="bg-slate-900">
                  All Urgencies ▾
                </option>
                <option value="Overdue" className="bg-slate-900">
                  Overdue
                </option>
                <option value="Due Today" className="bg-slate-900">
                  Due Today
                </option>
                <option value="Upcoming" className="bg-slate-900">
                  Upcoming
                </option>
              </select>
            </div>

            <div className="sm:col-span-3 flex gap-2">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as 'All' | 'Queued' | 'Pending')}
                className="ios-glass-input w-full px-3 py-2 text-xs font-semibold text-slate-200 cursor-pointer"
              >
                <option value="All" className="bg-slate-900">
                  All ▾
                </option>
                <option value="Pending" className="bg-slate-900">
                  Pending
                </option>
                <option value="Queued" className="bg-slate-900">
                  Queued
                </option>
              </select>

              <select
                value={subjectFilter}
                onChange={e => setSubjectFilter(e.target.value)}
                className="ios-glass-input w-24 shrink-0 px-2.5 py-2 text-xs font-semibold text-slate-200 cursor-pointer hidden xl:block"
              >
                <option value="All" className="bg-slate-900">
                  Subj ▾
                </option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id} className="bg-slate-900">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Topic Queue Cards */}
          {filteredGroups.length === 0 ? (
            <div className="axion-surface-l2 py-12 px-4 flex flex-col items-center justify-center text-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-400">
                <AxIcon name="revise" className="w-5 h-5" />
              </div>
              <p className="text-xs font-mono text-slate-400">No topics match filters</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-h-[68vh] overflow-y-auto pr-1">
              {filteredGroups.map(group => {
                const subConfig = getSubjectConfig(group.subject);
                const isSelected = activeGroup?.key === group.key;
                const isCheckedForMerge = selectedForMerge.includes(group.key);
                const isExiting = Boolean(exitingTopicKeys[group.key]);
                const isRecentlyMerged = recentlyMergedKey === group.key;

                return (
                  <div
                    key={group.key}
                    onClick={() => {
                      sound.playClick();
                      setSelectedKey(group.key);
                    }}
                    className={`ax-card p-4 flex flex-col gap-3 cursor-pointer ${
                      isExiting ? 'ax-item-exit' : ''
                    } ${isRecentlyMerged ? 'ax-merge-flash' : ''} ${
                      isSelected
                        ? 'border-emerald-500/45 bg-emerald-500/[0.06]'
                        : ''
                    } ${
                      isCheckedForMerge
                        ? 'border-emerald-400/60 bg-emerald-500/[0.10]'
                        : ''
                    }`}
                  >
                    {/* Top Row: Multi-Select Checkbox, Subject Pill, Chapter, Urgency Pill, #ax-delete */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                        <button
                          type="button"
                          onClick={e => toggleSelectForMerge(group.key, e)}
                          className={`ax-pressable w-5 h-5 rounded-md border flex items-center justify-center shrink-0 cursor-pointer ${
                            isCheckedForMerge
                              ? 'ax-checkbox-checked bg-emerald-500 border-emerald-500 text-slate-950'
                              : 'border-white/25 bg-white/[0.04] hover:border-emerald-400'
                          }`}
                          title="Select to Merge"
                        >
                          {isCheckedForMerge && (
                            <AxIcon name="tick" className="w-3.5 h-3.5 text-slate-950" />
                          )}
                        </button>

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

                        {group.chapter && (
                          <span className="text-xs font-mono text-slate-400 truncate">
                            {group.chapter}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {renderUrgencyPill(group.urgency)}

                        <button
                          type="button"
                          onClick={e => handleDeleteTopicGroup(group, e)}
                          className="ax-pressable p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                          title="Delete"
                        >
                          <svg className="ax-icon w-4 h-4">
                            <use href="#ax-delete" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Middle Row: Topic Name (16px bold white) */}
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-[16px] font-bold text-white leading-snug truncate">
                        {group.topic}
                      </h3>
                      <span className="text-xs font-mono text-slate-400 tabular-nums shrink-0">
                        Due {group.nextReviewDate}
                      </span>
                    </div>

                    {/* Bottom Row: Tabular Metadata + Queue Button */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-white/[0.06]">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-300 tabular-nums">
                        <span className="px-2 py-0.5 rounded bg-black/30 border border-white/[0.05]">
                          Study: {group.totalStudyMins}m
                        </span>
                        <span className="px-2 py-0.5 rounded bg-black/30 border border-white/[0.05]">
                          Practice: {group.totalPracticeMins}m
                        </span>
                        {group.totalMcqs > 0 && (
                          <span className="px-2 py-0.5 rounded bg-black/30 border border-white/[0.05] text-amber-400">
                            {group.totalMcqs} MCQs
                          </span>
                        )}
                        {group.pageRange && (
                          <span className="px-2 py-0.5 rounded bg-black/30 border border-white/[0.05] text-sky-400">
                            Pgs {group.pageRange}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-semibold">
                          Retention: {group.averageRetention.toFixed(1)} / 10
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={e => handleQueueTopic(group, e)}
                        disabled={group.isQueuedToday || isProcessing}
                        className={`ax-pressable px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 ${
                          group.isQueuedToday
                            ? 'bg-white/[0.06] text-slate-400 border border-white/[0.08] cursor-default'
                            : 'bg-[#10b981] hover:bg-emerald-400 text-slate-950 font-bold shadow-[0_0_16px_rgba(16,185,129,0.3)]'
                        }`}
                      >
                        {group.isQueuedToday ? (
                          <>
                            <AxIcon name="tick" className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Queued</span>
                          </>
                        ) : (
                          <>
                            <AxIcon name="plus" className="w-3.5 h-3.5" />
                            <span>Queue Today</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* RIGHT PANE (5 Columns on Desktop): Details Inspector */}
        <aside className="col-span-12 lg:col-span-5 axion-surface-l1 p-5 md:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold tracking-tight text-white">Details</h2>
            {activeGroup && (
              <span className="text-xs font-mono text-emerald-400 tabular-nums">
                +{activeGroup.intervalDays}d cycle
              </span>
            )}
          </div>

          {!activeGroup ? (
            <div className="axion-surface-l2 py-12 px-4 flex flex-col items-center justify-center text-center gap-2">
              <AxIcon name="notes" className="w-5 h-5 text-slate-500" />
              <p className="text-xs font-mono text-slate-400">Select a topic to inspect</p>
            </div>
          ) : (
            <div key={activeGroup.key} className="ax-inspector-drift flex flex-col gap-4">
              {/* Active Topic Header Box */}
              <div className="axion-surface-l2 p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase"
                    style={{
                      color: getSubjectConfig(activeGroup.subject).color,
                      backgroundColor: `${getSubjectConfig(activeGroup.subject).color}18`
                    }}
                  >
                    {getSubjectConfig(activeGroup.subject).name}
                  </span>
                  {renderUrgencyPill(activeGroup.urgency)}
                </div>
                <h3 className="text-base font-bold text-white leading-snug">
                  {activeGroup.topic}
                </h3>
                {activeGroup.chapter && (
                  <span className="text-xs font-mono text-slate-400">
                    {activeGroup.chapter}
                  </span>
                )}
              </div>

              {/* 2x2 Summary Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="axion-surface-l2 p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Total Time
                  </span>
                  <span className="text-lg font-bold font-mono text-white tabular-nums">
                    {activeGroup.totalStudyMins + activeGroup.totalPracticeMins}m
                  </span>
                </div>

                <div className="axion-surface-l2 p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Sessions
                  </span>
                  <span className="text-lg font-bold font-mono text-white tabular-nums">
                    {activeGroup.sessionCount}
                  </span>
                </div>

                <div className="axion-surface-l2 p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Avg Score
                  </span>
                  <span className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
                    {activeGroup.averageRetention}/10
                  </span>
                </div>

                <div className="axion-surface-l2 p-3.5 flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Next Interval
                  </span>
                  <span className="text-lg font-bold font-mono text-sky-400 tabular-nums">
                    +{activeGroup.intervalDays}d
                  </span>
                </div>
              </div>

              {/* Chronological Session History Sub-Header (1 Word) */}
              <div className="flex items-center justify-between pt-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  History
                </h4>
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  {activeGroup.sessions.length} entries
                </span>
              </div>

              {/* Session History Cards */}
              <div className="flex flex-col gap-2.5 max-h-[42vh] overflow-y-auto pr-1">
                {activeGroup.sessions.map(session => {
                  const dateLabel = session.timestamp
                    ? getLocalDateString(0, new Date(session.timestamp))
                    : todayDateStr;
                  const modeColor =
                    session.sessionType === 'Study'
                      ? '#38bdf8'
                      : session.sessionType === 'Exercise'
                      ? '#f43f5e'
                      : '#10b981';
                  const isSessionExiting = Boolean(exitingSessionIds[session.id]);

                  return (
                    <div
                      key={session.id}
                      className={`axion-surface-l2 p-3.5 flex flex-col gap-2.5 ${
                        isSessionExiting ? 'ax-item-exit' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border"
                            style={{
                              color: modeColor,
                              borderColor: `${modeColor}40`,
                              backgroundColor: `${modeColor}15`
                            }}
                          >
                            {session.sessionType}
                          </span>
                          <span className="text-xs font-mono text-slate-300 tabular-nums">
                            {dateLabel}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteSingleSession(session.id)}
                          className="ax-pressable p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                          title="Delete Session"
                        >
                          <svg className="ax-icon w-3.5 h-3.5">
                            <use href="#ax-delete" />
                          </svg>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-300 tabular-nums">
                        <span className="px-2 py-0.5 rounded bg-black/30">
                          {session.activeMins || 0}m
                        </span>
                        {session.mcqCount && session.mcqCount > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-black/30 text-amber-400">
                            {session.mcqCount} MCQs
                          </span>
                        ) : null}
                        {session.startPage !== undefined && session.endPage !== undefined ? (
                          <span className="px-2 py-0.5 rounded bg-black/30 text-sky-400">
                            Pgs {session.startPage}–{session.endPage}
                          </span>
                        ) : null}
                        {session.retentionScore ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                            {session.retentionScore}/10
                          </span>
                        ) : null}
                      </div>

                      {(session.notes || session.frictionAnalysis) && (
                        <p className="text-xs text-slate-300 bg-black/25 p-2.5 rounded-lg border border-white/[0.05] leading-relaxed">
                          {session.notes || session.frictionAnalysis}
                        </p>
                      )}

                      {session.scratchpadImage && (
                        <button
                          type="button"
                          onClick={() => setPreviewImage(session.scratchpadImage!)}
                          className="ax-pressable relative group overflow-hidden rounded-lg border border-white/10 h-20 w-full bg-black/40 cursor-pointer"
                        >
                          <img
                            src={session.scratchpadImage}
                            alt="Scratchpad"
                            className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-opacity"
                          />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ANCHORED BOTTOM MERGE PILL ([ X Selected | Merge Sessions ]) */}
      {selectedForMerge.length >= 2 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 z-[85] axion-capsule-l3 ax-merge-bar px-5 py-3 flex flex-wrap items-center gap-3 shadow-2xl border border-emerald-500/40">
          <span className="text-xs font-mono font-bold text-emerald-400 tabular-nums">
            {selectedForMerge.length} Selected
          </span>
          <span className="text-white/20">|</span>
          <input
            type="text"
            value={mergedTargetName}
            onChange={e => setMergedTargetName(e.target.value)}
            placeholder="Unified topic title..."
            className="ios-glass-input px-3 py-1.5 text-xs text-white placeholder-slate-400 w-44 sm:w-60"
          />
          <button
            type="button"
            onClick={handleExecuteMerge}
            disabled={isProcessing}
            className="ax-pressable px-4 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer flex items-center gap-1.5"
          >
            <AxIcon name="merge" className="w-3.5 h-3.5 text-slate-950" />
            <span>{isProcessing ? 'Merging...' : 'Merge Sessions'}</span>
          </button>
        </div>
      )}

      {/* SCRATCHPAD FULL-SCREEN ZOOM MODAL */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="ax-window max-w-3xl w-full p-4 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Scratchpad</h3>
              <button
                onClick={() => setPreviewImage(null)}
                className="ax-pressable w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white cursor-pointer"
              >
                <AxIcon name="close" className="w-4 h-4" />
              </button>
            </div>
            <img
              src={previewImage}
              alt="Scratchpad Full"
              className="w-full max-h-[75vh] object-contain rounded-xl bg-black/50"
            />
          </div>
        </div>
      )}
    </div>
  );
}


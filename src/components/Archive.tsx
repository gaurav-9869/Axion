import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LogItem, getSubjectConfig, getTotalStudyTime, deduplicateLogs } from '../types';
import { getStudyLogs, deleteStudyLog } from '../services/dbService';
import { useSubjects } from '../context/SubjectContext';
import { AxIcon } from './AxionIcons';
import { sound } from '../utils/sound';
import {
  filterAndSortArchiveLogs,
  buildCalendarMonthGrid
} from '../services/archiveService';

import { auth, onAuthStateChanged } from '../firebase';

const MODE_OPTIONS = ['ALL', 'Study', 'Revise', 'Exercise'] as const;

export interface ArchiveProps {
  logs?: LogItem[];
  setLogs?: React.Dispatch<React.SetStateAction<LogItem[]>>;
}

export default function Archive({ logs: propLogs, setLogs: propSetLogs }: ArchiveProps = {}) {
  const { subjects } = useSubjects();
  const [internalLogs, setInternalLogs] = useState<LogItem[]>([]);
  const logs = propLogs ?? internalLogs;
  const setLogs = propSetLogs ?? setInternalLogs;
  const [loading, setLoading] = useState(true);

  // Search, Subject, Mode, Date & Sort Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'DESC' | 'ASC'>('DESC');

  // Unified Filter & Calendar Popover
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const popoverRef = useRef<HTMLDivElement>(null);

  // Session Inspector & Back Navigation Gesture State
  const [selectedSession, setSelectedSession] = useState<LogItem | null>(null);
  const [isInspectorClosing, setIsInspectorClosing] = useState(false);

  // Scratchpad Full-Screen Zoom Modal State
  const [zoomScratchpad, setZoomScratchpad] = useState<string | null>(null);

  // Animated Exit State for Deletion
  const [exitingLogIds, setExitingLogIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;

    const loadLogs = async () => {
      setLoading(true);
      try {
        const fetched = await getStudyLogs(1000);
        if (mounted) {
          setLogs(deduplicateLogs(fetched));
        }
      } catch (e) {
        console.error('Archive load error:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    // Load immediately
    loadLogs();

    // Re-fetch when user authentication status resolves or changes
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      if (user && mounted) {
        loadLogs();
      }
    });

    // Also reload if logs are updated elsewhere in the app
    const handleLogChange = () => {
      if (mounted) loadLogs();
    };
    window.addEventListener('axion-log-created', handleLogChange);
    window.addEventListener('axion-log-updated', handleLogChange);
    window.addEventListener('axion-log-deleted', handleLogChange);

    return () => {
      mounted = false;
      unsubscribeAuth();
      window.removeEventListener('axion-log-created', handleLogChange);
      window.removeEventListener('axion-log-updated', handleLogChange);
      window.removeEventListener('axion-log-deleted', handleLogChange);
    };
  }, []);

  // Close popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setFilterPopoverOpen(false);
      }
    };
    if (filterPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterPopoverOpen]);

  const filteredLogs = useMemo(
    () =>
      filterAndSortArchiveLogs(
        logs,
        searchQuery,
        selectedSubject,
        selectedType,
        selectedDate,
        sortOrder
      ),
    [logs, searchQuery, selectedSubject, selectedType, selectedDate, sortOrder]
  );

  const calendarDays = useMemo(
    () =>
      buildCalendarMonthGrid(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth(),
        logs
      ),
    [calendarMonth, logs]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedSubject !== 'ALL') count++;
    if (selectedType !== 'ALL') count++;
    if (selectedDate !== null) count++;
    if (sortOrder !== 'DESC') count++;
    return count;
  }, [selectedSubject, selectedType, selectedDate, sortOrder]);

  // Overall Archive Aggregations for Top Overview Strip
  const archiveMetrics = useMemo(() => {
    let totalMinutes = 0;
    let totalQuestions = 0;
    let retentionSum = 0;
    let retentionCount = 0;

    filteredLogs.forEach(l => {
      totalMinutes += getTotalStudyTime(l);
      totalQuestions +=
        (l.mcqCount || 0) + (l.vsaCount || 0) + (l.saCount || 0) + (l.laCount || 0);
      if (l.retentionScore && l.retentionScore > 0) {
        retentionSum += l.retentionScore;
        retentionCount++;
      }
    });

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const formattedTime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    const avgRetention = retentionCount > 0 ? (retentionSum / retentionCount).toFixed(1) : '8.0';

    return {
      formattedTime,
      totalQuestions,
      avgRetention
    };
  }, [filteredLogs]);

  const handleDeleteSession = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (exitingLogIds[id]) return;
    sound.playClick();
    setExitingLogIds(prev => ({ ...prev, [id]: true }));

    setTimeout(async () => {
      setLogs(prev => prev.filter(l => l.id !== id));
      if (selectedSession?.id === id) {
        setSelectedSession(null);
      }
      try {
        await deleteStudyLog(id);
      } catch (err) {
        console.error('Failed to delete session:', err);
      } finally {
        setExitingLogIds(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }, 220);
  };

  const handleCloseInspector = () => {
    if (!selectedSession || isInspectorClosing) return;
    sound.playClick();
    setIsInspectorClosing(true);
    setTimeout(() => {
      setSelectedSession(null);
      setIsInspectorClosing(false);
    }, 240);
  };

  const monthLabel = calendarMonth.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric'
  });

  const isBackgroundScaled = Boolean(selectedSession) && !isInspectorClosing;
  const activeModeIndex = MODE_OPTIONS.indexOf(selectedType as any);

  return (
    <div className="w-full flex flex-col gap-5 select-none ax-enter pb-10">
      {/* BACKGROUND ARCHIVE CANVAS (Scales 0.97 -> 1.0 over 260ms on Back Gesture) */}
      <div
        className="ax-bg-canvas-scale flex flex-col gap-5"
        style={{
          transform: isBackgroundScaled ? 'scale(0.97)' : 'scale(1)',
          opacity: isBackgroundScaled ? 0.78 : 1
        }}
      >
        {/* 1. TOP OVERVIEW METRICS STRIP (Strictly Harmonized with Tracker & Revision) */}
        <section className="axion-surface-l1 p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold tracking-tight text-white">Overview</h2>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg tabular-nums">
                {filteredLogs.length} Logged
              </span>
            </div>

            {selectedDate && (
              <button
                onClick={() => setSelectedDate(null)}
                className="ax-pressable px-2.5 py-1 rounded-lg bg-sky-500/15 border border-sky-500/30 text-xs font-mono text-sky-400 flex items-center gap-1.5 cursor-pointer"
              >
                <span>{selectedDate}</span>
                <AxIcon name="close" className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-12 gap-4 lg:gap-5">
            {/* Metric 1: Total Study Time */}
            <div className="col-span-6 md:col-span-3 axion-surface-l2 p-4 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Time</span>
                <AxIcon name="time" className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-white tabular-nums">
                {archiveMetrics.formattedTime}
              </div>
            </div>

            {/* Metric 2: Sessions Logged */}
            <div className="col-span-6 md:col-span-3 axion-surface-l2 p-4 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Sessions</span>
                <AxIcon name="archive" className="w-5 h-5 text-sky-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-white tabular-nums">
                {filteredLogs.length}
              </div>
            </div>

            {/* Metric 3: Questions Solved */}
            <div className="col-span-6 md:col-span-3 axion-surface-l2 p-4 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Questions</span>
                <AxIcon name="mcq" className="w-5 h-5 text-amber-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-white tabular-nums">
                {archiveMetrics.totalQuestions}
              </div>
            </div>

            {/* Metric 4: Average Retention */}
            <div className="col-span-6 md:col-span-3 axion-surface-l2 p-4 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Retention</span>
                <AxIcon name="retention" className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                {archiveMetrics.avgRetention} / 10
              </div>
            </div>
          </div>
        </section>

        {/* 2. SESSIONS COMMAND & FILTER BAR */}
        <section className="axion-surface-l1 p-5 md:p-6 flex flex-col gap-4">
          <div className="grid grid-cols-12 items-center gap-3">
            <div className="col-span-12 md:col-span-4 flex items-center gap-3">
              <h2 className="text-base font-bold tracking-tight text-white">Sessions</h2>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg tabular-nums">
                {filteredLogs.length}
              </span>
            </div>

            <div className="col-span-12 md:col-span-8 flex flex-wrap sm:flex-nowrap items-center justify-end gap-2.5">
              {/* Dynamic Focus Search Bar */}
              <div className="ax-search-shell relative flex-1 sm:max-w-xs rounded-xl">
                <div className="ax-search-icon absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex items-center justify-center">
                  <AxIcon name="search" className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search chapters, topics..."
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

              {/* Segmented Mode Filter Pills with Sliding Glider */}
              <div className="relative grid grid-cols-4 gap-1 p-1 rounded-xl bg-black/35 border border-white/[0.08] shrink-0 min-w-[240px]">
                <div
                  aria-hidden="true"
                  className="ax-glider-pill absolute top-1 bottom-1 left-1 w-[calc((100%-20px)/4)] rounded-lg bg-emerald-500/20 border border-emerald-500/35 pointer-events-none"
                  style={{
                    transform: `translateX(calc(${activeModeIndex >= 0 ? activeModeIndex : 0} * (100% + 4px)))`
                  }}
                />
                {MODE_OPTIONS.map(m => (
                  <button
                    key={m}
                    onClick={() => {
                      sound.playClick();
                      setSelectedType(m);
                    }}
                    className={`relative z-10 px-2.5 py-1 rounded-lg text-xs font-semibold capitalize cursor-pointer text-center transition-colors ${
                      selectedType === m
                        ? 'text-emerald-400'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {m === 'ALL' ? 'All' : m}
                  </button>
                ))}
              </div>

              {/* Unified Filter & Calendar Trigger */}
              <div className="relative" ref={popoverRef}>
                <button
                  onClick={() => {
                    sound.playClick();
                    setFilterPopoverOpen(!filterPopoverOpen);
                  }}
                  className={`ax-pressable px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border cursor-pointer ${
                    filterPopoverOpen || activeFilterCount > 0
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : 'bg-white/[0.05] hover:bg-white/[0.09] border-white/[0.08] text-white'
                  }`}
                >
                  <AxIcon name="filter" className="w-4 h-4 text-white ax-icon-white" />
                  <span>{activeFilterCount > 0 ? `${activeFilterCount} Active` : 'Filter'}</span>
                </button>

                {/* Origin-Bound Unified Filter & Calendar Popover */}
                {filterPopoverOpen && (
                  <div className="ax-popover-origin absolute right-0 top-12 w-80 sm:w-96 p-5 z-50 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white">Filter Archive</h3>
                      {activeFilterCount > 0 && (
                        <button
                          onClick={() => {
                            setSelectedSubject('ALL');
                            setSelectedType('ALL');
                            setSelectedDate(null);
                            setSortOrder('DESC');
                          }}
                          className="text-xs font-mono text-emerald-400 hover:underline cursor-pointer"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    {/* Subject Pills */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                        Subject
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setSelectedSubject('ALL')}
                          className={`ax-pressable px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                            selectedSubject === 'ALL'
                              ? 'bg-emerald-500 text-slate-950 font-bold'
                              : 'bg-white/[0.05] text-slate-300'
                          }`}
                        >
                          All
                        </button>
                        {subjects.map(s => (
                          <button
                            key={s.id}
                            onClick={() => setSelectedSubject(s.id)}
                            className={`ax-pressable px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                              selectedSubject === s.id
                                ? 'bg-emerald-500 text-slate-950 font-bold'
                                : 'bg-white/[0.05] text-slate-300'
                            }`}
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sort Order */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                        Sort Order
                      </span>
                      <select
                        value={sortOrder}
                        onChange={e => setSortOrder(e.target.value as 'DESC' | 'ASC')}
                        className="ios-glass-input px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="DESC" className="bg-slate-900">
                          Newest First
                        </option>
                        <option value="ASC" className="bg-slate-900">
                          Oldest First
                        </option>
                      </select>
                    </div>

                    {/* Calendar Month Picker */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.08]">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-white">
                          {monthLabel}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() =>
                              setCalendarMonth(
                                new Date(
                                  calendarMonth.getFullYear(),
                                  calendarMonth.getMonth() - 1,
                                  1
                                )
                              )
                            }
                            className="ax-pressable p-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 cursor-pointer"
                          >
                            <AxIcon name="chevron-left" className="w-4 h-4 text-white ax-icon-white" />
                          </button>
                          <button
                            onClick={() =>
                              setCalendarMonth(
                                new Date(
                                  calendarMonth.getFullYear(),
                                  calendarMonth.getMonth() + 1,
                                  1
                                )
                              )
                            }
                            className="ax-pressable p-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 cursor-pointer"
                          >
                            <AxIcon name="chevron-right" className="w-4 h-4 text-white ax-icon-white" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-mono text-slate-500">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                          <span key={i}>{d}</span>
                        ))}
                      </div>

                      <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map(cell => {
                          const isSelected = selectedDate === cell.dateStr;
                          return (
                            <button
                              key={cell.dateStr}
                              onClick={() =>
                                setSelectedDate(isSelected ? null : cell.dateStr)
                              }
                              className={`ax-pressable h-8 rounded-lg text-[11px] font-mono flex flex-col items-center justify-center relative cursor-pointer ${
                                !cell.inMonth ? 'opacity-30' : ''
                              } ${
                                isSelected
                                  ? 'bg-emerald-500 text-slate-950 font-bold'
                                  : cell.sessionCount > 0
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : 'hover:bg-white/[0.06] text-slate-300'
                              }`}
                            >
                              <span>{cell.day}</span>
                              {cell.sessionCount > 0 && !isSelected && (
                                <span className="w-1 h-1 rounded-full bg-emerald-400 mt-0.5" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Session Cards Grid Feed */}
          {loading ? (
            <div className="py-12 text-center text-xs font-mono text-slate-400">
              Loading archive sessions...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="axion-surface-l2 py-12 px-4 flex flex-col items-center justify-center text-center gap-2.5 rounded-[20px]">
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-400">
                <AxIcon name="archive" className="w-5 h-5" />
              </div>
              <p className="text-xs font-mono text-slate-400">No sessions match active filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-3.5">
              {filteredLogs.map(log => {
                const subConfig = getSubjectConfig(log.subject);
                const totalMins = getTotalStudyTime(log);
                const dateLabel = log.timestamp
                  ? new Date(log.timestamp).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })
                  : 'Logged';
                const modeColor =
                  log.sessionType === 'Study'
                    ? '#38bdf8'
                    : log.sessionType === 'Exercise'
                    ? '#f43f5e'
                    : '#10b981';
                const isExiting = Boolean(exitingLogIds[log.id]);

                return (
                  <div
                    key={log.id}
                    onClick={() => {
                      sound.playClick();
                      setSelectedSession(log);
                    }}
                    className={`col-span-12 md:col-span-6 axion-surface-l2 p-4 rounded-[16px] border border-white/[0.06] hover:border-white/[0.12] transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                      isExiting ? 'ax-item-exit' : ''
                    }`}
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
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
                            className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border"
                            style={{
                              color: modeColor,
                              borderColor: `${modeColor}40`,
                              backgroundColor: `${modeColor}15`
                            }}
                          >
                            {log.sessionType}
                          </span>
                          <span className="text-xs font-mono text-slate-400 tabular-nums">
                            {dateLabel}
                          </span>
                        </div>

                        <button
                          onClick={e => handleDeleteSession(log.id, e)}
                          className="ax-pressable p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                          title="Delete Session"
                        >
                          <AxIcon name="delete" className="w-4 h-4" />
                        </button>
                      </div>

                      <h3 className="text-sm font-bold text-white leading-snug">
                        {log.topic}
                      </h3>

                      {log.chapter && (
                        <span className="text-xs font-mono text-slate-400">
                          {log.chapter}
                        </span>
                      )}

                      {(log.notes || log.frictionAnalysis) && (
                        <p className="text-xs text-slate-300 bg-black/25 p-2.5 rounded-lg border border-white/[0.05] leading-relaxed">
                          {log.notes || log.frictionAnalysis}
                        </p>
                      )}

                      {log.scratchpadImage && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setZoomScratchpad(log.scratchpadImage!);
                          }}
                          className="ax-pressable relative group overflow-hidden rounded-xl border border-white/10 h-24 w-full bg-black/40 cursor-pointer mt-1"
                        >
                          <img
                            src={log.scratchpadImage}
                            alt="Scratchpad"
                            className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-opacity"
                          />
                        </button>
                      )}
                    </div>

                    {/* Tabular Metrics Strip */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.06] text-[11px] font-mono text-slate-300 tabular-nums">
                      <span className="px-2 py-0.5 rounded bg-black/30 flex items-center gap-1">
                        <AxIcon name="time" className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{totalMins}m</span>
                      </span>

                      {log.mcqCount && log.mcqCount > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-black/30 text-amber-400">
                          {log.mcqCount} MCQs
                        </span>
                      ) : null}

                      {log.startPage !== undefined && log.endPage !== undefined ? (
                        <span className="px-2 py-0.5 rounded bg-black/30 text-sky-400">
                          Pgs {log.startPage}–{log.endPage}
                        </span>
                      ) : null}

                      {log.retentionScore ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/25">
                          Retention: {log.retentionScore}.0 / 10
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* 3. SESSION INSPECTOR PANEL WITH BACK NAVIGATION GESTURE */}
      {selectedSession && (
        <div
          onClick={handleCloseInspector}
          className="fixed inset-0 z-[85] bg-black/65 backdrop-blur-md flex justify-end"
        >
          <div
            onClick={e => e.stopPropagation()}
            className={`w-full max-w-lg h-full ax-window rounded-none sm:rounded-l-[24px] p-6 flex flex-col justify-between overflow-y-auto ${
              isInspectorClosing ? 'ax-panel-dismiss-right' : 'ax-window-emerge'
            }`}
          >
            <div className="flex flex-col gap-5">
              {/* Back Gesture Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <button
                  onClick={handleCloseInspector}
                  className="ax-pressable px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <AxIcon name="chevron-left" className="w-4 h-4 text-white ax-icon-white" />
                  <span>Back</span>
                </button>
                <h3 className="text-base font-bold text-white">Details</h3>
              </div>

              <div className="axion-surface-l2 p-4 rounded-[18px] flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase"
                    style={{
                      color: getSubjectConfig(selectedSession.subject).color,
                      backgroundColor: `${getSubjectConfig(selectedSession.subject).color}18`
                    }}
                  >
                    {getSubjectConfig(selectedSession.subject).name}
                  </span>
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    {selectedSession.timestamp
                      ? new Date(selectedSession.timestamp).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })
                      : 'Logged'}
                  </span>
                </div>
                <h4 className="text-lg font-bold text-white">{selectedSession.topic}</h4>
                {selectedSession.chapter && (
                  <span className="text-xs font-mono text-slate-400">
                    {selectedSession.chapter}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="axion-surface-l2 p-3.5 rounded-[16px] flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Total Time
                  </span>
                  <span className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
                    {getTotalStudyTime(selectedSession)}m
                  </span>
                </div>
                <div className="axion-surface-l2 p-3.5 rounded-[16px] flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Retention
                  </span>
                  <span className="text-lg font-bold font-mono text-white tabular-nums">
                    {selectedSession.retentionScore || 8}.0 / 10
                  </span>
                </div>
              </div>

              {(selectedSession.notes || selectedSession.frictionAnalysis) && (
                <div className="axion-surface-l2 p-4 rounded-[16px] flex flex-col gap-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Notes
                  </span>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {selectedSession.notes || selectedSession.frictionAnalysis}
                  </p>
                </div>
              )}

              {selectedSession.scratchpadImage && (
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Scratchpad
                  </span>
                  <img
                    src={selectedSession.scratchpadImage}
                    alt="Scratchpad"
                    onClick={() => setZoomScratchpad(selectedSession.scratchpadImage!)}
                    className="w-full max-h-64 object-contain rounded-xl bg-black/50 border border-white/10 cursor-pointer"
                  />
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between">
              <button
                onClick={() => handleDeleteSession(selectedSession.id)}
                className="ax-pressable px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold text-rose-400 flex items-center gap-1.5 cursor-pointer"
              >
                <AxIcon name="delete" className="w-4 h-4" />
                <span>Delete</span>
              </button>

              <button
                onClick={handleCloseInspector}
                className="ax-pressable px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. SCRATCHPAD FULL-SCREEN ZOOM MODAL */}
      {zoomScratchpad && (
        <div
          onClick={() => setZoomScratchpad(null)}
          className="fixed inset-0 z-[95] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="ax-window max-w-3xl w-full p-4 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Scratchpad</h3>
              <button
                onClick={() => setZoomScratchpad(null)}
                className="ax-pressable w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white cursor-pointer"
              >
                <AxIcon name="close" className="w-4 h-4" />
              </button>
            </div>
            <img
              src={zoomScratchpad}
              alt="Scratchpad Full"
              className="w-full max-h-[75vh] object-contain rounded-xl bg-black/50"
            />
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { LogItem, UserSettings, getSubjectConfig, getLocalDateString } from '../types';
import { getStudyLogs } from '../services/dbService';
import { db, auth, collection, getDocs, query, orderBy } from '../firebase';
import ConceptVelocity from './ConceptVelocity';

interface AnalysisViewProps {
  loggedSessions: LogItem[];
  userSettings: UserSettings;
  setUserSettings?: React.Dispatch<React.SetStateAction<UserSettings>>;
}

export default function AnalysisView({ loggedSessions, userSettings, setUserSettings }: AnalysisViewProps) {
  const [allLogs, setAllLogs] = useState<LogItem[]>(loggedSessions);
  const [averagingDays, setAveragingDays] = useState(7);
  const [customPaceOverride, setCustomPaceOverride] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchAllLogs() {
      let dbLogs: LogItem[] = [];
      if (auth.currentUser) {
        const uid = auth.currentUser.uid;
        try {
          const q = query(
            collection(db, 'users', uid, 'logs'),
            orderBy('timestamp', 'desc')
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            dbLogs = snap.docs.map(d => d.data() as LogItem);
          }
        } catch (error: any) {
          console.warn("Firestore direct query failed in AnalysisView, falling back to dbService:", error);
          dbLogs = await getStudyLogs(500);
        }
      } else {
        dbLogs = await getStudyLogs(500);
      }

      // Combine props loggedSessions and dbLogs without duplicates
      const logMap = new Map<string, LogItem>();
      dbLogs.forEach(l => l.id && logMap.set(l.id, l));
      loggedSessions.forEach(l => l.id && logMap.set(l.id, l));
      setAllLogs(Array.from(logMap.values()));
    }
    fetchAllLogs().catch(err => console.warn("AnalysisView fetchAllLogs caught error:", err));
  }, [loggedSessions]);

  const activeLogs = allLogs.length > 0 ? allLogs : loggedSessions;

  // ── Helpers ──────────────────────────────────────────────────────────────
  function getLogsForLastNDays(n: number): LogItem[] {
    const dates = new Set<string>();
    for (let i = 0; i < n; i++) {
      dates.add(getLocalDateString(-i));
    }
    
    return activeLogs.filter(log => {
      let logDate = '';
      if (log.timestamp) {
        logDate = new Date(log.timestamp).toISOString().split('T')[0];
      } else if (log.nextReviewDate) {
        logDate = log.nextReviewDate;
      }
      return dates.has(logDate);
    }).map(l => {
      const logDate = l.timestamp ? new Date(l.timestamp).toISOString().split('T')[0] : (l.nextReviewDate || getLocalDateString(0));
      return { ...l, logDate };
    });
  }

  // ── Today's logs + last 14 days for charts ───────────────────────────────
  const last14Logs = getLogsForLastNDays(14);
  const last7Logs  = getLogsForLastNDays(7);

  // ── Chart A + B Data ────────────────────────────────────────────────────
  const subjectMinutes: Record<string, number> = { bio: 0, phys: 0, chem: 0, math: 0 };
  let totalMinutes = 0;
  let totalSessions = 0;
  let exerciseSessions = 0;

  activeLogs.forEach(log => {
    if (!log || log.isMissed) return;
    totalSessions++;
    if (log.sessionType === 'Exercise') exerciseSessions++;
    if (log.subject && log.activeMins && log.subject in subjectMinutes) {
      subjectMinutes[log.subject] += log.activeMins;
      totalMinutes += log.activeMins;
    }
  });

  let currentAngle = 0;
  const pieSlices = Object.entries(subjectMinutes).map(([key, mins]) => {
    const config = getSubjectConfig(key);
    const percentage = totalMinutes > 0 ? (mins / totalMinutes) * 100 : 0;
    const angle = totalMinutes > 0 ? (mins / totalMinutes) * 360 : 0;
    const startAngle = currentAngle;
    currentAngle += angle;
    return { key, mins, percentage, startAngle, angle, config };
  });

  // ── Chart C: Pages per day (last 14 days) ───────────────────────────────
  const last14Days = Array.from({ length: 14 }, (_, i) => getLocalDateString(-(13 - i)));

  const pagesPerDay: Record<string, Record<string, number>> = {};
  last14Days.forEach(d => { pagesPerDay[d] = {}; });

  last14Logs.forEach(log => {
    if (log.isMissed || log.sessionType !== 'Study') return;
    if (!log.startPage || !log.endPage || log.endPage <= log.startPage) return;
    const pages = log.endPage - log.startPage;
    const d = (log as any).logDate || getLocalDateString(0);
    if (pagesPerDay[d]) {
      pagesPerDay[d][log.subject] = (pagesPerDay[d][log.subject] || 0) + pages;
    }
  });

  const maxDayPages = Math.max(1, 
    ...last14Days.map(d => Object.values(pagesPerDay[d] || {}).reduce((a, b) => a + b, 0)),
    1
  );

  // Grouped Topics for Nested UI (Last 7 Days)
  const groupedTopics: { [topic: string]: LogItem[] } = {};
  last7Logs.forEach(log => {
    if (!log.isMissed && log.topic) {
      if (!groupedTopics[log.topic]) groupedTopics[log.topic] = [];
      groupedTopics[log.topic].push(log);
    }
  });

  // ── Syllabus Pace Predictor ──────────────────────────────────────────────
  const activeSubjects = userSettings.activeSubjects || ['bio', 'phys', 'chem', 'math'];

  const lastNLogs = getLogsForLastNDays(averagingDays);

  const paceCards = activeSubjects.map(sub => {
    const totalPages = userSettings.subjectPageTotals?.[sub] || 0;
    const pageGoal = userSettings.subjectGoals?.[sub] || '';
    const conf = getSubjectConfig(sub);

    // Pages covered all-time
    let coveredAllTime = 0;
    activeLogs.forEach(l => {
      if (l.subject === sub && !l.isMissed && l.sessionType === 'Study' && l.startPage && l.endPage && l.endPage > l.startPage) {
        coveredAllTime += l.endPage - l.startPage;
      }
    });

    // Pages in last N days
    let coveredNDays = 0;
    lastNLogs.forEach(l => {
      if (l.subject === sub && !l.isMissed && l.sessionType === 'Study' && l.startPage && l.endPage && l.endPage > l.startPage) {
        coveredNDays += l.endPage - l.startPage;
      }
    });

    const remaining = totalPages > 0 ? Math.max(0, totalPages - coveredAllTime) : null;
    const avgPagesPerDayN = coveredNDays / averagingDays;
    
    // Custom pace override calculation
    const overrideVal = customPaceOverride[sub] !== undefined && customPaceOverride[sub] !== '' ? Number(customPaceOverride[sub]) : 0;
    const activePace = overrideVal > 0 ? overrideVal : avgPagesPerDayN;

    const daysToFinish = (remaining !== null && activePace > 0)
      ? Math.ceil(remaining / activePace)
      : null;

    const progressPct = totalPages > 0 ? Math.min(100, Math.round((coveredAllTime / totalPages) * 100)) : null;

    return { sub, conf, totalPages, pageGoal, coveredAllTime, coveredNDays, remaining, avgPagesPerDayN, daysToFinish, progressPct, activePace, overrideVal };
  });

  const handleUpdatePageTotal = (sub: string, val: number) => {
    if (setUserSettings) {
      setUserSettings(prev => ({
        ...prev,
        subjectPageTotals: {
          ...prev.subjectPageTotals,
          [sub]: val
        }
      }));
    }
  };

  const handleUpdateSubjectGoal = (sub: string, val: string) => {
    if (setUserSettings) {
      setUserSettings(prev => ({
        ...prev,
        subjectGoals: {
          ...prev.subjectGoals,
          [sub]: val
        }
      }));
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 w-full text-zinc-100 animate-ios-fade-in">

      {/* ── GRID: Chart A + Chart B ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* CHART A: Pie */}
        <div className="ios-glass-panel p-5 shadow-xl flex flex-col gap-6 overflow-hidden min-w-0">
          <div>
            <h4 className="text-base font-bold text-white tracking-tight uppercase">Time Share Distribution</h4>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-8 py-4">
            <div className="relative w-40 h-40 shrink-0 mx-auto sm:mx-0">
              {totalMinutes > 0 ? (
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 32 32">
                  {pieSlices.map((slice, idx) => {
                    const accumulatedPercent = pieSlices.slice(0, idx).reduce((sum, p) => sum + p.percentage, 0);
                    const circ = 2 * Math.PI * 14;
                    const strokeVal = (slice.percentage / 100) * circ;
                    const offsetVal = (accumulatedPercent / 100) * circ;
                    return (
                      <circle
                        key={slice.key}
                        cx="16" cy="16" r="14"
                        fill="transparent"
                        stroke={slice.config.color}
                        strokeWidth="4"
                        strokeDasharray={`${strokeVal} ${circ}`}
                        strokeDashoffset={-offsetVal}
                        className="transition-all duration-700 hover:stroke-[5] cursor-pointer"
                      />
                    );
                  })}
                </svg>
              ) : (
                <div className="w-full h-full rounded-full border border-dashed border-white/10 flex items-center justify-center text-zinc-500 text-xs font-mono">
                  No Logs
                </div>
              )}
              <div className="absolute inset-4 sm:inset-6 bg-[#0b0f19] rounded-full border border-white/5 flex flex-col items-center justify-center text-center shadow-inner z-10">
                <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Total</span>
                <span className="text-base font-black text-white mt-0.5">{totalMinutes}m</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 w-full sm:flex-1">
              {pieSlices.map(slice => (
                <div key={slice.key} className="flex items-center gap-3 text-xs ios-glass-card-nested px-3 py-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: slice.config.color }} />
                  <span className="font-semibold text-zinc-300 capitalize min-w-[70px]">{slice.config.name}:</span>
                  <span className="font-mono font-bold text-white ml-auto">{Math.round(slice.percentage)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CHART B: Horizontal Bars */}
        <div className="ios-glass-panel p-5 shadow-xl flex flex-col gap-6 overflow-hidden min-w-0">
          <div>
            <h4 className="text-base font-bold text-white tracking-tight uppercase">Focus Symmetrical Balance</h4>
          </div>
          <div className="flex flex-col gap-5 justify-center flex-1 py-2">
            {pieSlices.map(slice => {
              const maxMinutes = Math.max(...Object.values(subjectMinutes), 1);
              const progressWidth = Math.round((slice.mins / maxMinutes) * 100);
              return (
                <div key={slice.key} className="flex flex-col gap-1.5 w-full">
                  <div className="flex justify-between items-center text-xs px-1">
                    <span className="font-bold text-zinc-300 capitalize">{slice.config.name}</span>
                    <span className="font-mono text-zinc-400">{slice.mins} mins spent</span>
                  </div>
                  <div className="w-full h-3.5 bg-black/40 rounded-full border border-white/5 overflow-hidden min-w-0 p-0.5">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${progressWidth || 3}%`, backgroundColor: slice.config.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── CHART C: Pages Per Day ─────────────── */}
      <div className="ios-glass-panel p-5 shadow-xl flex flex-col gap-6 overflow-hidden min-w-0">
        <div>
          <h4 className="text-base font-bold text-white tracking-tight uppercase">Daily Reading Pace</h4>
        </div>

        <div className="flex flex-col gap-3 overflow-x-auto pb-2 custom-scrollbar">
          {/* Bar chart */}
          <div className="flex items-end gap-1.5 h-40 min-w-[240px]">
            {last14Days.map(d => {
              const dayData = pagesPerDay[d] || {};
              const totalDay = Object.values(dayData).reduce((a, b) => a + b, 0);
              const subjects = Object.keys(dayData);
              const label = d.slice(5); // MM-DD

              return (
                <div key={d} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                  <span className="text-[9px] text-zinc-400 font-mono">{totalDay > 0 ? totalDay : ''}</span>
                  <div className="w-full flex flex-col-reverse rounded-sm overflow-hidden min-w-0" style={{ height: '120px' }}>
                    {totalDay === 0 ? (
                      <div className="w-full h-1 bg-white/5 rounded-sm mt-auto" />
                    ) : (
                      subjects.map(sub => {
                        const subPages = dayData[sub];
                        const subHeight = Math.round((subPages / maxDayPages) * 100);
                        return (
                          <div
                            key={sub}
                            className="w-full rounded-sm transition-all duration-700"
                            style={{
                              height: `${subHeight}%`,
                              backgroundColor: getSubjectConfig(sub).color,
                              opacity: 0.85
                            }}
                            title={`${getSubjectConfig(sub).name}: ${subPages} pages`}
                          />
                        );
                      })
                    )}
                  </div>
                  <span className="text-[9px] text-zinc-500 font-mono truncate w-full text-center">{label}</span>
                </div>
              );
            })}
          </div>

          {/* Subject legend */}
          <div className="flex flex-wrap gap-3 mt-2">
            {activeSubjects.map(sub => {
              const conf = getSubjectConfig(sub);
              return (
                <div key={sub} className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: conf.color }} />
                  <span>{conf.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── SYLLABUS PACE PREDICTOR ──────────────────────────────────────── */}
      <div className="ios-glass-panel p-5 shadow-xl flex flex-col gap-6 overflow-hidden min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-bold text-white tracking-tight uppercase">Syllabus Pace Predictor</h4>
          </div>
          
          {/* Global Pace Tuning Parameters */}
          <div className="ios-glass-card-nested px-4 py-2.5 flex items-center gap-4 text-xs w-full sm:w-64">
            <span className="text-zinc-400 shrink-0 uppercase tracking-widest font-semibold">Averaging Window:</span>
            <input 
              type="range" 
              min="1" 
              max="30" 
              value={averagingDays} 
              onChange={(e) => {
                setAveragingDays(Number(e.target.value));
                try {
                  (window as any).sound?.playTick();
                } catch {}
              }}
              className="w-full h-1 bg-black/40 accent-emerald-400 cursor-pointer"
            />
            <span className="font-mono text-emerald-400 font-bold shrink-0">{averagingDays}d</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-ios-slide-up">
          {paceCards.map(card => (
            <div key={card.sub} className="ios-glass-card-nested p-5 flex flex-col gap-4 relative overflow-hidden min-w-0 hover:scale-[1.01] hover:shadow-2xl transition-all duration-300">
              <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: card.conf.color }} />
              <div className="pl-2 flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: card.conf.color }}>{card.conf.name}</span>
                {card.totalPages > 0 && (
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider bg-black/30 px-1.5 py-0.5 rounded">
                    Goal: {card.pageGoal || 'None'}
                  </span>
                )}
              </div>

              {card.totalPages === 0 ? (
                <div className="pl-2 flex flex-col gap-1">
                  <p className="text-xs text-zinc-500 italic">No total pages set for this subject.</p>
                  <p className="text-[10px] text-zinc-600">Enter total pages below to activate predictor metrics.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 pl-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">Progress</span>
                      <span className="font-mono font-bold text-white">{card.coveredAllTime} / {card.totalPages} pg</span>
                    </div>
                    <div className="w-full h-2 bg-black/40 rounded-full border border-white/5 overflow-hidden min-w-0">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${card.progressPct || 0}%`, backgroundColor: card.conf.color }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-500 text-right">{card.progressPct}% complete</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="ios-glass-card-nested p-3 text-center">
                      <span className="text-zinc-500 block text-[10px] uppercase tracking-wider">{averagingDays}-day avg</span>
                      <span className="font-black text-white text-base mt-0.5 block">
                        {card.avgPagesPerDayN > 0 ? card.avgPagesPerDayN.toFixed(1) : '—'}
                      </span>
                      <span className="text-zinc-600 text-[10px]">pages/day</span>
                    </div>
                    <div className="ios-glass-card-nested p-3 text-center">
                      <span className="text-zinc-500 block text-[10px] uppercase tracking-wider">Est. finish</span>
                      <span className="font-black mt-0.5 block text-base" style={{ color: card.conf.color }}>
                        {card.daysToFinish !== null ? `${card.daysToFinish}d` : '—'}
                      </span>
                      <span className="text-zinc-600 text-[10px]">at current pace</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Inline Tuning Panel */}
              <div className="mt-2 pt-4 border-t border-white/5 flex flex-col gap-3 pl-2">
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Tuning & Manual Adjustments</div>
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase">Total Pages</span>
                    <input 
                      type="number"
                      min="0"
                      value={card.totalPages || ''}
                      onChange={(e) => handleUpdatePageTotal(card.sub, Number(e.target.value))}
                      className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white/20 font-mono"
                      placeholder="e.g. 500"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase">Page Goal</span>
                    <input 
                      type="text"
                      value={card.pageGoal}
                      onChange={(e) => handleUpdateSubjectGoal(card.sub, e.target.value)}
                      className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white/20"
                      placeholder="e.g. 10 pgs"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase">Pace Override</span>
                    <input 
                      type="number"
                      min="0"
                      step="0.1"
                      value={customPaceOverride[card.sub] || ''}
                      onChange={(e) => setCustomPaceOverride(prev => ({ ...prev, [card.sub]: e.target.value }))}
                      className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white/20 font-mono"
                      placeholder="pg/day"
                    />
                  </div>
                </div>
                <span className="text-[9px] text-zinc-500">
                  Calculating with: <span className="text-zinc-300 font-semibold">{card.overrideVal > 0 ? `${card.overrideVal} pg/d (Override)` : `${card.avgPagesPerDayN.toFixed(1)} pg/d (${averagingDays}d Avg)`}</span>
                </span>
              </div>

            </div>
          ))}
        </div>
      </div>

      {/* ── NESTED UI GROUPING (Topic Logs) ───────────────────────────────── */}
      <div className="ios-glass-panel p-5 shadow-xl flex flex-col gap-6 overflow-hidden min-w-0">
        <div>
          <h4 className="text-base font-bold text-white tracking-tight uppercase">Recent Topics Review</h4>
        </div>
        <div className="flex flex-col gap-3">
            {Object.keys(groupedTopics).length === 0 ? (
                 <div className="p-4 text-center text-zinc-500 text-xs border border-dashed border-white/10 rounded-xl">No logs found in the last 7 days.</div>
            ) : (
                Object.entries(groupedTopics).map(([topic, logs]) => {
                    const firstLog = logs[0];
                    const conf = getSubjectConfig(firstLog.subject);
                    return (
                       <div key={topic} className="ios-glass-card-nested overflow-hidden min-w-0 flex flex-col">
                           <div className="p-4 flex items-center justify-between bg-white/5 border-b border-white/5">
                               <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                                   <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: conf.color }}></span>
                                   <span className="font-bold text-sm text-zinc-200 truncate">{topic}</span>
                               </div>
                               <span className="text-xs font-mono text-zinc-500 shrink-0">{logs.length} session{logs.length > 1 ? 's' : ''}</span>
                           </div>
                           <div className="flex flex-col">
                               {logs.map((log, idx) => (
                                   <div key={log.id} className={`p-3 flex items-center justify-between text-xs transition-colors hover:bg-white/5 ${idx !== logs.length - 1 ? 'border-b border-white/5' : ''}`}>
                                       <div className="flex items-center gap-3 pl-4 border-l-2 border-white/10 ml-2">
                                           <span className={`px-2 py-0.5 rounded uppercase font-bold tracking-widest text-[9px] ${
                                               log.sessionType === 'Study' ? 'bg-blue-500/20 text-blue-400' : 
                                               log.sessionType === 'Revise' ? 'bg-emerald-500/20 text-emerald-400' : 
                                               log.sessionType === 'Exercise' ? 'bg-orange-500/20 text-orange-400' : 'bg-rose-500/20 text-rose-400'
                                           }`}>
                                               {log.sessionType}
                                           </span>
                                           <span className="text-zinc-400">{(log as any).logDate}</span>
                                       </div>
                                       <div className="flex items-center gap-3 text-zinc-500">
                                           <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">timer</span> {log.activeMins}m</span>
                                           {log.retentionScore !== undefined && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px] ">psychology</span> {log.retentionScore}/10</span>}
                                       </div>
                                   </div>
                               ))}
                           </div>
                       </div>
                    );
                })
            )}
        </div>
      </div>

    </div>
  );
}

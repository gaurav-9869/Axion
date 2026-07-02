import React, { useState, useEffect } from 'react';
import { LogItem, UserSettings, getSubjectConfig, getLocalDateString } from '../types';

interface AnalysisViewProps {
  loggedSessions: LogItem[];
  userSettings: UserSettings;
}

export default function AnalysisView({ loggedSessions, userSettings }: AnalysisViewProps) {



  // ── Helpers ──────────────────────────────────────────────────────────────
  function getWeekKey(): string {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  function getLogsForLastNDays(n: number): LogItem[] {
    const result: LogItem[] = [];
    for (let i = 0; i < n; i++) {
      const dateStr = getLocalDateString(-i);
      try {
        const raw = localStorage.getItem(`pcbm_log_${dateStr}`) || localStorage.getItem(`axion_logs_${dateStr}`);
        if (raw) {
          const logs = JSON.parse(raw);
          if (Array.isArray(logs)) {
              logs.forEach(l => l.logDate = dateStr);
              result.push(...logs);
          }
        }
      } catch(e) {}
    }
    return result;
  }

  // ── Today's logs + last 14 days for charts ───────────────────────────────
  const last14Logs = getLogsForLastNDays(14);
  const last7Logs  = getLogsForLastNDays(7);

  // ── Existing Chart A + B data ────────────────────────────────────────────
  const subjectMinutes: Record<string, number> = { bio: 0, phys: 0, chem: 0, math: 0 };
  let totalMinutes = 0;
  let totalSessions = 0;
  let exerciseSessions = 0;

  loggedSessions.forEach(log => {
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
    if (log.isMissed || log.sessionType === 'Exercise') return;
    if (!log.startPage || !log.endPage || log.endPage <= log.startPage) return;
    const pages = log.endPage - log.startPage;
    // find which date this log belongs to
    for (let i = 0; i < 14; i++) {
      const d = getLocalDateString(-i);
      const raw = localStorage.getItem(`pcbm_log_${d}`);
      if (raw) {
        try {
          const arr: LogItem[] = JSON.parse(raw);
          if (arr.some(l => l.id === log.id)) {
            if (!pagesPerDay[d]) pagesPerDay[d] = {};
            pagesPerDay[d][log.subject] = (pagesPerDay[d][log.subject] || 0) + pages;
            break;
          }
        } catch(e) {}
      }
    }
  });

  const maxDayPages = Math.max(
    ...last14Days.map(d => Object.values(pagesPerDay[d] || {}).reduce((a, b) => a + b, 0)),
    1
  );

  // Grouped Topics for Nested UI (Last 7 Days)
  const groupedTopics: { [topic: string]: LogItem[] } = {};
  last7Logs.forEach(log => {
      if (!log.isMissed) {
          if (!groupedTopics[log.topic]) groupedTopics[log.topic] = [];
          groupedTopics[log.topic].push(log);
      }
  });

  // ── Syllabus Pace Predictor ──────────────────────────────────────────────
  const activeSubjects = userSettings.activeSubjects || ['bio', 'phys', 'chem', 'math'];

  const paceCards = activeSubjects.map(sub => {
    const totalPages = userSettings.subjectPageTotals?.[sub] || 0;
    const conf = getSubjectConfig(sub);

    // Pages covered all-time from every saved log
    let coveredAllTime = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('pcbm_log_')) continue;
      try {
        const logs: LogItem[] = JSON.parse(localStorage.getItem(key) || '[]');
        logs.forEach(l => {
          if (l.subject === sub && !l.isMissed && l.sessionType !== 'Exercise' && l.startPage && l.endPage && l.endPage > l.startPage) {
            coveredAllTime += l.endPage - l.startPage;
          }
        });
      } catch(e) {}
    }

    // Pages in last 7 days
    let covered7Days = 0;
    last7Logs.forEach(l => {
      if (l.subject === sub && !l.isMissed && l.sessionType !== 'Exercise' && l.startPage && l.endPage && l.endPage > l.startPage) {
        covered7Days += l.endPage - l.startPage;
      }
    });

    const remaining = totalPages > 0 ? Math.max(0, totalPages - coveredAllTime) : null;
    const avgPagesPerDay7 = covered7Days / 7;
    const daysToFinish = (remaining !== null && avgPagesPerDay7 > 0)
      ? Math.ceil(remaining / avgPagesPerDay7)
      : null;

    const progressPct = totalPages > 0 ? Math.min(100, Math.round((coveredAllTime / totalPages) * 100)) : null;

    return { sub, conf, totalPages, coveredAllTime, covered7Days, remaining, avgPagesPerDay7, daysToFinish, progressPct };
  });



  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-8 w-full text-zinc-100 animate-fade-in">

      {/* ── GRID: Chart A + Chart B (unchanged) ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* CHART A: Pie */}
        <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-[32px] p-6 shadow-2xl flex flex-col gap-6">
          <div>
            <h4 className="text-base font-bold text-white tracking-tight">Time Share Distribution</h4>
            <p className="text-xs text-zinc-400 mt-0.5">Stream category breakdown ratios</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-4">
            <div className="relative w-44 h-44 shrink-0">
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
                <div className="w-full h-full rounded-full border border-dashed border-white/10 flex items-center justify-center text-xs text-zinc-500">No logs saved</div>
              )}
              <div className="absolute inset-7 bg-[#0b0f19] rounded-full border border-white/5 flex flex-col items-center justify-center text-center">
                <span className="text-xs text-zinc-400 uppercase font-bold tracking-wider">Total</span>
                <span className="text-base font-black text-white mt-0.5">{totalMinutes}m</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 w-full sm:w-auto">
              {pieSlices.map(slice => (
                <div key={slice.key} className="flex items-center gap-3 text-xs bg-black/20 px-3 py-2 rounded-xl border border-white/5">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: slice.config.color }} />
                  <span className="font-semibold text-zinc-300 capitalize min-w-[70px]">{slice.config.name}:</span>
                  <span className="font-mono font-bold text-white ml-auto">{Math.round(slice.percentage)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CHART B: Horizontal Bars */}
        <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-[32px] p-6 shadow-2xl flex flex-col gap-6">
          <div>
            <h4 className="text-base font-bold text-white tracking-tight">Focus Symmetrical Balance</h4>
            <p className="text-xs text-zinc-400 mt-0.5">Tracked hours relative progression marks</p>
          </div>
          <div className="flex flex-col gap-5 justify-center flex-1 py-2">
            {pieSlices.map(slice => {
              const maxMinutes = Math.max(...Object.values(subjectMinutes), 1);
              const progressWidth = Math.round((slice.mins / maxMinutes) * 100);
              return (
                <div key={slice.key} className="flex flex-col gap-1.5 w-full">
                  <div className="flex justify-between items-center text-xs px-1">
                    <span className="font-bold text-zinc-300 capitalize">{slice.config.name}</span>
                    <span className="font-mono text-zinc-500">{slice.mins} mins spend</span>
                  </div>
                  <div className="w-full h-3.5 bg-black/40 rounded-full border border-white/5 overflow-hidden p-0.5">
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

      {/* ── CHART C: Pages Per Day (replaces Venn diagram) ─────────────── */}
      <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-[32px] p-6 shadow-2xl flex flex-col gap-6">
        <div>
          <h4 className="text-base font-bold text-white tracking-tight">Daily Reading Pace</h4>
          <p className="text-xs text-zinc-400 mt-0.5">Pages completed per day — last 14 days, colored by subject</p>
        </div>

        <div className="flex flex-col gap-3">
          {/* Bar chart */}
          <div className="flex items-end gap-1.5 h-40 w-full">
            {last14Days.map(d => {
              const dayData = pagesPerDay[d] || {};
              const totalDay = Object.values(dayData).reduce((a, b) => a + b, 0);
              const barHeight = totalDay > 0 ? Math.max(8, Math.round((totalDay / maxDayPages) * 100)) : 0;
              const subjects = Object.keys(dayData);
              const label = d.slice(5); // MM-DD

              return (
                <div key={d} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                  <span className="text-[9px] text-zinc-500 font-mono">{totalDay > 0 ? totalDay : ''}</span>
                  <div className="w-full flex flex-col-reverse rounded-sm overflow-hidden" style={{ height: '120px' }}>
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
                  <span className="text-[9px] text-zinc-600 font-mono truncate w-full text-center">{label}</span>
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
      <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-[32px] p-6 shadow-2xl flex flex-col gap-6">
        <div>
          <h4 className="text-base font-bold text-white tracking-tight">Syllabus Pace Predictor</h4>
          <p className="text-xs text-zinc-400 mt-0.5">Based on your last 7 days average — set total pages per subject in Account settings</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {paceCards.map(card => (
            <div key={card.sub} className="bg-black/20 border border-white/5 rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: card.conf.color }} />
              <div className="pl-2">
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: card.conf.color }}>{card.conf.name}</span>
              </div>

              {card.totalPages === 0 ? (
                <p className="text-xs text-zinc-500 italic pl-2">No total pages set. Add it in Account → Syllabus Page Totals.</p>
              ) : (
                <div className="flex flex-col gap-3 pl-2">
                  {/* Progress bar */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">Progress</span>
                      <span className="font-mono font-bold text-white">{card.coveredAllTime} / {card.totalPages} pg</span>
                    </div>
                    <div className="w-full h-2 bg-black/40 rounded-full border border-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${card.progressPct || 0}%`, backgroundColor: card.conf.color }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-500 text-right">{card.progressPct}% complete</span>
                  </div>

                  {/* Pace stats */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-black/30 rounded-xl p-3 text-center border border-white/5">
                      <span className="text-zinc-500 block text-[10px] uppercase tracking-wider">7-day avg</span>
                      <span className="font-black text-white text-base mt-0.5 block">
                        {card.avgPagesPerDay7 > 0 ? card.avgPagesPerDay7.toFixed(1) : '—'}
                      </span>
                      <span className="text-zinc-600 text-[10px]">pages/day</span>
                    </div>
                    <div className="bg-black/30 rounded-xl p-3 text-center border border-white/5">
                      <span className="text-zinc-500 block text-[10px] uppercase tracking-wider">Est. finish</span>
                      <span className="font-black mt-0.5 block text-base" style={{ color: card.conf.color }}>
                        {card.daysToFinish !== null ? `${card.daysToFinish}d` : '—'}
                      </span>
                      <span className="text-zinc-600 text-[10px]">at current pace</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── NESTED UI GROUPING (Topic Logs) ───────────────────────────────── */}
      <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-[32px] p-6 shadow-2xl flex flex-col gap-6">
        <div>
          <h4 className="text-base font-bold text-white tracking-tight">Recent Topics Review</h4>
          <p className="text-xs text-zinc-400 mt-0.5">Your past 7 days grouped by topic, nested with study and revision loops.</p>
        </div>
        <div className="flex flex-col gap-3">
            {Object.keys(groupedTopics).length === 0 ? (
                 <div className="p-4 text-center text-zinc-500 text-xs border border-dashed border-white/10 rounded-xl">No logs found in the last 7 days.</div>
            ) : (
                Object.entries(groupedTopics).map(([topic, logs]) => {
                    const firstLog = logs[0];
                    const conf = getSubjectConfig(firstLog.subject);
                    return (
                       <div key={topic} className="bg-black/20 border border-white/5 rounded-2xl overflow-hidden flex flex-col">
                           <div className="p-4 flex items-center justify-between bg-white/5 border-b border-white/5">
                               <div className="flex items-center gap-3">
                                   <span className="w-2 h-2 rounded-full" style={{ backgroundColor: conf.color }}></span>
                                   <span className="font-bold text-sm text-zinc-200">{topic}</span>
                               </div>
                               <span className="text-xs font-mono text-zinc-500">{logs.length} session{logs.length > 1 ? 's' : ''}</span>
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
                                           {log.retentionScore !== undefined && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px] text-amber-500">psychology</span> {log.retentionScore}/10</span>}
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

      {/* ── TIME ALLOCATION DISTRIBUTION ─────────────────────────────────── */}
      <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-[32px] p-6 shadow-2xl flex flex-col gap-6">
          <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Time Allocation Distribution</h3>
              <div className="text-xs font-bold bg-black/40 border border-white/10 px-3 py-1.5 rounded-lg text-emerald-400">
                  Total: {totalMinutes} mins
              </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(subjectMinutes).map(([key, val]) => {
                  const config = getSubjectConfig(key);
                  const maxVal = Math.max(...Object.values(subjectMinutes), 1);
                  const barWidth = Math.min(100, Math.round((val / maxVal) * 100));

                  return (
                      <div key={key} className="flex flex-col gap-1.5 bg-black/20 p-4 rounded-xl border border-white/5">
                          <div className="flex justify-between text-xs font-semibold px-1">
                              <span className="text-zinc-300 capitalize">{config.name}</span>
                              <span className="text-zinc-500 font-mono">{val} mins</span>
                          </div>
                          <div className="w-full h-3 bg-black/40 rounded-full overflow-hidden border border-white/5">
                              <div 
                                  className="h-full rounded-full transition-all duration-500" 
                                  style={{ width: `${barWidth || 3}%`, backgroundColor: config.color }} 
                              />
                          </div>
                      </div>
                  );
              })}
          </div>
      </div>

    </div>
  );
}

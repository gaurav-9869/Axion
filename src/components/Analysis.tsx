import React, { useState, useMemo } from 'react';
import { LogItem, UserSettings } from '../types';
import { AxIcon } from './AxionIcons';
import { sound } from '../utils/sound';
import {
  computeAnalysisDashboardData,
  TimeframeWindow
} from '../services/analysisService';

interface Props {
  loggedSessions: LogItem[];
  userSettings: UserSettings;
  setUserSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
}

const TIMEFRAME_OPTIONS: { id: TimeframeWindow; label: string }[] = [
  { id: '7d', label: '7D' },
  { id: '14d', label: '14D' },
  { id: '30d', label: '30D' },
  { id: 'all', label: 'All' }
];

export default function Analysis({ loggedSessions }: Props) {
  const [timeframe, setTimeframe] = useState<TimeframeWindow>('7d');

  const data = useMemo(
    () => computeAnalysisDashboardData(loggedSessions, timeframe),
    [loggedSessions, timeframe]
  );

  const barCentersX = [75, 130, 185, 240, 295, 350, 405];
  const activeTimeframeIndex = TIMEFRAME_OPTIONS.findIndex(tf => tf.id === timeframe);

  return (
    <div className="w-full flex flex-col gap-5 select-none ax-enter pb-10">
      {/* 1. TOP OVERVIEW METRICS STRIP (Strictly Harmonized with Tracker & Revision) */}
      <section className="axion-surface-l1 p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold tracking-tight text-white">Overview</h2>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg tabular-nums">
              {timeframe === 'all' ? 'All Time' : timeframe.toUpperCase()}
            </span>
          </div>

          <span className="text-xs font-mono text-slate-400">
            {loggedSessions.length} total sessions
          </span>
        </div>

        <div className="grid grid-cols-12 gap-4 lg:gap-5">
          {/* Metric 1: Total Study Time */}
          <div className="col-span-6 md:col-span-3 axion-surface-l2 p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Time</span>
              <AxIcon name="time" className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {data.totalTimeLabel}
            </div>
          </div>

          {/* Metric 2: Accuracy */}
          <div className="col-span-6 md:col-span-3 axion-surface-l2 p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Accuracy</span>
              <AxIcon name="tick" className="w-5 h-5 text-sky-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {data.overallAccuracy}%
            </div>
          </div>

          {/* Metric 3: Study Pace */}
          <div className="col-span-6 md:col-span-3 axion-surface-l2 p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Pace</span>
              <AxIcon name="active" className="w-5 h-5 text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {data.avgPaceLabel}
            </div>
          </div>

          {/* Metric 4: Streak */}
          <div className="col-span-6 md:col-span-3 axion-surface-l2 p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Streak</span>
              <AxIcon name="goals" className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
              {data.streakDays}d
            </div>
          </div>
        </div>
      </section>

      {/* 2. TELEMETRY CONTROLS & TIMEFRAME SELECTOR */}
      <section className="axion-surface-l1 p-5 md:p-6 flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold tracking-tight text-white">Telemetry</h2>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg tabular-nums">
              4 Modules
            </span>
          </div>

          {/* Sliding Glider Segmented Pill */}
          <div className="relative grid grid-cols-4 gap-1 p-1 rounded-xl bg-black/35 border border-white/[0.08] shrink-0 min-w-[220px]">
            <div
              aria-hidden="true"
              className="ax-glider-pill absolute top-1 bottom-1 left-1 w-[calc((100%-20px)/4)] rounded-lg bg-emerald-500/20 border border-emerald-500/35 pointer-events-none"
              style={{
                transform: `translateX(calc(${activeTimeframeIndex >= 0 ? activeTimeframeIndex : 0} * (100% + 4px)))`
              }}
            />
            {TIMEFRAME_OPTIONS.map(tf => (
              <button
                key={tf.id}
                onClick={() => {
                  sound.playClick();
                  setTimeframe(tf.id);
                }}
                className={`relative z-10 px-3 py-1 rounded-lg text-xs font-mono font-semibold cursor-pointer text-center transition-colors ${
                  timeframe === tf.id
                    ? 'text-emerald-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2x2 Master Graphs Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* CHART 1: STUDY TIME (CONCENTRIC DONUT) */}
          <article className="axion-surface-l2 p-5 md:p-6 rounded-[20px] flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white tracking-tight">Study Time</h3>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-400 tabular-nums">
                {timeframe === 'all' ? 'All Time' : timeframe.toUpperCase()}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-around gap-6 my-auto py-2">
              {/* Concentric SVG Donut */}
              <div className="relative w-48 h-48 flex items-center justify-center shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                  {/* Base Track Ring */}
                  <circle
                    cx="100"
                    cy="100"
                    r="74"
                    fill="none"
                    stroke="rgba(255,255,255,0.04)"
                    strokeWidth="20"
                  />
                  {/* Segments */}
                  {data.totalStudyMinutes > 0 &&
                    data.donutSegments.map(seg =>
                      seg.minutes > 0 ? (
                        <circle
                          key={seg.id}
                          cx="100"
                          cy="100"
                          r="74"
                          fill="none"
                          stroke={seg.color}
                          strokeWidth="20"
                          strokeDasharray={seg.strokeDasharray}
                          strokeDashoffset={seg.strokeDashoffset}
                          strokeLinecap="butt"
                        />
                      ) : null
                    )}
                  {/* Inner & Outer 1px Glass Rings */}
                  <circle
                    cx="100"
                    cy="100"
                    r="63"
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="1"
                  />
                  <circle
                    cx="100"
                    cy="100"
                    r="85"
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="1"
                  />
                </svg>

                {/* Center Readout */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                    Total Time
                  </span>
                  <span className="text-xl font-bold font-mono text-white mt-0.5 tabular-nums">
                    {data.totalTimeLabel}
                  </span>
                </div>
              </div>

              {/* 2x2 Subject Legend Grid */}
              <div className="grid grid-cols-2 gap-3 w-full sm:w-auto flex-1 max-w-xs">
                {data.donutSegments.map(seg => (
                  <div
                    key={seg.id}
                    className="p-3 rounded-xl bg-black/25 border border-white/[0.06] flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor: seg.color,
                          boxShadow: `0 0 8px ${seg.color}`
                        }}
                      />
                      <span className="text-xs font-semibold text-slate-200">{seg.name}</span>
                    </div>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-sm font-mono font-bold text-white tabular-nums">
                        {seg.hoursLabel}
                      </span>
                      <span className="text-[11px] font-mono text-emerald-400 tabular-nums">
                        {seg.percent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>

          {/* CHART 2: DAILY ACTIVITY (STACKED BAR CHART) */}
          <article className="axion-surface-l2 p-5 md:p-6 rounded-[20px] flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white tracking-tight">Daily Activity</h3>
              <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <i className="w-2 h-2 rounded-xs bg-[#38bdf8] inline-block" />
                  Phy
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="w-2 h-2 rounded-xs bg-[#f59e0b] inline-block" />
                  Chem
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="w-2 h-2 rounded-xs bg-[#a855f7] inline-block" />
                  Math
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="w-2 h-2 rounded-xs bg-[#10b981] inline-block" />
                  Bio
                </span>
              </div>
            </div>

            <div className="w-full h-56 relative my-auto">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 460 220">
                {/* Horizontal Dashed Gridlines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                  const y = Math.round(20 + ratio * 160);
                  const labelHrs = Math.round(data.maxDailyHours * (1 - ratio));
                  return (
                    <g key={idx}>
                      <line
                        x1="40"
                        y1={y}
                        x2="445"
                        y2={y}
                        stroke={
                          ratio === 1
                            ? 'rgba(255, 255, 255, 0.08)'
                            : 'rgba(255, 255, 255, 0.05)'
                        }
                        strokeWidth="1"
                        strokeDasharray={ratio === 1 ? undefined : '4 4'}
                      />
                      <text
                        x="30"
                        y={y + 4}
                        textAnchor="end"
                        fill="#64748b"
                        fontFamily="JetBrains Mono, monospace"
                        fontSize="10"
                      >
                        {labelHrs}h
                      </text>
                    </g>
                  );
                })}

                {/* Stacked Bars */}
                {data.dailyBars.map((bar, idx) => {
                  const centerX = barCentersX[idx] || 75 + idx * 55;
                  const rectX = centerX - 13;
                  return (
                    <g key={bar.dateStr}>
                      {bar.segments.length === 0 ? (
                        <rect
                          x={rectX}
                          y={177}
                          width="26"
                          height="3"
                          rx="1.5"
                          fill="rgba(255,255,255,0.06)"
                        />
                      ) : (
                        bar.segments.map((seg, sIdx) => (
                          <rect
                            key={`${bar.dateStr}-${seg.subject}-${sIdx}`}
                            x={rectX}
                            y={seg.yPx}
                            width="26"
                            height={seg.heightPx}
                            rx="3"
                            fill={seg.color}
                          />
                        ))
                      )}
                      <text
                        x={centerX}
                        y="202"
                        textAnchor="middle"
                        fill={idx === data.dailyBars.length - 1 ? '#10b981' : '#94a3b8'}
                        fontFamily="JetBrains Mono, monospace"
                        fontSize="11"
                      >
                        {bar.dayShort}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </article>

          {/* CHART 3: PRACTICE ACTIVITY (MCQ ACCURACY + EMPIRICAL BENCHMARKS) */}
          <article className="axion-surface-l2 p-5 md:p-6 rounded-[20px] flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white tracking-tight">Practice Activity</h3>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-400 tabular-nums">
                {data.overallAccuracy}% Accuracy
              </span>
            </div>

            <div className="space-y-4 my-auto">
              {data.practiceTracks.map(track => (
                <div key={track.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200 flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: track.color }}
                      />
                      {track.name}
                    </span>
                    <div className="font-mono text-slate-300 tabular-nums">
                      <span className="text-white font-bold">{track.questions}</span> Qs
                      <span className="text-slate-500 mx-1">·</span>
                      <span style={{ color: track.color }} className="font-semibold">
                        {track.accuracy}% Acc
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-900/80 overflow-hidden p-0.5 border border-white/[0.06]">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(track.questions > 0 ? 4 : 0, track.accuracy)}%`,
                        backgroundColor: track.color,
                        boxShadow: `0 0 10px ${track.color}66`
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Empirical Benchmark Row */}
            <div className="mt-2 pt-3.5 border-t border-white/[0.06] grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400 font-semibold">
                  Accuracy
                </div>
                <div className="text-sm font-mono font-bold text-white mt-0.5 tabular-nums">
                  {data.overallAccuracy}%
                </div>
              </div>
              <div className="border-x border-white/[0.06]">
                <div className="text-[10px] font-mono uppercase text-slate-400 font-semibold">
                  Avg Pace
                </div>
                <div className="text-sm font-mono font-bold text-emerald-400 mt-0.5 tabular-nums">
                  {data.avgSecondsPerItem}s
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400 font-semibold">
                  Streak
                </div>
                <div className="text-sm font-mono font-bold text-amber-400 mt-0.5 tabular-nums">
                  {data.streakDays}d
                </div>
              </div>
            </div>
          </article>

          {/* CHART 4: STUDY PACE (SMOOTH CUBIC-BEZIER AREA TRENDLINE) */}
          <article className="axion-surface-l2 p-5 md:p-6 rounded-[20px] flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white tracking-tight">Study Pace</h3>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-400 tabular-nums font-semibold">
                  {data.avgPaceLabel}
                </span>
              </div>
            </div>

            <div className="w-full h-52 relative my-auto">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 460 190">
                <defs>
                  <linearGradient id="axPaceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Dashed Gridlines */}
                {[0, 0.33, 0.66, 1].map((ratio, idx) => {
                  const y = Math.round(20 + ratio * 130);
                  const labelHrs = Math.round(10 * (1 - ratio));
                  return (
                    <g key={idx}>
                      <line
                        x1="40"
                        y1={y}
                        x2="445"
                        y2={y}
                        stroke={
                          ratio === 1
                            ? 'rgba(255, 255, 255, 0.08)'
                            : 'rgba(255, 255, 255, 0.05)'
                        }
                        strokeWidth="1"
                        strokeDasharray={ratio === 1 ? undefined : '4 4'}
                      />
                      <text
                        x="30"
                        y={y + 4}
                        textAnchor="end"
                        fill="#64748b"
                        fontFamily="JetBrains Mono, monospace"
                        fontSize="10"
                      >
                        {labelHrs}
                      </text>
                    </g>
                  );
                })}

                {/* Smooth Area Gradient & Trendline */}
                {data.bezierAreaPath && (
                  <path d={data.bezierAreaPath} fill="url(#axPaceFill)" />
                )}
                {data.bezierLinePath && (
                  <path
                    d={data.bezierLinePath}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                )}

                {/* Day Points & Labels */}
                {data.paceNodes.map((pt, idx) => (
                  <g key={idx}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="4"
                      fill="#10b981"
                      stroke="#0d131f"
                      strokeWidth="2"
                    />
                    <text
                      x={pt.x}
                      y="178"
                      textAnchor="middle"
                      fill={idx === data.paceNodes.length - 1 ? '#10b981' : '#94a3b8'}
                      fontFamily="JetBrains Mono, monospace"
                      fontSize="11"
                    >
                      {pt.dayLabel}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}

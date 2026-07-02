import React, { useState, useEffect, useMemo } from 'react';
import { LogItem, getSubjectConfig } from '../types';

interface SundayReviewViewProps {
  loggedSessions: LogItem[];
  setLoggedSessions: React.Dispatch<React.SetStateAction<LogItem[]>>;
}

export default function SundayReviewView({ loggedSessions, setLoggedSessions }: SundayReviewViewProps) {
  const [allLogs, setAllLogs] = useState<LogItem[]>([]);

  useEffect(() => {
    // Load historical logs for refinements
    const keys = Object.keys(localStorage);
    const logsFromStorage: LogItem[] = [];
    keys.filter(k => k.startsWith('axion_logs_') || k.startsWith('pcbm_log_')).forEach(k => {
       try {
           const parsed = JSON.parse(localStorage.getItem(k) || '[]');
           if (Array.isArray(parsed)) {
               logsFromStorage.push(...parsed);
           }
       } catch (e) {}
    });
    setAllLogs(logsFromStorage);
  }, [loggedSessions]);

  const refinements = useMemo(() => {
     return allLogs.filter(log => log.systemRefinement && log.systemRefinement.trim() !== '');
  }, [allLogs]);

  const handleToggleWorks = (logId: string, currentVal: boolean | undefined) => {
    // We must update the localStorage directly where this log resides
    const keys = Object.keys(localStorage);
    keys.filter(k => k.startsWith('axion_logs_') || k.startsWith('pcbm_log_')).forEach(k => {
       try {
           const parsed = JSON.parse(localStorage.getItem(k) || '[]');
           if (Array.isArray(parsed)) {
               const idx = parsed.findIndex(l => l.id === logId);
               if (idx !== -1) {
                   parsed[idx].systemRefinementWorks = currentVal === undefined ? true : currentVal === true ? false : undefined;
                   localStorage.setItem(k, JSON.stringify(parsed));
                   
                   // also update memory
                   setAllLogs(prev => prev.map(p => p.id === logId ? { ...p, systemRefinementWorks: parsed[idx].systemRefinementWorks } : p));
               }
           }
       } catch (e) {}
    });
  };

  const getWeekOfMonth = (date: Date) => {
    const startWeekDayIndex = 1; // 1 MonthDay 0 is the last day of the previous month
    const firstDate = new Date(date.getFullYear(), date.getMonth(), 1);
    const firstDay = firstDate.getDay();
    let weekNumber = Math.ceil((date.getDate() + firstDay) / 7);
    return weekNumber;
  };

  const currentMonthName = new Date().toLocaleString('default', { month: 'long' });

  return (
    <div className="flex flex-col gap-8 w-full max-w-4xl mx-auto text-zinc-100 animate-fade-in">
        <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-[32px] p-6 shadow-2xl flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-[28px] text-amber-400">psychology_alt</span> 
                    System Refinement Board
                </h2>
                <p className="text-sm text-zinc-400">Review your system refinements for {currentMonthName}. Check what worked and cross out what didn't.</p>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {refinements.length === 0 ? (
                    <div className="p-6 text-center text-zinc-500 border border-dashed border-white/10 rounded-2xl">
                        No system refinements logged yet. Add some in your Tracker!
                    </div>
                ) : (
                    refinements.map(log => {
                        const conf = getSubjectConfig(log.subject);
                        return (
                            <div key={log.id} className="flex items-center justify-between p-4 bg-black/20 border border-white/5 rounded-2xl hover:bg-white/5 transition-colors group">
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-black/40" style={{ color: conf.color, border: `1px solid ${conf.color}40` }}>
                                            {conf.name}
                                        </span>
                                        <span className="text-xs text-zinc-500 font-medium">From: {log.topic}</span>
                                    </div>
                                    <p className="text-sm font-medium text-white">"{log.systemRefinement}"</p>
                                </div>
                                <div className="flex items-center gap-2 pl-4">
                                    <button 
                                        onClick={() => handleToggleWorks(log.id, log.systemRefinementWorks)}
                                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                                            log.systemRefinementWorks === true 
                                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                : log.systemRefinementWorks === false
                                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                                    : 'bg-black/40 text-zinc-600 border border-white/10 hover:border-white/20 hover:text-zinc-400'
                                        }`}
                                    >
                                        {log.systemRefinementWorks === true ? (
                                            <span className="material-symbols-outlined font-bold">check</span>
                                        ) : log.systemRefinementWorks === false ? (
                                            <span className="material-symbols-outlined font-bold">close</span>
                                        ) : (
                                            <span className="material-symbols-outlined">rule</span>
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
            
            {refinements.length > 0 && (
                <div className="mt-4 p-4 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-100 flex items-start gap-3">
                    <span className="material-symbols-outlined text-sky-400 mt-0.5">info</span>
                    <p className="text-sm leading-relaxed">
                        <strong className="text-sky-300 font-bold block mb-1">Monthly Aggregation Active</strong>
                        Your validated refinements (marked with <span className="material-symbols-outlined text-[14px] align-middle text-emerald-400">check</span>) are building your personal study playbook. Failed refinements are archived to avoid repeating mistakes.
                    </p>
                </div>
            )}
        </div>
    </div>
  );
}

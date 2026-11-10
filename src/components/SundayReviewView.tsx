import React, { useState, useEffect, useMemo } from 'react';
import { LogItem } from '../types';
import { useSubjects } from '../context/SubjectContext';
import { saveStudyLog, saveWeeklyReflection } from '../services/dbService';
import { audioManager } from '../lib/audio';
import { AxIcon } from './AxionIcons';
import { nanoid } from 'nanoid';

interface SundayReviewViewProps {
  loggedSessions: LogItem[];
  setLoggedSessions: React.Dispatch<React.SetStateAction<LogItem[]>>;
}

interface GoalChecklistItem {
  id: string;
  title: string;
  subject: string;
  done: boolean;
}

const DEFAULT_GOAL_DIRECTIVES: GoalChecklistItem[] = [
  { id: 'g-1', title: 'Complete chapter reading & notes', subject: 'bio', done: false },
  { id: 'g-2', title: 'Solve 45+ timed practice questions', subject: 'phys', done: false },
  { id: 'g-3', title: 'Clear due revisions', subject: 'chem', done: false }
];

export default function SundayReviewView({ loggedSessions, setLoggedSessions }: SundayReviewViewProps) {
  const { subjects, getSubjectConfig } = useSubjects();
  const [allLogs, setAllLogs] = useState<LogItem[]>([]);

  const [goalItems, setGoalItems] = useState<GoalChecklistItem[]>(() => {
    try {
      const saved = localStorage.getItem('axion_goal_directives');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_GOAL_DIRECTIVES;
  });
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalSubject, setNewGoalSubject] = useState(() => subjects[0]?.id || 'bio');

  const [whatWentWell, setWhatWentWell] = useState('');
  const [conceptualGaps, setConceptualGaps] = useState('');
  const [isSavingReview, setIsSavingReview] = useState(false);

  useEffect(() => {
    const logMap = new Map<string, LogItem>();
    if (Array.isArray(loggedSessions)) {
      loggedSessions.forEach(log => {
        if (log && log.id) {
          logMap.set(log.id, log);
        }
      });
    }
    setAllLogs(Array.from(logMap.values()));
  }, [loggedSessions]);

  const saveGoalsToLocal = (updated: GoalChecklistItem[]) => {
    setGoalItems(updated);
    try {
      localStorage.setItem('axion_goal_directives', JSON.stringify(updated));
    } catch {}
  };

  const handleAddGoalItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) return;
    const item: GoalChecklistItem = {
      id: nanoid(8),
      title: newGoalTitle.trim(),
      subject: newGoalSubject,
      done: false
    };
    saveGoalsToLocal([...goalItems, item]);
    setNewGoalTitle('');
    audioManager.playSuccess();
  };

  const handleToggleGoalItem = (id: string) => {
    const updated = goalItems.map(g => (g.id === id ? { ...g, done: !g.done } : g));
    saveGoalsToLocal(updated);
    audioManager.playSuccess();
  };

  const handleDeleteGoalItem = (id: string) => {
    saveGoalsToLocal(goalItems.filter(g => g.id !== id));
  };

  const refinements = useMemo(() => {
    return allLogs.filter(log => log.systemRefinement && log.systemRefinement.trim() !== '');
  }, [allLogs]);

  const handleToggleWorks = async (logId: string, currentVal: boolean | undefined) => {
    const targetLog = allLogs.find(l => l.id === logId);
    if (!targetLog) return;

    const updatedWorks = currentVal === undefined ? true : currentVal === true ? false : undefined;
    const updatedLog = { ...targetLog, systemRefinementWorks: updatedWorks };

    setAllLogs(prev => prev.map(p => (p.id === logId ? updatedLog : p)));

    if (setLoggedSessions) {
      setLoggedSessions(prev => prev.map(p => (p.id === logId ? updatedLog : p)));
    }

    try {
      await saveStudyLog(updatedLog);
    } catch {}
  };

  const handleSaveWeeklyReview = async () => {
    if (!whatWentWell.trim() && !conceptualGaps.trim()) {
      audioManager.playError();
      return;
    }

    setIsSavingReview(true);
    try {
      await saveWeeklyReflection({
        whatWentWell: whatWentWell.trim(),
        conceptualGaps: conceptualGaps.trim()
      });

      setWhatWentWell('');
      setConceptualGaps('');
      audioManager.playSuccess();
    } catch {
      audioManager.playError();
    } finally {
      setIsSavingReview(false);
    }
  };

  const completedGoalsCount = goalItems.filter(g => g.done).length;

  return (
    <div className="flex flex-col gap-6 w-full text-slate-100 animate-ios-fade-in">
      {/* Checklist Card (1-word heading) */}
      <div className="axion-surface-l2 p-5 sm:p-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3.5">
          <div className="flex items-center gap-2.5">
            <AxIcon name="goals" className="ax-icon text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">Checklist</h3>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs font-mono font-bold text-emerald-400 tabular-nums">
            {completedGoalsCount} / {goalItems.length}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {goalItems.map(item => {
            const conf = getSubjectConfig(item.subject);
            return (
              <div
                key={item.id}
                onClick={() => handleToggleGoalItem(item.id)}
                className={`glass-inner-well px-4 py-3 rounded-2xl flex items-center justify-between gap-3 cursor-pointer border ${
                  item.done
                    ? 'border-white/[0.04] opacity-60'
                    : 'border-white/[0.08] hover:border-white/[0.16]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                      item.done
                        ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                        : 'border-white/25 bg-black/40'
                    }`}
                  >
                    {item.done && <AxIcon name="tick" className="w-3.5 h-3.5 text-slate-950" />}
                  </div>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0"
                    style={{
                      color: conf.color,
                      backgroundColor: `${conf.color}18`,
                      borderColor: `${conf.color}38`
                    }}
                  >
                    {conf.name}
                  </span>
                  <span
                    className={`text-xs sm:text-sm font-medium truncate ${
                      item.done ? 'line-through text-slate-400' : 'text-white'
                    }`}
                  >
                    {item.title}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    handleDeleteGoalItem(item.id);
                  }}
                  className="text-slate-400 hover:text-rose-400 p-1 cursor-pointer shrink-0"
                  title="Delete"
                >
                  <AxIcon name="delete" className="ax-icon" />
                </button>
              </div>
            );
          })}
        </div>

        <form onSubmit={handleAddGoalItem} className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <select
            value={newGoalSubject}
            onChange={e => setNewGoalSubject(e.target.value)}
            className="ios-glass-input px-3 py-2.5 text-xs text-white font-medium sm:w-40"
          >
            {subjects.map(s => (
              <option key={s.id} value={s.id} className="bg-slate-950">
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newGoalTitle}
            onChange={e => setNewGoalTitle(e.target.value)}
            placeholder="Add target..."
            className="flex-1 ios-glass-input px-3.5 py-2.5 text-xs text-white"
          />
          <button
            type="submit"
            className="ax-tap px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <AxIcon name="plus" className="ax-icon text-slate-950" />
            <span>Add</span>
          </button>
        </form>
      </div>

      {/* 2-Column Split: Reflection + Refinements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="axion-surface-l2 p-5 sm:p-6 flex flex-col gap-5">
          <div className="border-b border-white/[0.06] pb-3 flex items-center gap-2.5">
            <AxIcon name="review" className="ax-icon text-emerald-400" />
            <h3 className="text-sm font-bold tracking-tight text-white">Reflection</h3>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Wins</label>
              <textarea
                value={whatWentWell}
                onChange={e => setWhatWentWell(e.target.value)}
                placeholder="What went well this week?"
                className="ios-glass-input p-3.5 text-xs text-white placeholder:text-slate-500 min-h-[115px] resize-y"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Gaps</label>
              <textarea
                value={conceptualGaps}
                onChange={e => setConceptualGaps(e.target.value)}
                placeholder="What needs attention next week?"
                className="ios-glass-input p-3.5 text-xs text-white placeholder:text-slate-500 min-h-[115px] resize-y"
              />
            </div>

            <button
              onClick={handleSaveWeeklyReview}
              disabled={isSavingReview || (!whatWentWell.trim() && !conceptualGaps.trim())}
              className="ax-tap w-full mt-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl py-3 text-xs disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2 shadow-lg"
            >
              <AxIcon name="tick" className="ax-icon text-slate-950" />
              <span>Save</span>
            </button>
          </div>
        </div>

        <div className="axion-surface-l2 p-5 sm:p-6 flex flex-col gap-5">
          <div className="border-b border-white/[0.06] pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AxIcon name="active" className="ax-icon text-amber-400" />
              <h3 className="text-sm font-bold text-white tracking-tight">Refinements</h3>
            </div>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {refinements.length}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {refinements.length === 0 ? (
              <div className="p-8 text-center text-slate-500 border border-dashed border-white/10 rounded-2xl text-xs">
                No refinements logged.
              </div>
            ) : (
              refinements.map(log => {
                const conf = getSubjectConfig(log.subject);
                return (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3.5 glass-inner-well rounded-2xl hover:border-white/15"
                  >
                    <div className="flex flex-col gap-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{
                            color: conf.color,
                            backgroundColor: `${conf.color}18`,
                            border: `1px solid ${conf.color}38`
                          }}
                        >
                          {conf.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium truncate">
                          {log.topic}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-white break-words">
                        "{log.systemRefinement}"
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleToggleWorks(log.id, log.systemRefinementWorks)}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer border ${
                          log.systemRefinementWorks === true
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/35'
                            : log.systemRefinementWorks === false
                            ? 'bg-rose-500/20 text-rose-400 border-rose-500/35'
                            : 'bg-black/40 text-slate-400 border-white/10 hover:border-white/20 hover:text-white'
                        }`}
                        title="Toggle status"
                      >
                        {log.systemRefinementWorks === true ? (
                          <AxIcon name="tick" className="ax-icon text-emerald-400" />
                        ) : log.systemRefinementWorks === false ? (
                          <AxIcon name="close" className="ax-icon text-rose-400" />
                        ) : (
                          <span className="text-[10px] font-mono">?</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

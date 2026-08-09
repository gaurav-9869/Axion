import React, { useState, useEffect, useMemo } from 'react';
import { LogItem, getSubjectConfig } from '../types';
import { saveStudyLog, saveWeeklyReflection, savePreparationChecklist, getPreparationChecklist, ChecklistItem } from '../services/dbService';
import { nanoid } from 'nanoid';
import { audioManager } from '../lib/audio';

interface SundayReviewViewProps {
  loggedSessions: LogItem[];
  setLoggedSessions: React.Dispatch<React.SetStateAction<LogItem[]>>;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: '1', text: 'Review weak subjects (Physics/Chemistry MCQ errors)', completed: false },
  { id: '2', text: 'Verify that this week\'s system refinements are locked in', completed: false },
  { id: '3', text: 'Update study hours targets in Settings', completed: false },
  { id: '4', text: 'Schedule follow-up practice sessions', completed: false },
];

export default function SundayReviewView({ loggedSessions, setLoggedSessions }: SundayReviewViewProps) {
  const [allLogs, setAllLogs] = useState<LogItem[]>([]);
  
  // Weekly Reflection States
  const [whatWentWell, setWhatWentWell] = useState('');
  const [conceptualGaps, setConceptualGaps] = useState('');
  const [isSavingReview, setIsSavingReview] = useState(false);

  // Active Checklist States
  const [checklist, setChecklist] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST);
  const [newTodoText, setNewTodoText] = useState('');
  const [isChecklistLoaded, setIsChecklistLoaded] = useState(false);

  // Load checklist from Firestore on mount
  useEffect(() => {
    async function fetchChecklist() {
      try {
        const dbChecklist = await getPreparationChecklist();
        if (dbChecklist && dbChecklist.length > 0) {
          setChecklist(dbChecklist);
        }
      } catch (err) {
        console.error("Failed to load checklist:", err);
      } finally {
        setIsChecklistLoaded(true);
      }
    }
    fetchChecklist();
  }, []);

  // Save checklist whenever it changes, but only after it has been loaded
  useEffect(() => {
    if (isChecklistLoaded) {
      savePreparationChecklist(checklist);
    }
  }, [checklist, isChecklistLoaded]);

  useEffect(() => {
    // Load historical logs for refinements with strict deduplication by ID
    const logMap = new Map<string, LogItem>();

    // Load current loggedSessions props (already synced with Firestore)
    if (Array.isArray(loggedSessions)) {
      loggedSessions.forEach(log => {
        if (log && log.id) {
          logMap.set(log.id, log);
        }
      });
    }

    setAllLogs(Array.from(logMap.values()));
  }, [loggedSessions]);

  const refinements = useMemo(() => {
     return allLogs.filter(log => log.systemRefinement && log.systemRefinement.trim() !== '');
  }, [allLogs]);

  const handleToggleWorks = async (logId: string, currentVal: boolean | undefined) => {
    const targetLog = allLogs.find(l => l.id === logId);
    if (!targetLog) return;

    const updatedWorks = currentVal === undefined ? true : currentVal === true ? false : undefined;
    const updatedLog = { ...targetLog, systemRefinementWorks: updatedWorks };

    // Update local state
    setAllLogs(prev => prev.map(p => p.id === logId ? updatedLog : p));

    // Update parent's loggedSessions state
    if (setLoggedSessions) {
      setLoggedSessions(prev => prev.map(p => p.id === logId ? updatedLog : p));
    }

    // Sync directly to Cloud Firestore
    try {
      await saveStudyLog(updatedLog);
    } catch (err) {
      console.error("Failed to sync updated refinement to Firestore:", err);
    }
  };

  const handleAddChecklistItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoText.trim()) return;
    const newItem: ChecklistItem = {
      id: nanoid(),
      text: newTodoText.trim(),
      completed: false
    };
    setChecklist(prev => [...prev, newItem]);
    setNewTodoText('');
    audioManager.playClick();
  };

  const handleToggleChecklistItem = (id: string) => {
    setChecklist(prev => prev.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
    audioManager.playClick();
  };

  const handleDeleteChecklistItem = (id: string) => {
    setChecklist(prev => prev.filter(item => item.id !== id));
    audioManager.playClick();
  };

  const handleSaveWeeklyReview = async () => {
    if (!whatWentWell.trim() && !conceptualGaps.trim()) {
      audioManager.playError();
      return;
    }

    setIsSavingReview(true);
    try {
      // 1. Save weekly reflection to users/{uid}/refinements/ in Firestore
      await saveWeeklyReflection({
        whatWentWell: whatWentWell.trim(),
        conceptualGaps: conceptualGaps.trim()
      });

      // 2. Clear reflections
      setWhatWentWell('');
      setConceptualGaps('');
      
      // 3. Reset preparation checklist state & save to Firestore
      const resetChecklist = DEFAULT_CHECKLIST.map(item => ({ ...item, id: nanoid() }));
      setChecklist(resetChecklist);
      await savePreparationChecklist(resetChecklist);

      audioManager.playSuccess();
    } catch (e) {
      console.error("Failed to archive weekly review:", e);
      audioManager.playError();
    } finally {
      setIsSavingReview(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto text-zinc-100 animate-ios-fade-in">
        
        {/* Header Board - Clean & Minimal */}
        <div className="flex flex-col gap-1">
            <h2 className="text-3xl font-black tracking-tight text-white uppercase">WEEKLY REVIEW</h2>
        </div>

        {/* Unified side-by-side 2-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            
            {/* Column 1: Weekly Reflection & System Refinement Board (Unified Card) */}
            <div className="ios-glass-panel p-6 shadow-2xl flex flex-col gap-6">
                <div className="border-b border-white/5 pb-3">
                    <h3 className="text-base font-bold tracking-tight text-white uppercase">WEEKLY REFLECTION & SYSTEM REFINEMENT</h3>
                </div>

                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-zinc-300">What went well this week?</label>
                        <textarea
                            value={whatWentWell}
                            onChange={(e) => setWhatWentWell(e.target.value)}
                            placeholder="Describe your study wins, high efficiency sessions, or successful focus methods..."
                            className="ios-glass-input p-3.5 text-sm text-white placeholder:text-zinc-500 outline-none min-h-[100px] resize-y"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-zinc-300">What conceptual gaps need fixing next week?</label>
                        <textarea
                            value={conceptualGaps}
                            onChange={(e) => setConceptualGaps(e.target.value)}
                            placeholder="Identify difficult topics, bottlenecks, or areas requiring standard practice/re-review..."
                            className="ios-glass-input p-3.5 text-sm text-white placeholder:text-zinc-500 outline-none min-h-[100px] resize-y"
                        />
                    </div>

                    <button
                        onClick={handleSaveWeeklyReview}
                        disabled={isSavingReview || (!whatWentWell.trim() && !conceptualGaps.trim())}
                        className="w-full mt-2 bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-400 font-bold border border-emerald-500/30 rounded-xl py-3.5 text-xs transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer uppercase tracking-wider"
                    >
                        {isSavingReview ? 'Archiving Summary...' : 'Save Review & Archive Summary'}
                    </button>
                </div>

                {/* Integrated System Refinement List */}
                <div className="mt-4 border-t border-white/5 pt-6 flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[20px]" style={{ color: "var(--theme-primary, #10B981)" }}>psychology_alt</span> 
                        <h4 className="text-sm font-bold text-white uppercase tracking-wider">System Refinement Board</h4>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        {refinements.length === 0 ? (
                            <div className="p-6 text-center text-zinc-500 border border-dashed border-white/10 rounded-2xl text-xs">
                                No system refinements logged yet. Add some in your Tracker!
                            </div>
                        ) : (
                            refinements.map(log => {
                                const conf = getSubjectConfig(log.subject);
                                return (
                                    <div key={log.id} className="flex items-center justify-between p-3.5 ios-glass-card-nested hover:bg-white/5 transition-colors group">
                                        <div className="flex flex-col gap-1.5 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-black/40" style={{ color: conf.color, border: `1px solid ${conf.color}40` }}>
                                                    {conf.name}
                                                </span>
                                                <span className="text-[10px] text-zinc-500 font-medium truncate">From: {log.topic}</span>
                                            </div>
                                            <p className="text-xs font-semibold text-white break-words">"{log.systemRefinement}"</p>
                                        </div>
                                        <div className="flex items-center gap-2 pl-4 shrink-0">
                                            <button 
                                                onClick={() => handleToggleWorks(log.id, log.systemRefinementWorks)}
                                                style={log.systemRefinementWorks === true ? { backgroundColor: "color-mix(in srgb, var(--theme-primary, #10B981) 20%, transparent)", color: "var(--theme-primary, #10B981)", border: "1px solid color-mix(in srgb, var(--theme-primary, #10B981) 30%, transparent)" } : undefined}
                                                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                                                    log.systemRefinementWorks === true 
                                                        ? ''
                                                        : log.systemRefinementWorks === false
                                                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                                            : 'bg-black/40 text-zinc-600 border border-white/10 hover:border-white/20 hover:text-zinc-400'
                                                }`}
                                            >
                                                {log.systemRefinementWorks === true ? (
                                                    <span className="material-symbols-outlined font-bold text-[18px]">check</span>
                                                ) : log.systemRefinementWorks === false ? (
                                                    <span className="material-symbols-outlined font-bold text-[18px]">close</span>
                                                ) : (
                                                    <span className="material-symbols-outlined text-[18px]">rule</span>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                    
                    {refinements.length > 0 && (
                        <div className="p-3.5 rounded-xl bg-sky-500/5 border border-sky-500/10 text-sky-100 flex items-start gap-2.5">
                            <span className="material-symbols-outlined text-sky-400 text-[18px] shrink-0 mt-0.5">info</span>
                            <p className="text-[11px] leading-relaxed">
                                <strong className="text-sky-300 font-semibold block mb-0.5">Study Playbook Integration</strong>
                                Validated tweaks build your playbook; failed ones prevent repeated mistakes.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Column 2: Preparation Checklist Card */}
            <div className="ios-glass-panel p-6 shadow-2xl flex flex-col gap-6">
                <div className="border-b border-white/5 pb-3">
                    <h3 className="text-base font-bold tracking-tight text-white uppercase">PREPARATION CHECKLIST</h3>
                </div>

                <form onSubmit={handleAddChecklistItem} className="flex gap-2">
                    <input
                        type="text"
                        value={newTodoText}
                        onChange={(e) => setNewTodoText(e.target.value)}
                        placeholder="Add preparation objective..."
                        className="flex-1 ios-glass-input px-3.5 py-3 text-xs text-white placeholder:text-zinc-500 outline-none"
                    />
                    <button
                        type="submit"
                        className="bg-primary hover:bg-emerald-600 rounded-xl px-4 text-xs font-bold text-white transition-all cursor-pointer"
                    >
                        Add
                    </button>
                </form>

                <div className="flex flex-col gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
                    {checklist.map(item => (
                        <div
                            key={item.id}
                            className="flex items-center justify-between p-3.5 rounded-xl bg-black/25 border border-white/5 hover:border-white/10 transition-all"
                        >
                            <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0 pr-2 select-none">
                                <input
                                    type="checkbox"
                                    checked={item.completed}
                                    onChange={() => handleToggleChecklistItem(item.id)}
                                    className="accent-emerald-500 cursor-pointer w-4 h-4 shrink-0 rounded"
                                />
                                <span className={`text-xs text-zinc-300 truncate ${item.completed ? 'line-through text-zinc-500' : ''}`}>
                                    {item.text}
                                </span>
                            </label>
                            <button
                                onClick={() => handleDeleteChecklistItem(item.id)}
                                className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                            >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                        </div>
                    ))}
                    {checklist.length === 0 && (
                        <div className="text-center p-6 text-zinc-500 text-xs italic border border-dashed border-white/5 rounded-xl">
                            All preparation goals cleared! Add items to plan.
                        </div>
                    )}
                </div>
            </div>

        </div>
    </div>
  );
}

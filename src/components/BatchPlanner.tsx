import { audioManager } from "../lib/audio";
import React, { useState } from 'react';
import { PlanItem, SubjectKey, SessionMode, UserSettings, getSubjectConfig } from '../types';
import { nanoid } from 'nanoid';

interface BatchPlannerProps {
  morningPlan: PlanItem[];
  setMorningPlan: React.Dispatch<React.SetStateAction<PlanItem[]>>;
  logActivePlanId: string | null;
  selectPlanForLogging: (plan: PlanItem) => void;
  userSettings: UserSettings;
}

export default function BatchPlanner({ morningPlan, setMorningPlan, logActivePlanId, selectPlanForLogging, userSettings }: BatchPlannerProps) {
  const [taskSubject, setTaskSubject] = useState<SubjectKey>(userSettings.activeSubjects[0] || 'bio');
  const [taskTopic, setTaskTopic] = useState('');
  const [taskType, setTaskType] = useState<SessionMode>('Study');
  const [taskTargetMins, setTaskTargetMins] = useState('45');
  const [taskChapter, setTaskChapter] = useState('');
  const [taskMcqCount, setTaskMcqCount] = useState('');

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTopic.trim()) return;

    const newPlan: PlanItem = {
      id: nanoid(),
      timestamp: Date.now(),
      subject: taskSubject,
      topic: taskTopic.trim(),
      sessionType: taskType,
      targetMins: Number(taskTargetMins) || 45,
      status: 'pending',
      chapter: taskChapter.trim() || undefined,
      mcqCount: taskMcqCount ? Number(taskMcqCount) : undefined
    };

    setMorningPlan(prev => [...prev, newPlan]);
    setTaskTopic('');
    setTaskChapter('');
    setTaskMcqCount('');
  };

  const handleRemoveTask = (id: string) => {
    setMorningPlan(prev => prev.filter(p => p.id !== id));
  };


  return (
    <div className="flex flex-col gap-6 w-full text-zinc-100 ">
      
      {/* Target Planning Input Form Deck */}
      <form onSubmit={handleAddTask} className="ios-glass-panel p-6 flex flex-col gap-6">
        <div className="border-b border-white/5 pb-3">
          <h3 className="text-base font-bold tracking-tight text-white uppercase">DAILY PLANNER</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Subject Matrix</label>
            <select 
              value={taskSubject} 
              onChange={e => setTaskSubject(e.target.value as SubjectKey)}
              className="ios-glass-input p-3.5 text-sm border-white/5 outline-none rounded-xl text-white"
            >
              {userSettings.activeSubjects.map(sub => (
                <option key={sub} value={sub} className="bg-zinc-900">{getSubjectConfig(sub).name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Session Task Mode</label>
            <div className="grid grid-cols-3 ios-glass-card-nested p-1 border border-white/5 rounded-xl">
              {(['Study', 'Revise', 'Exercise'] as SessionMode[]).map(m => (
                <button type="button" key={m} onClick={() => setTaskType(m)} className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${taskType === m ? 'bg-primary text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}>{m}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Topic / Objective</label>
          <input 
            type="text" 
            value={taskTopic} 
            onChange={e => setTaskTopic(e.target.value)}
            placeholder="e.g., Circular Motion Derivations..." 
            className="ios-glass-input p-3.5 text-sm rounded-xl border-white/5 outline-none text-white"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Chapter Name/Number (Optional)</label>
            <input 
              type="text" 
              value={taskChapter} 
              onChange={e => setTaskChapter(e.target.value)}
              placeholder="e.g., Chapter 4" 
              className="ios-glass-input p-3.5 text-sm rounded-xl border-white/5 outline-none text-white"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">MCQ Target Count (Optional)</label>
            <input 
              type="number" 
              value={taskMcqCount} 
              onChange={e => setTaskMcqCount(e.target.value)}
              placeholder="e.g., 45" 
              className="ios-glass-input p-3.5 text-sm rounded-xl border-white/5 outline-none text-white"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Target Duration (Minutes)</label>
          <input 
            type="number" 
            value={taskTargetMins} 
            onChange={e => setTaskTargetMins(e.target.value)}
            className="ios-glass-input p-3.5 text-sm rounded-xl border-white/5 outline-none text-white"
          />
        </div>

        <button type="submit" className="w-full py-4 mt-1 bg-primary hover:bg-emerald-600 text-white font-bold text-xs rounded-xl transition-all shadow-md cursor-pointer">
          Append Plan Element
        </button>
      </form>

      {/* Render Queue Stream */}
      <div className="ios-glass-panel p-6 flex flex-col gap-6">
        <div className="border-b border-white/5 pb-3">
          <h3 className="text-base font-bold tracking-tight text-white uppercase">ACTIVE DIRECTIVES QUEUE</h3>
        </div>

        {morningPlan.length === 0 && (
          <p className="text-xs text-zinc-500 italic p-4 text-center font-medium">No objectives registered for the active monitoring frame.</p>
        )}

        <div className="flex flex-col gap-2.5 max-h-[40vh] overflow-y-auto pr-1">
          {morningPlan.map(plan => {
            const config = getSubjectConfig(plan.subject);
            const isLoggedActive = logActivePlanId === plan.id;
            return (
              <div key={plan.id} className="ios-glass-card-nested border-0 p-3.5 rounded-xl flex items-center justify-between gap-3 relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: config.color }} />
                <div className="pl-2 flex flex-col gap-0.5 overflow-hidden">
                  <span className="text-[10px] font-bold uppercase" style={{ color: config.color }}>{config.name} — {plan.sessionType}</span>
                  <p className="text-sm font-semibold text-white truncate max-w-md">
                    {plan.topic}
                    {(plan.chapter || plan.mcqCount !== undefined) && (
                      <span className="text-xs text-zinc-400 font-normal ml-2 block sm:inline">
                        {plan.chapter && `Ch. ${plan.chapter}`} {plan.mcqCount !== undefined && `(${plan.mcqCount} MCQs)`}
                      </span>
                    )}
                  </p>
                  <span className="text-[11px] text-zinc-500 font-medium">{plan.targetMins}m allocated window</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {plan.status === 'completed' ? (
                    <span className="material-symbols-outlined text-primary text-[20px] pr-2">check_circle</span>
                  ) : (
                    <>
                      <button 
                        onClick={() => selectPlanForLogging(plan)}
                        className={`text-xs px-3 py-1.5 font-bold rounded-lg transition-all border cursor-pointer ${isLoggedActive ? 'bg-primary text-white border-primary' : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'}`}
                      >
                        {isLoggedActive ? 'Active' : 'Log'}
                      </button>
                      <button onClick={() => handleRemoveTask(plan.id)} className="text-zinc-600 hover:text-error p-1 transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

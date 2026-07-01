import React from 'react';
import { LogItem, getSubjectConfig } from '../types';

interface ConceptVelocityProps {
  loggedSessions: LogItem[];
}

const HARDCODED_TOPICS = [
  'Cell Cycle', 
  'Kinematics', 
  'Chemical Bonding', 
  'Calculus Fundamentals', 
  'Genetics', 
  'Thermodynamics', 
  'Atomic Structure'
];

export default function ConceptVelocity({ loggedSessions }: ConceptVelocityProps) {
  const masteredTopics = new Set<string>();
  
  // Predetermined map to compile minutes spent per core NEET stream category
  const minutesPerSubject: Record<string, number> = { bio: 0, phys: 0, chem: 0, math: 0 };

  loggedSessions.forEach(log => {
      if (!log) return;
      
      // Tally study minutes
      if (log.subject && log.activeMins && log.subject in minutesPerSubject) {
          minutesPerSubject[log.subject] += log.activeMins;
      }

      const logTopicNormal = String(log.topic || '').toLowerCase().trim();
      HARDCODED_TOPICS.forEach(t => {
          if (t.toLowerCase() === logTopicNormal) {
              masteredTopics.add(t);
          }
      });
  });

  const total = HARDCODED_TOPICS.length;
  const current = masteredTopics.size;
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  // Find subject with highest duration for the actionable insight tip module
  const highestSubjectKey = Object.keys(minutesPerSubject).reduce((a, b) => minutesPerSubject[a] > minutesPerSubject[b] ? a : b);
  const highestSubjectName = getSubjectConfig(highestSubjectKey).name;

  return (
    <section className="w-full flex flex-col gap-6 text-zinc-100">
        {/* Goal #5: Simplified normal terminology headings */}
        <div>
            <h3 className="text-xl font-bold text-white tracking-tight">Syllabus Completion</h3>
            <p className="text-xs text-zinc-400 font-medium mt-0.5">High-Yield Subject Milestones</p>
        </div>
        
        {/* Goal #7 & #8: Frosted layout panel constraints */}
        <div className="bg-black/20 border border-white/5 p-6 rounded-2xl flex flex-col gap-6 w-full">
           <div className="flex justify-between items-end">
               <div>
                  <h4 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">Topics Mastered</h4>
               </div>
               <span className="text-2xl font-black text-white">{current} <span className="text-sm text-zinc-500 font-normal">/ {total}</span></span>
           </div>

           <div className="w-full h-3 bg-black/40 rounded-full overflow-hidden border border-white/5">
                <div 
                    className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-1000 ease-out rounded-full"
                    style={{ width: `${percentage}%` }}
                ></div>
           </div>
           
           <div className="flex gap-2 flex-wrap mt-1">
               {HARDCODED_TOPICS.map(topic => {
                   const isMastered = masteredTopics.has(topic);
                   return (
                       <span key={topic} className={`text-xs px-3 py-1.5 rounded-xl border transition-all font-semibold ${isMastered ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-black/20 border-white/5 text-zinc-500 opacity-60'}`}>
                           {topic}
                       </span>
                   )
               })}
           </div>
        </div>

        {/* Goal #17: Pre-determined structural bar charts modeling study time ratios */}
        <div className="mt-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-4">Time Allocation Distribution</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-black/20 border border-white/5 p-6 rounded-2xl">
                {Object.entries(minutesPerSubject).map(([key, val]) => {
                    const config = getSubjectConfig(key);
                    const maxVal = Math.max(...Object.values(minutesPerSubject), 1);
                    const barWidth = Math.min(100, Math.round((val / maxVal) * 100));

                    return (
                        <div key={key} className="flex flex-col gap-1.5">
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

        {/* Actionable performance analytics tips tray */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex gap-3 items-start mt-2">
            <span className="material-symbols-outlined text-amber-400 text-[20px] shrink-0 mt-0.5">lightbulb</span>
            <p className="text-xs text-zinc-400 leading-relaxed">
                {highestSubjectName && minutesPerSubject[highestSubjectKey] > 0 ? (
                    <>Your current velocity shows strong emphasis in <strong>{highestSubjectName}</strong> this cycle. Keep balancing your core stream tasks to ensure symmetrical performance marks!</>
                ) : (
                    <>Log your completed tasks in the Tracker view above. The analysis node will chart your study distribution velocities dynamically right here.</>
                )}
            </p>
        </div>

    </section>
  );
}

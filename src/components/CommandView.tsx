import React, { useState } from 'react';
import { PlanItem, LogItem, SubjectKey, SessionMode, UserSettings, getFocusScore } from '../types';
import BatchPlanner from './BatchPlanner';
import DailyLedger from './DailyLedger';
import ConceptVelocity from './ConceptVelocity';

interface CommandViewProps {
  morningPlan: PlanItem[];
  setMorningPlan: React.Dispatch<React.SetStateAction<PlanItem[]>>;
  loggedSessions: LogItem[];
  setLoggedSessions: React.Dispatch<React.SetStateAction<LogItem[]>>;
  userSettings: UserSettings;
  setUserSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
}

export default function CommandView({ morningPlan, setMorningPlan, loggedSessions, setLoggedSessions, userSettings, setUserSettings }: CommandViewProps) {
  const [logActivePlanId, setLogActivePlanId] = useState<string | null>(null);
  const [logSubject, setLogSubject] = useState<SubjectKey>(userSettings.activeSubjects[0] || 'bio');
  const [logTopic, setLogTopic] = useState('');
  const [logType, setLogType] = useState<SessionMode>('Study');
  
  const [logActive, setLogActive] = useState('0');
  const [logDistract, setLogDistract] = useState('0');
  const [logRecover, setLogRecover] = useState('0');
  const [logRetention, setLogRetention] = useState('5');
  const [logNotes, setLogNotes] = useState('');
  
  const [logChecking, setLogChecking] = useState('0');
  const [logPractice, setLogPractice] = useState('0');
  const [logErrors, setLogErrors] = useState('0');
  const [systemRefinement, setSystemRefinement] = useState('');

  const [logStartPage, setLogStartPage] = useState('0');
  const [logEndPage, setLogEndPage] = useState('0');
  const [logVsa, setLogVsa] = useState('0');
  const [logSa, setLogSa] = useState('0');
  const [logLa, setLogLa] = useState('0');

  const selectPlanForLogging = (plan: PlanItem) => {
    setLogActivePlanId(plan.id);
    setLogSubject(plan.subject);
    setLogTopic(plan.topic);
    setLogType(plan.sessionType);
    setLogActive(plan.targetMins.toString());
    setLogDistract('0');
    setLogRecover('0');
    setLogRetention('5');
    setLogChecking('0');
    setLogPractice('0');
    setLogErrors('0');
    setSystemRefinement('');
    setLogNotes('');
    setLogStartPage('0');
    setLogEndPage('0');
    setLogVsa('0');
    setLogSa('0');
    setLogLa('0');
  };

  const totalPlanned = morningPlan.length;
  const completedPlanned = morningPlan.filter(p => p.status === 'completed').length;
  const progressPercent = totalPlanned === 0 ? 0 : Math.round((completedPlanned / totalPlanned) * 100);

  const averageFocus = loggedSessions.length === 0 
    ? 0 
    : Math.round(loggedSessions.reduce((acc, log) => acc + getFocusScore(log), 0) / loggedSessions.length);

  const revisionDueCount = morningPlan.filter(p => p.sessionType === 'Revise' && p.status !== 'completed').length;

  return (
    // Goal #20: Fixed staggered animations using generic transition utilities instead of heavy custom classes
    <div className="flex flex-col gap-10 w-full transition-opacity duration-700 ease-in text-zinc-100">
      
      {/* Overview Metric Row */}
      <div className="flex flex-col gap-6 w-full">
         <div>
            {/* Goal #3 & #5: Simplified, clean tracking header */}
            <h2 className="text-3xl font-bold tracking-tight text-white mb-1">
              Welcome back{userSettings.name ? `, ${userSettings.name}` : ''}
            </h2>
            <p className="text-sm text-zinc-400 font-medium">Daily Tracking Overview</p>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
            
            {/* Goal #8: Uniform Glass Panel Opacity (bg-black/40 with backdrop blur and white borders) */}
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-3xl p-6 flex flex-col gap-2 relative overflow-hidden group shadow-xl">
               <div className="flex justify-between items-center text-zinc-400 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Daily Progress</span>
                  <span className="material-symbols-outlined text-[18px] text-emerald-400">trending_up</span>
               </div>
               <div className="text-4xl font-bold text-white tracking-tight">{progressPercent}%</div>
               <div className="w-full bg-black/40 h-2 rounded-full mt-3 overflow-hidden border border-white/5">
                  {/* Dynamic primary color binds to the extracted wallpaper color */}
                  <div className="h-full bg-[var(--theme-primary)] rounded-full transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }}></div>
               </div>
            </div>

            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-3xl p-6 flex flex-col gap-2 relative overflow-hidden group shadow-xl">
               <div className="flex justify-between items-center text-zinc-400 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-400">Revisions Due</span>
                  <span className="material-symbols-outlined text-[18px] text-sky-400">menu_book</span>
               </div>
               <div className="text-4xl font-bold text-white tracking-tight">{revisionDueCount} <span className="text-xl text-zinc-500 font-medium">tasks</span></div>
               <p className="text-xs text-zinc-400 mt-2 font-medium">Pending repetition cycles.</p>
            </div>

            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-3xl p-6 flex flex-col gap-2 relative overflow-hidden group shadow-xl">
               <div className="flex justify-between items-center text-zinc-400 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Focus Score</span>
                  <span className="material-symbols-outlined text-[18px] text-amber-400">radar</span>
               </div>
               <div className="text-4xl font-bold text-white tracking-tight">{averageFocus}%</div>
               <p className="text-xs text-zinc-400 mt-2 font-medium">Activity ratio efficiency.</p>
            </div>
         </div>
      </div>

      {/* Two-Column Form Split Layout with strictly enforced tablet breakpoints (xl:grid-cols-2) to prevent zooming */}
      <div className="w-full grid grid-cols-1 xl:grid-cols-2 gap-10 items-start">
        <BatchPlanner 
          morningPlan={morningPlan} 
          setMorningPlan={setMorningPlan}
          logActivePlanId={logActivePlanId}
          selectPlanForLogging={selectPlanForLogging}
          userSettings={userSettings}
        />
        
        <DailyLedger 
          morningPlan={morningPlan}
          setMorningPlan={setMorningPlan}
          loggedSessions={loggedSessions}
          setLoggedSessions={setLoggedSessions}
          logSubject={logSubject}
          setLogSubject={setLogSubject}
          logTopic={logTopic}
          setLogTopic={setLogTopic}
          logType={logType}
          setLogType={setLogType}
          logActive={logActive}
          setLogActive={setLogActive}
          logDistract={logDistract}
          setLogDistract={setLogDistract}
          logRecover={logRecover}
          setLogRecover={setLogRecover}
          logRetention={logRetention}
          setLogRetention={setLogRetention}
          logChecking={logChecking}
          setLogChecking={setLogChecking}
          logPractice={logPractice}
          setLogPractice={setLogPractice}
          logErrors={logErrors}
          setLogErrors={setLogErrors}
          systemRefinement={systemRefinement}
          setSystemRefinement={setSystemRefinement}
          logNotes={logNotes}
          setLogNotes={setLogNotes}
          logActivePlanId={logActivePlanId}
          setLogActivePlanId={setLogActivePlanId}
          logStartPage={logStartPage}
          setLogStartPage={setLogStartPage}
          logEndPage={logEndPage}
          setLogEndPage={setLogEndPage}
          logVsa={logVsa}
          setLogVsa={setLogVsa}
          logSa={logSa}
          setLogSa={setLogSa}
          logLa={logLa}
          setLogLa={setLogLa}
          userSettings={userSettings}
          setUserSettings={setUserSettings}
        />
      </div>
      
      {/* Chart Placement Tray - Wrapped in uniform frosted glass */}
      <div className="w-full mt-4 bg-black/40 backdrop-blur-md border border-white/10 rounded-[32px] p-6 sm:p-10 shadow-2xl">
        <ConceptVelocity loggedSessions={loggedSessions} />
      </div>

    </div>
  );
}

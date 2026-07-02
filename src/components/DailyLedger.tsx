import React, { useState, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import { SubjectKey, SessionMode, LogItem, PlanItem, UserSettings, getSubjectConfig, getFocusScore, calculateNextReviewDate } from '../types';

interface DailyLedgerProps {
  morningPlan: PlanItem[];
  setMorningPlan?: React.Dispatch<React.SetStateAction<PlanItem[]>>;
  loggedSessions: LogItem[];
  setLoggedSessions: React.Dispatch<React.SetStateAction<LogItem[]>>;
  logSubject: SubjectKey;
  setLogSubject: (s: SubjectKey) => void;
  logTopic: string;
  setLogTopic: (t: string) => void;
  logType: SessionMode;
  setLogType: (s: SessionMode) => void;
  logActive: string;
  setLogActive: (v: string) => void;
  logDistract: string;
  setLogDistract: (v: string) => void;
  logRecover: string;
  setLogRecover: (v: string) => void;
  logRetention: string;
  setLogRetention: (v: string) => void;
  logChecking: string;
  setLogChecking: (v: string) => void;
  logPractice: string;
  setLogPractice: (v: string) => void;
  logErrors: string;
  setLogErrors: (v: string) => void;
  systemRefinement: string;
  setSystemRefinement: (v: string) => void;
  logNotes: string;
  setLogNotes: (v: string) => void;
  logActivePlanId: string | null;
  setLogActivePlanId: (id: string | null) => void;
  logStartPage: string;
  setLogStartPage: (v: string) => void;
  logEndPage: string;
  setLogEndPage: (v: string) => void;
  logVsa: string;
  setLogVsa: (v: string) => void;
  logSa: string;
  setLogSa: (v: string) => void;
  logLa: string;
  setLogLa: (v: string) => void;
  userSettings: UserSettings;
  setUserSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
}

export default function DailyLedger(props: DailyLedgerProps) {
  const [autoFillInput, setAutoFillInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [frictionText, setFrictionText] = useState('');
  const [revisionDepth, setRevisionDepth] = useState('Standard Review');
  const [isAiPopulated, setIsAiPopulated] = useState(false);

  // Scratchpad Controls & Multi-Ink Color States
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [activeInkColor, setActiveInkColor] = useState('#10B981');
  const [canvasDrawingData, setCanvasDrawingData] = useState<string | undefined>(undefined);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  // Canvas initialization and layer mounting engine
  useEffect(() => {
    if (showScratchpad) {
      const initCanvas = () => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = canvas.offsetWidth || 600;
        canvas.height = canvas.offsetHeight || 400;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = isEraserMode ? 24 : 3;
            ctx.strokeStyle = isEraserMode ? '#0a0f18' : activeInkColor;
        }
        
        if (canvasDrawingData) {
            const img = new Image();
            img.onload = () => ctx?.drawImage(img, 0, 0);
            img.src = canvasDrawingData;
        }
      };
      requestAnimationFrame(initCanvas);
    }
  }, [showScratchpad, isEraserMode, activeInkColor]);

  const clearCanvas = () => {
      if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          setCanvasDrawingData(undefined);
      }
  };

  const syncCanvasDataString = () => {
      if (canvasRef.current) {
          setCanvasDrawingData(canvasRef.current.toDataURL());
      }
  };

  const handleSaveLog = () => {
      if (!props.logTopic.trim()) return;

      const newLog: LogItem = {
          id: nanoid(),
          planId: props.logActivePlanId || undefined,
          subject: props.logSubject,
          topic: props.logTopic.trim(),
          sessionType: props.logType,
          revisionType: props.logType === 'Revise' ? revisionDepth : undefined,
          activeMins: Number(props.logActive) || 0,
          distractionMins: Number(props.logDistract) || 0,
          recoveryMins: Number(props.logRecover) || 0,
          checkingMins: (props.logType === 'Study' || props.logType === 'Exercise') && Number(props.logChecking) ? Number(props.logChecking) : undefined,
          practiceMins: props.logType === 'Study' && Number(props.logPractice) ? Number(props.logPractice) : undefined,
          errors: (props.logType === 'Study' || props.logType === 'Exercise') && Number(props.logErrors) !== undefined ? Number(props.logErrors) : undefined,
          retentionScore: props.logType === 'Study' ? (Number(props.logRetention) || 5) : undefined,
          startPage: props.logType !== 'Exercise' && Number(props.logStartPage) ? Number(props.logStartPage) : undefined,
          endPage: props.logType !== 'Exercise' && Number(props.logEndPage) ? Number(props.logEndPage) : undefined,
          vsaCount: (props.logType === 'Exercise' || props.logType === 'Study') && Number(props.logVsa) ? Number(props.logVsa) : undefined,
          saCount: (props.logType === 'Exercise' || props.logType === 'Study') && Number(props.logSa) ? Number(props.logSa) : undefined,
          laCount: (props.logType === 'Exercise' || props.logType === 'Study') && Number(props.logLa) ? Number(props.logLa) : undefined,
          frictionAnalysis: frictionText.trim() || undefined,
          notes: props.logNotes.trim(),
          systemRefinement: props.systemRefinement.trim() || undefined,
          synced: false,
          scratchpadImage: canvasDrawingData
      };

      // Spaced Repetition Scheduling
      newLog.nextReviewDate = calculateNextReviewDate(newLog);

      props.setLoggedSessions(prev => [...prev, newLog]);
      
      if (props.logActivePlanId && props.setMorningPlan) {
          props.setMorningPlan(prev => prev.map(p => p.id === props.logActivePlanId ? { ...p, status: 'completed' } : p));
      }

      props.setLogTopic('');
      props.setLogActivePlanId(null);
      props.setLogActive('0');
      props.setLogDistract('0');
      props.setLogRecover('0');
      props.setLogNotes('');
      setFrictionText('');
      props.setLogStartPage('0');
      props.setLogEndPage('0');
      props.setLogVsa('0');
      props.setLogSa('0');
      props.setLogLa('0');
      props.setLogRetention('5');
      props.setLogChecking('0');
      props.setLogPractice('0');
      props.setLogErrors('0');
      props.setSystemRefinement('');
      setCanvasDrawingData(undefined);
      setIsAiPopulated(false);
  };

  const handleExtractAI = async () => {
      if (!autoFillInput.trim()) return;

      setIsExtracting(true);
      try {
          const res = await fetch(`/api/gemini/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: `Analyze this description: "${autoFillInput}". Extract parameters into raw JSON: { "topic": "string", "subject": "bio"|"phys"|"chem"|"math", "sessionType": "Study"|"Revise"|"Exercise", "activeMins": number, "distractionMins": number, "startPage": number, "endPage": number, "vsaqCount": number, "saqCount": number, "laqCount": number, "retentionScore": number, "frictionPoint": "string" }.` })
          });
          const data = await res.json();
          const textResponse = data.text || '{}';
          const parsed = JSON.parse(textResponse.replace(/```json|```/g, '').trim());
          
          if (parsed.topic) props.setLogTopic(parsed.topic);
          if (parsed.subject) props.setLogSubject(parsed.subject);
          if (parsed.sessionType) props.setLogType(parsed.sessionType);
          if (parsed.activeMins) props.setLogActive(String(parsed.activeMins));
          if (parsed.distractionMins) props.setLogDistract(String(parsed.distractionMins));
          if (parsed.startPage) props.setLogStartPage(String(parsed.startPage));
          if (parsed.endPage) props.setLogEndPage(String(parsed.endPage));
          if (parsed.vsaqCount) props.setLogVsa(String(parsed.vsaqCount));
          if (parsed.saqCount) props.setLogSa(String(parsed.saqCount));
          if (parsed.laqCount) props.setLogLa(String(parsed.laqCount));
          if (parsed.retentionScore) props.setLogRetention(String(parsed.retentionScore));
          if (parsed.frictionPoint) setFrictionText(parsed.frictionPoint);
          
          setIsAiPopulated(true);
          setAutoFillInput('');
      } catch(e) {
          alert("Could not extract details. Please write clearly.");
      } finally {
          setIsExtracting(false);
      }
  };

  return (
    <section className="flex flex-col gap-6 w-full text-zinc-100">
        <div className="ios-glass-panel p-6 flex flex-col gap-6">
           


           <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
               <div className="flex flex-col gap-2">
                   <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Subject</label>
                   <select value={props.logSubject} onChange={e => props.setLogSubject(e.target.value as SubjectKey)} className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-sm outline-none text-white">
                       {props.userSettings.activeSubjects.map(sub => (
                           <option key={sub} value={sub} className="bg-zinc-900">{getSubjectConfig(sub).name}</option>
                       ))}
                   </select>
               </div>
               <div className="flex flex-col gap-2">
                   <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Type</label>
                   <div className="grid grid-cols-3 bg-black/40 border border-white/10 rounded-xl p-1.5">
                       {(['Study', 'Revise', 'Exercise'] as SessionMode[]).map(m => (
                           <button key={m} onClick={() => props.logType !== m && props.setLogType(m)} className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${props.logType === m ? 'bg-white/10 text-white shadow-inner' : 'text-zinc-400 hover:text-white'}`}>{m}</button>
                       ))}
                   </div>
               </div>
           </div>

           <div className="flex flex-col gap-2">
               <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Topic / Chapter</label>
               <input type="text" value={props.logTopic} onChange={e => props.setLogTopic(e.target.value)} placeholder="Topic details..." className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-sm outline-none" />
           </div>

           {props.logType === 'Revise' && (
               <div className="flex flex-col gap-2">
                   <label className="text-xs font-bold tracking-wider uppercase text-zinc-400">Revision Style</label>
                   <div className="grid grid-cols-3 bg-black/40 border border-white/10 rounded-xl p-1.5">
                       {['Quick Recap', 'Standard Review', 'Deep Dive'].map(depth => (
                           <button key={depth} onClick={() => setRevisionDepth(depth)} className={`py-2 text-xs rounded-lg transition-all cursor-pointer ${revisionDepth === depth ? 'bg-white/10 text-white font-bold' : 'text-zinc-400 hover:text-white'}`}>{depth}</button>
                       ))}
                   </div>
               </div>
           )}

           {props.logType !== 'Exercise' && (
               <div className="grid grid-cols-2 gap-5">
                   <div className="flex flex-col gap-2">
                       <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Start Page</label>
                       <input type="number" value={props.logStartPage} onChange={e => props.setLogStartPage(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-sm outline-none" />
                   </div>
                   <div className="flex flex-col gap-2">
                       <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">End Page</label>
                       <input type="number" value={props.logEndPage} onChange={e => props.setLogEndPage(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-sm outline-none" />
                   </div>
               </div>
           )}

           {(props.logType === 'Exercise' || props.logType === 'Study') && (
               <div className="grid grid-cols-3 gap-3">
                   <div className="flex flex-col gap-2">
                       <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Short Qs</label>
                       <input type="number" value={props.logVsa} onChange={e => props.setLogVsa(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-sm outline-none text-center" />
                   </div>
                   <div className="flex flex-col gap-2">
                       <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Medium Qs</label>
                       <input type="number" value={props.logSa} onChange={e => props.setLogSa(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-sm outline-none text-center" />
                   </div>
                   <div className="flex flex-col gap-2">
                       <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Long Qs</label>
                       <input type="number" value={props.logLa} onChange={e => props.setLogLa(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-sm outline-none text-center" />
                   </div>
               </div>
           )}

           <div className="grid grid-cols-3 gap-4 bg-black/20 p-3 rounded-2xl border border-white/5">
               <div className="flex flex-col gap-1">
                   <label className="text-[10px] uppercase text-zinc-400 font-bold text-center">Study Mins</label>
                   <input type="number" value={props.logActive} onChange={e => props.setLogActive(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-sm text-center font-bold text-emerald-400 outline-none" />
               </div>
               <div className="flex flex-col gap-1">
                   <label className="text-[10px] uppercase text-zinc-400 font-bold text-center">Distracted</label>
                   <input type="number" value={props.logDistract} onChange={e => props.setLogDistract(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-sm text-center font-bold text-rose-400 outline-none" />
               </div>
               <div className="flex flex-col gap-1">
                   <label className="text-[10px] uppercase text-zinc-400 font-bold text-center">Break Mins</label>
                   <input type="number" value={props.logRecover} onChange={e => props.setLogRecover(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-sm text-center font-bold text-sky-400 outline-none" />
               </div>
           </div>

           {(props.logType === 'Study' || props.logType === 'Exercise') && (
               <div className="grid grid-cols-3 gap-4 bg-black/20 p-3 rounded-2xl border border-white/5">
                   <div className="flex flex-col gap-1">
                       <label className="text-[10px] uppercase text-zinc-400 font-bold text-center" title="Time spent checking answers">Checking Mins</label>
                       <input type="number" value={props.logChecking} onChange={e => props.setLogChecking(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-sm text-center font-bold text-emerald-400 outline-none" />
                   </div>
                   {props.logType === 'Study' ? (
                       <div className="flex flex-col gap-1">
                           <label className="text-[10px] uppercase text-zinc-400 font-bold text-center" title="Time spent practicing questions">Practice Mins</label>
                           <input type="number" value={props.logPractice} onChange={e => props.setLogPractice(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-sm text-center font-bold text-emerald-400 outline-none" />
                       </div>
                   ) : <div/>}
                   <div className="flex flex-col gap-1">
                       <label className="text-[10px] uppercase text-zinc-400 font-bold text-center" title="Number of incorrect answers">Errors</label>
                       <input type="number" value={props.logErrors} onChange={e => props.setLogErrors(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-sm text-center font-bold text-rose-400 outline-none" />
                   </div>
               </div>
           )}

           {props.logType === 'Study' && (
             <div className="flex flex-col gap-2">
                 <div className="flex justify-between items-center">
                     <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Retention Score</label>
                     <span className="text-xs font-mono font-bold bg-black/40 border border-white/10 px-2.5 py-1 rounded text-amber-400">{props.logRetention} / 10</span>
                 </div>
                 {isAiPopulated && (
                     <div className="w-full p-3 bg-black/30 border border-white/5 rounded-xl text-[12px] text-zinc-400">
                         Auto-filled by AI extraction loop. Drag the slider to override.
                     </div>
                 )}
                 <input
                     type="range" min="1" max="10" step="1" value={props.logRetention}
                     onChange={e => { props.setLogRetention(e.target.value); setIsAiPopulated(false); }}
                     className="w-full accent-amber-400 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer mt-1"
                 />
             </div>
           )}

           <div className="flex flex-col gap-0 mt-2">
               <div className="flex items-center justify-between bg-zinc-900/60 p-4 rounded-t-2xl border border-white/10 border-b-0">
                   <label className="text-xs text-zinc-400 font-bold tracking-wider uppercase flex items-center gap-2">
                       <span className="material-symbols-outlined text-[16px]">warning</span> Friction Analysis <span className="text-zinc-600 font-normal normal-case tracking-normal">(optional)</span>
                   </label>
                   <button type="button" onClick={() => setShowScratchpad(true)} className="flex items-center gap-1.5 text-[10px] bg-white/5 text-zinc-300 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors font-bold cursor-pointer border border-white/10">
                       <span className="material-symbols-outlined text-[14px]">draw</span> Open Scratchpad
                   </button>
               </div>
               <textarea rows={2} value={frictionText} onChange={e => setFrictionText(e.target.value)} placeholder="What concepts or hurdles cost you time? (Optional)..." className="w-full bg-black/40 border border-white/10 rounded-b-2xl p-4 text-sm outline-none text-white focus:border-white/20 transition-colors resize-none" />
           </div>

           <div className="flex flex-col gap-2">
               <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">System Refinements</label>
               <textarea rows={2} value={props.systemRefinement} onChange={e => props.setSystemRefinement(e.target.value)} placeholder="Experimental changes to your study system..." className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm outline-none resize-none text-amber-100" />
           </div>

           <div className="flex flex-col gap-2">
               <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Study Notes</label>
               <textarea rows={2} value={props.logNotes} onChange={e => props.setLogNotes(e.target.value)} placeholder="Additional session notes..." className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm outline-none resize-none" />
           </div>

           <button 
               onClick={handleSaveLog} 
               className="w-full py-4 mt-2 rounded-xl text-white font-bold text-sm tracking-wide shadow-xl transition-all active:scale-[0.99] cursor-pointer"
               style={{ backgroundColor: 'var(--theme-primary, #10B981)' }}
           >
               Save Session Log
           </button>
        </div>

        {/* Scratchpad Overlay Canvas Frame */}
        {showScratchpad && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md transition-opacity">
                <div className="bg-[#0b0f19] border border-white/10 w-full max-w-4xl h-[75vh] flex flex-col overflow-hidden relative rounded-[32px] shadow-2xl">
                    
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-5 border-b border-white/10 bg-black/20">
                        <div className="flex items-center gap-2.5 text-zinc-300 font-bold text-sm uppercase tracking-wider">
                            <span className="material-symbols-outlined text-primary">draw</span>
                            <span>Sketch Pad</span>
                        </div>

                        <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-2xl border border-white/5">
                            <span className="material-symbols-outlined text-zinc-500 text-xs">palette</span>
                            {[
                                { color: '#10B981', label: 'Emerald' },
                                { color: '#EC4899', label: 'Bio Pink' },
                                { color: '#3B82F6', label: 'Phys Blue' },
                                { color: '#F59E0B', label: 'Amber' },
                                { color: '#EF4444', label: 'Crimson' }
                            ].map((cfg) => (
                                <button
                                    key={cfg.color}
                                    type="button"
                                    onClick={() => {
                                        setIsEraserMode(false);
                                        setActiveInkColor(cfg.color);
                                    }}
                                    className="w-5 h-5 rounded-full border border-white/20 transition-transform active:scale-95 cursor-pointer"
                                    style={{
                                        backgroundColor: cfg.color,
                                        transform: activeInkColor === cfg.color && !isEraserMode ? 'scale(1.2)' : 'scale(1)'
                                    }}
                                    title={cfg.label}
                                />
                            ))}
                        </div>

                        <div className="flex items-center gap-2.5">
                            <button
                               type="button"
                               onClick={() => setIsEraserMode(!isEraserMode)}
                               className={`p-2.5 rounded-xl border transition-all flex items-center justify-center cursor-pointer ${isEraserMode ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'}`}
                               title={isEraserMode ? "Switch to Drawing Pen" : "Switch to Eraser"}
                            >
                                <span className="material-symbols-outlined text-[20px]">
                                    {isEraserMode ? 'edit' : 'ink_eraser'}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={clearCanvas}
                                className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer"
                                title="Clear Canvas"
                            >
                                <span className="material-symbols-outlined text-[20px]">delete_forever</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => { syncCanvasDataString(); setShowScratchpad(false); }}
                                className="bg-white text-black p-2.5 px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-md"
                            >
                                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                <span>Save</span>
                            </button>
                        </div>
                    </div>

                    {/* Touch event blocks fix gesture distortion on your Xiaomi tablet */}
                    <canvas
                        ref={canvasRef}
                        onTouchStart={(e) => {
                            if (!canvasRef.current) return;
                            e.preventDefault();
                            isDrawing.current = true;
                            const rect = canvasRef.current.getBoundingClientRect();
                            const touch = e.touches[0];
                            const ctx = canvasRef.current.getContext('2d');
                            if (ctx) {
                                ctx.beginPath();
                                ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
                            }
                        }}
                        onTouchMove={(e) => {
                            if (!isDrawing.current || !canvasRef.current) return;
                            e.preventDefault();
                            const rect = canvasRef.current.getBoundingClientRect();
                            const touch = e.touches[0];
                            const ctx = canvasRef.current.getContext('2d');
                            if (ctx) {
                                ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
                                ctx.stroke();
                            }
                        }}
                        onTouchEnd={() => { isDrawing.current = false; syncCanvasDataString(); }}
                        onPointerDown={(e) => {
                            if (!canvasRef.current) return;
                            isDrawing.current = true;
                            const rect = canvasRef.current.getBoundingClientRect();
                            const ctx = canvasRef.current.getContext('2d');
                            if (ctx) {
                                ctx.beginPath();
                                ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
                            }
                        }}
                        onPointerMove={(e) => {
                            if (!isDrawing.current || !canvasRef.current) return;
                            const rect = canvasRef.current.getBoundingClientRect();
                            const ctx = canvasRef.current.getContext('2d');
                            if (ctx) {
                                ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
                                ctx.stroke();
                            }
                        }}
                        onPointerUp={() => { isDrawing.current = false; syncCanvasDataString(); }}
                        onPointerLeave={() => { isDrawing.current = false; }}
                        className="flex-1 w-full bg-black cursor-crosshair touch-none"
                    />
                </div>
            </div>
        )}
    </section>
  );
}

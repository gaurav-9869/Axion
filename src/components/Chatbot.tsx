import React, { useState, useRef, useEffect } from 'react';
import { PlanItem, LogItem, calculateNextReviewDate, getLocalDateString } from '../types';
import { nanoid } from 'nanoid';
import { generateWithGemini } from '../lib/gemini';
import { sound } from '../utils/sound';
import { saveChatMessage, getChatHistory, saveDailyPlan, saveStudyLog, showToast } from '../services/dbService';
import { db, auth, collection, getDocs, query, orderBy, limit } from '../firebase';

interface ChatbotProps {
  morningPlan: PlanItem[];
  setMorningPlan: React.Dispatch<React.SetStateAction<PlanItem[]>>;
  loggedSessions: LogItem[];
  setLoggedSessions: React.Dispatch<React.SetStateAction<LogItem[]>>;
}

interface Message {
  id?: string;
  sender: 'user' | 'assistant';
  text: string;
}

// Timeout wrapper helper
function withTimeout<T>(promise: Promise<T>, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout of 3 seconds exceeded"));
    }, ms);
    promise.then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

export default function Chatbot({ morningPlan, setMorningPlan, loggedSessions, setLoggedSessions }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { sender: 'assistant', text: "Hi! I'm your Axion Study Companion. I can help manage your study plans, summarize your daily progress, analyze focus efficiency, or suggest revision tasks." }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history from Firestore / LocalStorage with a 3-second timeout fallback
  useEffect(() => {
    async function loadHistory() {
      try {
        const history = await withTimeout(getChatHistory(30), 3000);
        if (history && history.length > 0) {
          setMessages(history.map(h => ({
            id: h.id,
            sender: h.role === 'user' ? 'user' : 'assistant',
            text: h.content
          })));
        }
      } catch (err) {
        console.warn("Firestore chat logs exceeded timeout or failed, falling back to LocalStorage:", err);
        // Fallback to local storage query
        const localStr = localStorage.getItem('axion_chat_history');
        try {
          const localParsed = localStr ? JSON.parse(localStr) : [];
          if (Array.isArray(localParsed) && localParsed.length > 0) {
            setMessages(localParsed.map((h: any) => ({
              id: h.id,
              sender: h.role === 'user' ? 'user' : 'assistant',
              text: h.content
            })));
          }
        } catch {}
      }
    }
    loadHistory();
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleInputResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  const handleSendMessage = async (customText?: string) => {
    const userText = (customText || input).trim();
    if (!userText || isLoading) return;

    sound.playSwoosh();
    setMessages(prev => [...prev, { sender: 'user', text: userText }]);
    if (!customText) setInput('');
    setIsLoading(true);

    try {
      await saveChatMessage('user', userText);
    } catch (err) {
      console.warn("Failed to persist user chat message:", err);
    }

    const lowerUser = userText.toLowerCase();

    // ── NLP OVERRIDE COMMAND 1: Add plan study task ───────────────────────
    // Matches: 'add biology study task "Genetics" for 45 mins'
    // Now supports both quoted/unquoted topics, optional task/session keywords, and min/mins/minutes units.
    const matchAdd = userText.match(/add\s+(biology|chemistry|physics|maths|math|bio|chem|phys)\s+(?:study|revise|exercise)?\s*(?:task|session)?\s*["']?([^"'\n]+?)["']?\s+for\s+(\d+)\s*(?:mins|min|minutes)/i);
    if (matchAdd) {
      try {
        const subjectRaw = matchAdd[1].toLowerCase();
        const subject = subjectRaw.startsWith('bio') ? 'bio' : subjectRaw.startsWith('chem') ? 'chem' : subjectRaw.startsWith('phys') ? 'phys' : 'math';
        const topic = matchAdd[2].trim();
        const mins = parseInt(matchAdd[3], 10);
        const todayStr = getLocalDateString(0);

        const newPlanItem: PlanItem = {
          id: nanoid(),
          timestamp: Date.now(),
          subject,
          topic,
          sessionType: 'Study',
          targetMins: mins,
          targetUnits: 1,
          status: 'pending'
        };

        const updatedPlans = [...morningPlan, newPlanItem];
        setMorningPlan(updatedPlans);
        await saveDailyPlan(todayStr, updatedPlans);
        
        sound.playChime();
        showToast(`Successfully added study task for ${subject.toUpperCase()}!`, "success");

        const responseText = `✅ **Plan Task Added Successfully**!\n\nI have scheduled **"${topic}"** (${subject.toUpperCase()}, ${mins} mins) into your study plan for today. You can monitor it on your dashboard.`;
        setMessages(prev => [...prev, { sender: 'assistant', text: responseText }]);
        await saveChatMessage('model', responseText);
      } catch (err: any) {
        showToast(`Add Task Failed: ${err.message || err}`, "error");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // ── NLP OVERRIDE COMMAND 2: Log session task ──────────────────────────
    // Matches: 'log chemistry revise task "Thermodynamics" for 30 mins'
    // Now supports both quoted/unquoted topics, optional task/session keywords, and min/mins/minutes units.
    const matchLog = userText.match(/log\s+(biology|chemistry|physics|maths|math|bio|chem|phys)\s+(study|revise|exercise)\s*(?:task|session)?\s*["']?([^"'\n]+?)["']?\s+for\s+(\d+)\s*(?:mins|min|minutes)/i);
    if (matchLog) {
      try {
        const subjectRaw = matchLog[1].toLowerCase();
        const subject = subjectRaw.startsWith('bio') ? 'bio' : subjectRaw.startsWith('chem') ? 'chem' : subjectRaw.startsWith('phys') ? 'phys' : 'math';
        const typeRaw = matchLog[2].toLowerCase();
        const sessionType = typeRaw.startsWith('study') ? 'Study' : typeRaw.startsWith('revise') ? 'Revise' : 'Exercise';
        const topic = matchLog[3].trim();
        const mins = parseInt(matchLog[4], 10);

        const newLog: LogItem = {
          id: nanoid(),
          timestamp: Date.now(),
          subject,
          topic,
          sessionType,
          activeMins: mins,
          distractionMins: 0,
          recoveryMins: 0,
          notes: 'Logged via Study Companion NLP command Override.',
          synced: false
        };
        newLog.nextReviewDate = calculateNextReviewDate(newLog);

        setLoggedSessions(prev => [...prev, newLog]);
        await saveStudyLog(newLog);

        sound.playChime();
        showToast(`Successfully logged session for ${subject.toUpperCase()}!`, "success");

        const responseText = `📝 **Study Session Logged**!\n\nI have successfully recorded your **${sessionType}** session on **"${topic}"** (${subject.toUpperCase()}) for **${mins} mins** directly into your study archive. Great job staying focused!`;
        setMessages(prev => [...prev, { sender: 'assistant', text: responseText }]);
        await saveChatMessage('model', responseText);
      } catch (err: any) {
        showToast(`Log Session Failed: ${err.message || err}`, "error");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // ── Quick Action 1: Summarize Today ──────────────────────────────────
    if (lowerUser.includes("summarize today") || lowerUser.includes("summarize today's progress")) {
      const todayStr = getLocalDateString(0);
      const totalMins = loggedSessions.reduce((acc, s) => acc + (s.activeMins || 0), 0);
      const totalDistraction = loggedSessions.reduce((acc, s) => acc + (s.distractionMins || 0), 0);
      const completedPlans = morningPlan.filter(p => p.status === 'completed').length;
      const pendingPlans = morningPlan.filter(p => p.status === 'pending').length;

      const subBreakdown: Record<string, number> = {};
      loggedSessions.forEach(s => {
        if (s.subject && s.activeMins) {
          subBreakdown[s.subject] = (subBreakdown[s.subject] || 0) + s.activeMins;
        }
      });

      let summaryText = `📊 **Today's Progress Summary (${todayStr})**:\n\n`;
      summaryText += `• **Active Study Time**: ${totalMins} minutes across ${loggedSessions.length} session(s).\n`;
      summaryText += `• **Distraction Time**: ${totalDistraction} minutes.\n`;
      summaryText += `• **Planned Tasks**: ${completedPlans} completed / ${pendingPlans} pending.\n\n`;
      
      if (Object.keys(subBreakdown).length > 0) {
        summaryText += `**Subject Breakdown**:\n`;
        Object.entries(subBreakdown).forEach(([sub, mins]) => {
          summaryText += `- ${sub.toUpperCase()}: ${mins} mins\n`;
        });
      } else {
        summaryText += `No active study sessions logged yet today. Use the Tracker view to start a session!`;
      }

      setTimeout(() => {
        (async () => {
          try {
            setMessages(prev => [...prev, { sender: 'assistant', text: summaryText }]);
            await saveChatMessage('model', summaryText);
            sound.playChime();
          } catch (err) {
            console.warn("Error saving summary chat message:", err);
          } finally {
            setIsLoading(false);
          }
        })();
      }, 400);
      return;
    }

    // ── Quick Action 2: Create Revision Task ─────────────────────────────
    if (lowerUser.includes("revise bio") || lowerUser.includes("revision task for biology") || lowerUser.includes("add biology plan")) {
      const todayStr = getLocalDateString(0);
      const newPlanItem: PlanItem = {
        id: nanoid(),
        timestamp: Date.now(),
        subject: 'bio',
        topic: 'Biology Core Concepts Revision',
        sessionType: 'Revise',
        targetMins: 30,
        targetUnits: 1,
        status: 'pending'
      };

      const updatedPlans = [...morningPlan, newPlanItem];
      setMorningPlan(updatedPlans);
      await saveDailyPlan(todayStr, updatedPlans);
      sound.playChime();

      const responseText = `✅ **Added Revision Task**!\n\nI've added **Biology Core Concepts Revision** (30 mins, Revise session) to your morning plan for today. You can track or modify it in the Tracker view.`;

      setTimeout(() => {
        (async () => {
          try {
            setMessages(prev => [...prev, { sender: 'assistant', text: responseText }]);
            await saveChatMessage('model', responseText);
          } catch (err) {
            console.warn("Error saving revision chat message:", err);
          } finally {
            setIsLoading(false);
          }
        })();
      }, 400);
      return;
    }

    // ── Quick Action 3: Focus Advice ────────────────────────────────────
    if (lowerUser.includes("focus advice") || lowerUser.includes("subject needs the most attention") || lowerUser.includes("attention")) {
      const subMins: Record<string, number> = { bio: 0, phys: 0, chem: 0, math: 0 };
      loggedSessions.forEach(s => {
        if (s.subject && s.activeMins) {
          subMins[s.subject] = (subMins[s.subject] || 0) + s.activeMins;
        }
      });

      const sortedSubs = Object.entries(subMins).sort((a, b) => a[1] - b[1]);
      const lowestSub = sortedSubs[0];

      let adviceText = `🎯 **Focus & Subject Priority Advice**:\n\n`;
      if (lowestSub) {
        adviceText += `• **Priority Subject**: **${lowestSub[0].toUpperCase()}** has the lowest logged study time (${lowestSub[1]} mins).\n`;
        adviceText += `• **Recommendation**: Allocate a 40-minute focused study block for ${lowestSub[0].toUpperCase()} today to maintain balanced syllabus coverage.\n`;
      } else {
        adviceText += `• Start by scheduling 30-45 minute blocks for Physics & Chemistry today, followed by a 20-minute practice exercise.\n`;
      }
      adviceText += `• Remember to log distractions during sessions to accurately track your efficiency scores in the Analysis tab!`;

      setTimeout(() => {
        (async () => {
          try {
            setMessages(prev => [...prev, { sender: 'assistant', text: adviceText }]);
            await saveChatMessage('model', adviceText);
            sound.playChime();
          } catch (err) {
            console.warn("Error saving advice chat message:", err);
          } finally {
            setIsLoading(false);
          }
        })();
      }, 400);
      return;
    }

    // ── Standard AI Request with Gemini + Fallback ───────────────────────
    try {
      const safePlanText = JSON.stringify(morningPlan || []).replace(/[\/\\]/g, '');
      const safeLogText = JSON.stringify((loggedSessions || []).slice(-10)).replace(/[\/\\]/g, '');
      const safeUserText = userText.replace(/["'\\]/g, ' ').replace(/[\r\n]/g, ' ');

      const recentContext = messages.slice(-6).map(m => `${m.sender.toUpperCase()}: ${m.text}`).join('\n');

      const operationalPrompt = `You are a supportive, direct study assistant for Axion Workspace Hub.
Current items:
Morning Plans: ${safePlanText}
Recent Logs: ${safeLogText}

Recent conversation context:
${recentContext}

If user requests updates, append standard commands:
To add a plan: :::{"command": "add_plan", "subject": "bio"|"phys"|"chem"|"math", "topic": "string", "mins": number, "units": number}:::
To update a log: :::{"command": "add_log", "subject": "bio"|"phys"|"chem"|"math", "topic": "string", "sessionType": "Study"|"Revise"|"Exercise", "activeMins": number, "distractionMins": number, "checkingMins": number, "practiceMins": number, "errors": number, "startPage": number, "endPage": number}:::

User input message: "${safeUserText}"`;

      let assistantText = '';
      try {
        assistantText = await generateWithGemini(operationalPrompt);
      } catch (geminiError: any) {
        console.warn("Gemini unavailable, generating local intelligent response:", geminiError);

        if (lowerUser.includes("plan") || lowerUser.includes("add") || lowerUser.includes("study")) {
          const todayStr = getLocalDateString(0);
          const newPlan: PlanItem = {
            id: nanoid(),
            timestamp: Date.now(),
            subject: lowerUser.includes("phys") ? 'phys' : lowerUser.includes("chem") ? 'chem' : lowerUser.includes("math") ? 'math' : 'bio',
            topic: userText.length < 40 ? userText : 'Custom Study Task',
            sessionType: 'Study',
            targetMins: 45,
            targetUnits: 1,
            status: 'pending'
          };
          const updated = [...morningPlan, newPlan];
          setMorningPlan(updated);
          await saveDailyPlan(todayStr, updated);
          sound.playChime();
          assistantText = `I've added "${newPlan.topic}" (${newPlan.subject.toUpperCase()}, 45 mins) to your daily study plan.`;
        } else {
          assistantText = `I'm here to support your study session! You currently have ${morningPlan.length} task(s) in today's plan and ${loggedSessions.length} logged session(s). Let me know if you want to add a new study task or review your syllabus pace!`;
        }
      }

      // Check if command is embedded in assistant text
      const jsonRegex = /:::(.*?):::/s;
      const match = assistantText.match(jsonRegex);

      if (match && match[1]) {
        try {
          const commandData = JSON.parse(match[1].trim());

          if (commandData.command === 'add_plan') {
            const todayStr = getLocalDateString(0);
            const rawSub = (commandData.subject || 'bio').toLowerCase();
            const normalizedSub = rawSub.startsWith('bio') ? 'bio' : rawSub.startsWith('chem') ? 'chem' : rawSub.startsWith('phys') ? 'phys' : 'math';
            const newPlan: PlanItem = {
              id: nanoid(),
              timestamp: Date.now(),
              subject: normalizedSub,
              topic: commandData.topic || 'Untitled Entry',
              sessionType: 'Study',
              targetUnits: commandData.units || 0,
              targetMins: commandData.mins || 30,
              status: 'pending'
            };
            const updated = [...morningPlan, newPlan];
            setMorningPlan(updated);
            await saveDailyPlan(todayStr, updated);
            sound.playChime();
          }

          if (commandData.command === 'add_log') {
            const sessionType = commandData.sessionType || 'Study';
            const rawSub = (commandData.subject || 'bio').toLowerCase();
            const normalizedSub = rawSub.startsWith('bio') ? 'bio' : rawSub.startsWith('chem') ? 'chem' : rawSub.startsWith('phys') ? 'phys' : 'math';
            const newLog: LogItem = {
              id: nanoid(),
              timestamp: Date.now(),
              subject: normalizedSub,
              topic: commandData.topic || 'Untitled Session',
              sessionType: sessionType,
              activeMins: commandData.activeMins || 0,
              distractionMins: commandData.distractionMins || 0,
              recoveryMins: 0,
              checkingMins: commandData.checkingMins || undefined,
              practiceMins: commandData.practiceMins || undefined,
              errors: commandData.errors !== undefined ? commandData.errors : undefined,
              retentionScore: sessionType === 'Study' ? (commandData.retentionScore || 5) : undefined,
              startPage: commandData.startPage || undefined,
              endPage: commandData.endPage || undefined,
              notes: commandData.notes || '',
              frictionAnalysis: commandData.frictionPoint || undefined,
              synced: false
            };
            newLog.nextReviewDate = calculateNextReviewDate(newLog);
            setLoggedSessions(prev => [...prev, newLog]);
            await saveStudyLog(newLog);
            sound.playChime();
          }

          assistantText = assistantText.replace(jsonRegex, '').trim();
        } catch (jsonErr) {
          console.error("JSON command bypass handled", jsonErr);
        }
      }

      setMessages(prev => [...prev, { sender: 'assistant', text: assistantText }]);
      await saveChatMessage('model', assistantText);
    } catch (err: any) {
      console.warn("Chatbot Error:", err);
      const text = `I'm here to help with your study plan. You can ask me to summarize your progress, create study tasks, or give focus advice!`;
      setMessages(prev => [...prev, { sender: 'assistant', text }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Chat Trigger Button */}
      <button 
        onClick={() => { sound.playClick(); setIsOpen(!isOpen); }}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer z-50 border border-white/20"
        style={{ backgroundColor: 'var(--theme-primary, #10B981)' }}
        title="Toggle AI Assistant"
      >
        <span className="material-symbols-outlined text-[24px]">{isOpen ? 'close' : 'smart_toy'}</span>
      </button>

      {/* Slide-out Glass Chat Drawer Panel */}
      <div 
        className={`fixed bottom-24 right-6 w-[calc(100vw-2rem)] sm:w-[420px] h-[540px] ios-glass-panel flex flex-col overflow-hidden z-50 rounded-[28px] shadow-2xl transition-all duration-300 border border-white/15 ${
          isOpen ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-4 scale-95 pointer-events-none'
        }`}
      >
        {/* Header Panel */}
        <div className="p-4 border-b border-white/10 bg-black/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--theme-primary, #10B981)' }} />
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-200">Axion Study Companion</h3>
          </div>
          <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-white cursor-pointer">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Quick Actions Row */}
        <div className="px-3 py-2 border-b border-white/5 bg-black/20 flex gap-2 overflow-x-auto custom-scrollbar">
          <button 
            onClick={() => handleSendMessage("Summarize today's progress and focus efficiency.")}
            className="px-2.5 py-1.5 text-[10px] font-bold bg-white/10 hover:bg-white/20 text-zinc-100 rounded-xl whitespace-nowrap cursor-pointer transition-colors border border-white/10 flex items-center gap-1 shrink-0 animate-ios-fade-in"
          >
            📊 Summarize Today
          </button>
          <button 
            onClick={() => handleSendMessage("Create a revision task for Biology.")}
            className="px-2.5 py-1.5 text-[10px] font-bold bg-white/10 hover:bg-white/20 text-zinc-100 rounded-xl whitespace-nowrap cursor-pointer transition-colors border border-white/10 flex items-center gap-1 shrink-0 animate-ios-fade-in"
          >
            ➕ Revise Bio Task
          </button>
          <button 
            onClick={() => handleSendMessage("What subject needs the most attention?")}
            className="px-2.5 py-1.5 text-[10px] font-bold bg-white/10 hover:bg-white/20 text-zinc-100 rounded-xl whitespace-nowrap cursor-pointer transition-colors border border-white/10 flex items-center gap-1 shrink-0 animate-ios-fade-in"
          >
            🎯 Focus Advice
          </button>
          <button 
            onClick={() => handleSendMessage('log chemistry study task "Organic Chemistry" for 45 mins')}
            className="px-2.5 py-1.5 text-[10px] font-bold bg-white/10 hover:bg-white/20 text-zinc-100 rounded-xl whitespace-nowrap cursor-pointer transition-colors border border-white/10 flex items-center gap-1 shrink-0 animate-ios-fade-in"
          >
            📝 Log Session
          </button>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`max-w-[85%] p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words ${
                msg.sender === 'user' 
                  ? 'text-white ml-auto rounded-tr-none shadow-md' 
                  : 'bg-black/50 text-zinc-200 mr-auto rounded-tl-none border border-white/10 shadow-sm'
              }`}
              style={{ backgroundColor: msg.sender === 'user' ? 'var(--theme-primary, #10B981)' : undefined }}
            >
              {msg.text}
            </div>
          ))}
          {isLoading && (
            <div className="bg-black/40 text-zinc-400 mr-auto rounded-2xl rounded-tl-none border border-white/10 p-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-3 border-t border-white/10 bg-black/40 flex items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleInputResize}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask AI or log session..."
            className="flex-1 ios-glass-input border border-white/10 focus:border-white/20 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm outline-none text-white transition-colors resize-none font-medium max-h-[100px] leading-normal"
          />
          <button 
            onClick={() => handleSendMessage()}
            disabled={!input.trim() || isLoading}
            className="p-2.5 text-white rounded-xl shadow-md disabled:opacity-30 transition-all cursor-pointer flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--theme-primary, #10B981)' }}
          >
            <span className="material-symbols-outlined text-[16px]">send</span>
          </button>
        </div>

      </div>
    </>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { PlanItem, LogItem, getSubjectConfig, calculateNextReviewDate } from '../types';
import { nanoid } from 'nanoid';

interface ChatbotProps {
  morningPlan: PlanItem[];
  setMorningPlan: React.Dispatch<React.SetStateAction<PlanItem[]>>;
  loggedSessions: LogItem[];
  setLoggedSessions: React.Dispatch<React.SetStateAction<LogItem[]>>;
}

interface Message {
  sender: 'user' | 'assistant';
  text: string;
}

export default function Chatbot({ morningPlan, setMorningPlan, loggedSessions, setLoggedSessions }: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { sender: 'assistant', text: "Hi! I can help you adjust your tracker plans or summarize your history logs. Type or paste your study notes here." }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setInput('');
    setIsLoading(true);

    try {
      const safePlanText = JSON.stringify(morningPlan || []).replace(/[\/\\]/g, '');
      const safeLogText = JSON.stringify(loggedSessions || []).replace(/[\/\\]/g, '');
      const safeUserText = userText.replace(/["'\\]/g, ' ').replace(/[\r\n]/g, ' ');

      const allKeys = Object.keys(localStorage);
      const allLogs = allKeys.filter(k => k.startsWith('axion_logs_') || k.startsWith('pcbm_log_')).map(k => {
          return { date: k.replace('axion_logs_', '').replace('pcbm_log_', ''), logs: JSON.parse(localStorage.getItem(k) || '[]') };
      });
      const archiveText = JSON.stringify(allLogs).replace(/[\/\\]/g, '');

      const analysisData = Object.keys(localStorage).filter(k => k.startsWith('axion_logs_') || k.startsWith('pcbm_log_')).reduce((acc: any[], k) => {
          const logs = JSON.parse(localStorage.getItem(k) || '[]');
          logs.forEach((l: any) => {
              if (!l.isMissed && l.subject && l.activeMins) {
                 acc.push({ date: k.replace('axion_logs_', '').replace('pcbm_log_', ''), ...l });
              }
          });
          return acc;
      }, []);
      const analysisText = JSON.stringify(analysisData).replace(/[\/\\]/g, '');

      const operationalPrompt = `You are a supportive, direct study assistant classmates style. Avoid robotic jargon.
Current items: Plans: ${safePlanText} | Records: ${safeLogText}
Historical Archive & Analysis Data (Time Allocation etc.): ${analysisText}

If user requests updates, append standard commands:
To add a plan: :::{"command": "add_plan", "subject": "bio"|"phys"|"chem"|"math", "topic": "string", "mins": number, "units": number}:::
To update a log: :::{"command": "add_log", "subject": "bio"|"phys"|"chem"|"math", "topic": "string", "activeMins": number, "distractionMins": number, "checkingMins": number, "practiceMins": number, "errors": number, "startPage": number, "endPage": number}:::

Proactive Data Gathering rules: If the user wants to log a session but is missing checkingMins, practiceMins, or errors, YOU MUST ASK for them before outputting the "add_log" command. 
HOWEVER, if the user explicitly says "log the session as it is", IMMEDIATELY bypass the missing requirements (use 0 or null) and output the "add_log" command.

User input message: "${safeUserText}"`;

      const res = await fetch(`/api/gemini/generate`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt: operationalPrompt })
      });

      if (!res.ok) {
        throw new Error(`API Connection Failed: ${res.status}`);
      }

      const data = await res.json();
      let assistantText = data.text || "Let's try rephrasing that request.";

      const jsonRegex = /:::(.*?):::/s;
      const match = assistantText.match(jsonRegex);

      if (match && match[1]) {
        try {
          const commandData = JSON.parse(match[1].trim());

          if (commandData.command === 'add_plan') {
             const newPlan = {
                 id: nanoid(),
                 subject: commandData.subject || 'bio',
                 topic: commandData.topic || 'Untitled Entry',
                 sessionType: 'Study',
                 targetUnits: commandData.units || 0,
                 targetMins: commandData.mins || 0,
                 status: 'pending'
             };
             setMorningPlan(prev => [...prev, newPlan as any]);
          }

          // Fixed: add_log was parsed but never saved — now creates a real LogItem
          if (commandData.command === 'add_log') {
             const newLog: LogItem = {
                 id: nanoid(),
                 subject: commandData.subject || 'bio',
                 topic: commandData.topic || 'Untitled Session',
                 sessionType: 'Study',
                 activeMins: commandData.activeMins || 0,
                 distractionMins: commandData.distractionMins || 0,
                 recoveryMins: 0,
                 checkingMins: commandData.checkingMins || undefined,
                 practiceMins: commandData.practiceMins || undefined,
                 errors: commandData.errors !== undefined ? commandData.errors : undefined,
                 retentionScore: commandData.retentionScore || 5,
                 startPage: commandData.startPage || undefined,
                 endPage: commandData.endPage || undefined,
                 notes: commandData.notes || '',
                 frictionAnalysis: commandData.frictionPoint || undefined,
                 synced: false
             };
             newLog.nextReviewDate = calculateNextReviewDate(newLog);
             setLoggedSessions(prev => [...prev, newLog]);
          }

          assistantText = assistantText.replace(jsonRegex, '').trim();
        } catch (jsonErr) {
          console.error("JSON bypass handled", jsonErr);
        }
      }

      setMessages(prev => [...prev, { sender: 'assistant', text: assistantText }]);
    } catch (err) {
      console.error("Gemini Handshake Failure:", err);
      setMessages(prev => [...prev, { sender: 'assistant', text: "Connection anomaly encountered. Please check your API key or rephrase your input sentence." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Chat Trigger Bubble */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer z-50"
        style={{ backgroundColor: 'var(--theme-primary, #10B981)' }}
      >
        <span className="material-symbols-outlined text-[24px]">{isOpen ? 'close' : 'chat_bubble'}</span>
      </button>

      {/* Slide-out Glass Chat Drawer Panel */}
      <div 
        className={`fixed bottom-24 right-6 w-[calc(100vw-2rem)] sm:w-[380px] h-[480px] bg-black/40 backdrop-blur-md border border-white/10 flex flex-col overflow-hidden z-50 rounded-[28px] shadow-2xl transition-all duration-300 cubic-bezier(0.16, 1, 0.3, 1) ${
          isOpen ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-4 scale-95 pointer-events-none'
        }`}
      >
        {/* Header Panel */}
        <div className="p-4 border-b border-white/10 bg-black/20 flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--theme-primary, #10B981)' }}></span>
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Assistant</h3>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5">
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`max-w-[82%] p-3 rounded-2xl text-sm leading-relaxed ${
                msg.sender === 'user' 
                  ? 'text-white ml-auto rounded-tr-none shadow-md' 
                  : 'bg-black/20 text-zinc-200 mr-auto rounded-tl-none border border-white/5'
              }`}
              style={{ backgroundColor: msg.sender === 'user' ? 'var(--theme-primary, #10B981)' : undefined }}
            >
              {msg.text}
            </div>
          ))}
          {isLoading && (
            <div className="bg-black/20 text-zinc-500 mr-auto rounded-2xl rounded-tl-none border border-white/5 p-3 flex items-center gap-1.5">
               <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
               <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
               <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-3 border-t border-white/10 bg-black/20 flex items-end gap-2">
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
            placeholder="Message..."
            className="flex-1 bg-black/40 border border-white/10 focus:border-white/20 rounded-xl px-3.5 py-2.5 text-sm outline-none text-white transition-colors resize-none font-medium max-h-[120px] leading-normal"
          />
          <button 
            onClick={handleSendMessage}
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

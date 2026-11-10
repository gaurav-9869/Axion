import React, { useState, useRef, useEffect } from 'react';
import {
  PlanItem,
  LogItem,
  getLocalDateString,
  ChatShortcut
} from '../types';
import ReactMarkdown from 'react-markdown';
import { auth, onAuthStateChanged } from '../firebase';
import {
  getDailyPlan,
  getStudyLogs
} from '../services/dbService';
import {
  getDailyChatMessages,
  saveDailyChatMessage,
  setViewportClearedTimestamp,
  extractEmbeddedCommands,
  executeBatchCommands,
  categorizeAndExtractOperations,
  getWorkspaceContext
} from '../services/chatService';
import {
  getChatShortcuts,
  addChatShortcut,
  updateChatShortcut,
  reorderChatShortcut,
  removeChatShortcut,
  DEFAULT_CHAT_SHORTCUTS
} from '../services/shortcutService';
import { generateWithGemini } from '../lib/gemini';
import { sound } from '../utils/sound';
import { AxIcon } from './AxionIcons';

interface Props {
  morningPlan: PlanItem[];
  setMorningPlan: React.Dispatch<React.SetStateAction<PlanItem[]>>;
  loggedSessions: LogItem[];
  setLoggedSessions: React.Dispatch<React.SetStateAction<LogItem[]>>;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  actionCard?: {
    title: string;
    items: string[];
  };
}

const DEFAULT_GREETING: Message = {
  role: 'assistant',
  content: 'Ready. How would you like to structure your sessions today?'
};

/**
 * Formats LaTeX/math notation ($...$, $$...$$, \frac, Greek symbols, superscripts)
 * into clean typographic math so formulas never display raw backslashes or delimiters.
 */
function formatMathAndMarkdown(raw: string): string {
  if (!raw) return '';

  const replaceLatexTokens = (expr: string): string => {
    return expr
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1) / ($2)')
      .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
      .replace(/\\Delta/g, 'Δ')
      .replace(/\\alpha/g, 'α')
      .replace(/\\beta/g, 'β')
      .replace(/\\gamma/g, 'γ')
      .replace(/\\theta/g, 'θ')
      .replace(/\\lambda/g, 'λ')
      .replace(/\\omega/g, 'ω')
      .replace(/\\sigma/g, 'σ')
      .replace(/\\mu/g, 'μ')
      .replace(/\\pi/g, 'π')
      .replace(/\\infty/g, '∞')
      .replace(/\\approx/g, '≈')
      .replace(/\\neq/g, '≠')
      .replace(/\\leq/g, '≤')
      .replace(/\\geq/g, '≥')
      .replace(/\\times/g, '×')
      .replace(/\\cdot/g, '·')
      .replace(/\\pm/g, '±')
      .replace(/\\rightarrow/g, '→')
      .replace(/\\leftarrow/g, '←')
      .replace(/\^2\b/g, '²')
      .replace(/\^3\b/g, '³')
      .replace(/\\text\{([^{}]+)\}/g, '$1');
  };

  // Block math $$...$$
  let formatted = raw.replace(/\$\$([\s\S]*?)\$\$/g, (_, mathBlock) => {
    const cleaned = replaceLatexTokens(mathBlock.trim());
    return `\n\`${cleaned}\`\n`;
  });

  // Inline math $...$
  formatted = formatted.replace(/\$([^\n$]+?)\$/g, (_, mathInline) => {
    const cleaned = replaceLatexTokens(mathInline.trim());
    return `\`${cleaned}\``;
  });

  return replaceLatexTokens(formatted);
}

export default function Chatbot({
  morningPlan,
  setMorningPlan,
  loggedSessions,
  setLoggedSessions
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate] = useState<string>(() => getLocalDateString(0));
  const [messages, setMessages] = useState<Message[]>([DEFAULT_GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Configurable Shortcuts State
  const [shortcuts, setShortcuts] = useState<ChatShortcut[]>(DEFAULT_CHAT_SHORTCUTS);
  const [isManagingShortcuts, setIsManagingShortcuts] = useState(false);
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [shortcutLabelInput, setShortcutLabelInput] = useState('');
  const [shortcutSymbolInput, setShortcutSymbolInput] = useState('+');
  const [shortcutPromptInput, setShortcutPromptInput] = useState('');
  const [shortcutSaving, setShortcutSaving] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    window.addEventListener('axion-toggle-chatbot', handleToggle);
    return () => window.removeEventListener('axion-toggle-chatbot', handleToggle);
  }, []);

  // Load daily chat history and shortcuts
  useEffect(() => {
    let isMounted = true;

    const fetchHistoryForDate = async (dateStr: string) => {
      setHistoryLoading(true);
      try {
        const history = await getDailyChatMessages(dateStr);
        if (!isMounted) return;
        if (history && history.length > 0) {
          setMessages(
            history.map(m => ({
              role: m.sender === 'user' ? 'user' : 'assistant',
              content: m.text,
              actionCard:
                m.operationsExecuted && m.operationsExecuted.length > 0
                  ? {
                      title: 'Actions',
                      items: m.operationsExecuted.map(
                        op =>
                          `${op.type.toUpperCase()}: [${op.subject.toUpperCase()}] ${op.topic}`
                      )
                    }
                  : undefined
            }))
          );
        } else {
          setMessages([DEFAULT_GREETING]);
        }
      } catch {
        if (isMounted) setMessages([DEFAULT_GREETING]);
      } finally {
        if (isMounted) {
          setHistoryLoading(false);
        }
      }
    };

    const fetchShortcutsList = async () => {
      try {
        const list = await getChatShortcuts();
        if (isMounted && list.length > 0) {
          setShortcuts(list);
        }
      } catch {}
    };

    fetchHistoryForDate(selectedDate);
    fetchShortcutsList();

    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user) {
        fetchHistoryForDate(selectedDate);
        fetchShortcutsList();
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [selectedDate]);

  // Start a new thread for the current date
  const handleNewThread = () => {
    sound.playClick();
    setViewportClearedTimestamp(selectedDate, Date.now());
    setMessages([DEFAULT_GREETING]);
  };

  const resetShortcutEditor = () => {
    setEditingShortcutId(null);
    setShortcutLabelInput('');
    setShortcutSymbolInput('+');
    setShortcutPromptInput('');
  };

  const handleOpenAddShortcut = () => {
    sound.playClick();
    setIsManagingShortcuts(true);
    setEditingShortcutId('__new__');
    setShortcutLabelInput('');
    setShortcutSymbolInput('+');
    setShortcutPromptInput(input.trim() || '');
  };

  const handleStartEditShortcut = (sc: ChatShortcut) => {
    sound.playClick();
    setEditingShortcutId(sc.id);
    setShortcutLabelInput(sc.label);
    setShortcutSymbolInput(sc.symbol || '+');
    setShortcutPromptInput(sc.promptTemplate || sc.prompt || '');
  };

  const handleSaveShortcutForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLabel = shortcutLabelInput.trim();
    const cleanPrompt = shortcutPromptInput.trim();
    const cleanSymbol = shortcutSymbolInput.trim() || '+';
    if (!cleanLabel || !cleanPrompt) return;

    setShortcutSaving(true);
    try {
      if (editingShortcutId === '__new__') {
        const { all } = await addChatShortcut({
          label: cleanLabel,
          symbol: cleanSymbol,
          promptTemplate: cleanPrompt
        });
        setShortcuts(all);
      } else if (editingShortcutId) {
        const updated = await updateChatShortcut(editingShortcutId, {
          label: cleanLabel,
          symbol: cleanSymbol,
          promptTemplate: cleanPrompt
        });
        setShortcuts(updated);
      }
      sound.playSuccess();
      resetShortcutEditor();
    } finally {
      setShortcutSaving(false);
    }
  };

  const handleReorderShortcut = async (id: string, dir: 'left' | 'right') => {
    sound.playClick();
    const updated = await reorderChatShortcut(id, dir);
    setShortcuts(updated);
  };

  const handleDeleteShortcut = async (id: string) => {
    sound.playClick();
    const updated = await removeChatShortcut(id);
    setShortcuts(updated);
    if (editingShortcutId === id) {
      resetShortcutEditor();
    }
  };

  const handleShortcutClick = (sc: ChatShortcut) => {
    sound.playClick();
    const promptText = (sc.promptTemplate || sc.prompt || '').trim();
    if (!promptText) return;
    setInput(promptText);
    handleSend(promptText);
  };

  const handleSend = async (overrideMessage?: string) => {
    const userMsg = (overrideMessage !== undefined ? overrideMessage : input).trim();
    if (!userMsg || loading) return;

    sound.playClick();
    setInput('');
    const updatedMessages: Message[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(updatedMessages);
    setLoading(true);

    // Persist user message silently
    saveDailyChatMessage(selectedDate, {
      sender: 'user',
      text: userMsg
    }).catch(() => {});

    try {
      const todayStr = getLocalDateString(0);
      const uid = auth.currentUser?.uid || '';

      let freshLogs = loggedSessions;
      let freshPlan = morningPlan;
      let firestoreWorkspaceContext = '';

      try {
        const [dbLogs, dbPlan, wsContext] = await Promise.all([
          getStudyLogs(120),
          getDailyPlan(todayStr),
          uid ? getWorkspaceContext(uid, todayStr) : Promise.resolve('')
        ]);
        if (dbLogs && dbLogs.length > 0) {
          freshLogs = dbLogs;
          setLoggedSessions(dbLogs);
        }
        if (dbPlan && dbPlan.length > 0) {
          freshPlan = dbPlan;
          if (selectedDate === todayStr) {
            setMorningPlan(dbPlan);
          }
        }
        if (wsContext) {
          firestoreWorkspaceContext = wsContext;
        }
      } catch {}

      const recentContextSummary = freshLogs
        .slice(0, 20)
        .map(
          l =>
            `- [${l.subject.toUpperCase()}] ${l.topic} (${l.sessionType || 'Study'}, ${
              l.activeMins || 30
            }m, R:${l.retentionScore || 8}/10)`
        )
        .join('\n');

      const planSummary = freshPlan
        .map(
          p =>
            `- [${p.subject.toUpperCase()}] ${p.topic} (${p.sessionType}, ${p.targetMins}m, ${p.status})`
        )
        .join('\n');

      // Multi-Turn Context Buffer (retaining conversation history within the session)
      const multiTurnBuffer = updatedMessages
        .slice(-10)
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      const systemPrompt = `You are Axion Assistant, a concise academic study companion.
Active Date: ${todayStr}
Today's Tasks:
${planSummary || 'None'}

Recent Study History:
${recentContextSummary || 'None'}

Firestore Workspace Snapshot:
${firestoreWorkspaceContext || 'None'}

Conversation History (Multi-Turn Buffer):
${multiTurnBuffer}

If the user asks to log a session or plan tasks, include a JSON command block wrapped in :::{"operations":[...]}::: where each operation has:
{"command":"add_log"|"add_plan"|"schedule_revision","date":"${selectedDate}","subject":"phys"|"chem"|"math"|"bio","chapter":"...","topic":"...","sessionType":"Study"|"Revise"|"Exercise","activeMins":45,"targetMins":45,"mcqCount":20,"retentionScore":8}

Format formulas cleanly and use concise markdown bullets or tables.

Current User Message: ${userMsg}`;

      const rawAiText = await generateWithGemini(systemPrompt);
      const { cleanedText, commands } = extractEmbeddedCommands(rawAiText);

      const finalCommands =
        commands.length > 0
          ? commands
          : categorizeAndExtractOperations(userMsg, 'phys', selectedDate);

      let operationsExecuted: any[] = [];
      const actionItems: string[] = [];

      if (finalCommands.length > 0) {
        const execResult = await executeBatchCommands(finalCommands, 'phys', selectedDate);
        operationsExecuted = execResult.operationsExecuted;

        execResult.operationsExecuted.forEach(op => {
          if (op.status === 'success') {
            actionItems.push(`${op.type.toUpperCase()}: [${op.subject.toUpperCase()}] ${op.topic}`);
          }
        });

        // Refresh logs and plans in state
        const [updatedLogs, updatedPlan] = await Promise.all([
          getStudyLogs(150),
          getDailyPlan(todayStr)
        ]);
        if (updatedLogs) setLoggedSessions(updatedLogs);
        if (updatedPlan) setMorningPlan(updatedPlan);
      }

      const assistantReply =
        cleanedText ||
        (actionItems.length > 0 ? 'Updated your workspace.' : 'Done.');

      await saveDailyChatMessage(selectedDate, {
        sender: 'assistant',
        text: assistantReply,
        operationsExecuted
      });

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: assistantReply,
          actionCard:
            actionItems.length > 0
              ? {
                  title: 'Actions',
                  items: actionItems
                }
              : undefined
        }
      ]);
      sound.playSuccess();
    } catch (error: any) {
      sound.playError();
      const errorMsg =
        error?.message || 'Failed to reach AI service. Please verify your network and API key.';
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Connection error: ${errorMsg}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Chat Trigger Capsule */}
      <button
        onClick={() => {
          sound.playClick();
          setIsOpen(!isOpen);
        }}
        className="ax-tap w-12 h-12 rounded-full axion-capsule-l3 flex items-center justify-center text-white hover:border-emerald-500/40 shadow-[0_12px_28px_rgba(0,0,0,0.55)] cursor-pointer relative"
        title="Assistant"
      >
        <AxIcon name={isOpen ? 'close' : 'chat'} className="w-5 h-5 text-white ax-icon-white" />
        <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
      </button>

      {/* Level 4 Chat Drawer (rgba(10, 14, 26, 0.92), blur(28px), 1px solid rgba(255, 255, 255, 0.08), 24px radius) */}
      {isOpen && (
        <div
          className="fixed bottom-[74px] md:bottom-20 right-3.5 md:right-6 w-[calc(100vw-1.75rem)] sm:w-[410px] h-[580px] max-h-[78vh] flex flex-col overflow-hidden z-[90] modal-emerge shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)]"
          style={{
            background: 'rgba(10, 14, 26, 0.94)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px'
          }}
        >
          {/* 1. STREAMLINED HEADER: Strictly Title "Assistant", Active Green Pulse Indicator, and New Thread Button (#ax-resync) */}
          <div className="px-4 py-3.5 border-b border-white/[0.08] flex items-center justify-between gap-2 bg-black/20 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 relative">
                <AxIcon name="chat" className="w-4 h-4 text-white ax-icon-white" />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0a0e1a] animate-pulse" />
              </div>
              <h3 className="text-sm font-bold tracking-tight text-white">Assistant</h3>
            </div>

            <div className="flex items-center gap-1.5">
              {/* New Thread Button (#ax-resync) */}
              <button
                onClick={handleNewThread}
                className="ax-pressable w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.06] flex items-center justify-center text-white cursor-pointer"
                title="New Thread"
              >
                <AxIcon name="resync" className="w-4 h-4 text-white ax-icon-white" />
              </button>

              {/* Close Drawer Button */}
              <button
                onClick={() => setIsOpen(false)}
                className="ax-pressable w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.06] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
                title="Close"
              >
                <AxIcon name="close" className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 2. MESSAGES STREAM */}
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3.5">
            {historyLoading ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs font-mono gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Loading...</span>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex flex-col gap-1.5 ${
                    m.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-emerald-500 text-slate-950 font-semibold rounded-br-sm'
                        : 'axion-surface-l2 text-slate-100 rounded-bl-sm'
                    }`}
                  >
                    {m.role === 'assistant' ? (
                      <div className="markdown-body space-y-2 break-words [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_strong]:text-emerald-300 [&_strong]:font-semibold [&_code]:font-mono [&_code]:text-[11px] [&_code]:bg-black/40 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-emerald-300 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-white/15 [&_th]:bg-white/5 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1">
                        <ReactMarkdown>{formatMathAndMarkdown(m.content)}</ReactMarkdown>
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap break-words">{m.content}</span>
                    )}
                  </div>

                  {m.actionCard && (
                    <div className="max-w-[88%] w-full axion-surface-l2 border-emerald-500/30 p-3 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                        <AxIcon name="tick" className="w-3.5 h-3.5" />
                        <span>{m.actionCard.title}</span>
                      </div>
                      <ul className="flex flex-col gap-1">
                        {m.actionCard.items.map((item, idx) => (
                          <li
                            key={idx}
                            className="text-[11px] text-slate-200 font-mono flex items-start gap-1.5"
                          >
                            <span className="text-emerald-400">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))
            )}

            {loading && (
              <div className="self-start axion-surface-l2 px-3.5 py-2.5 rounded-2xl rounded-bl-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:120ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:240ms]" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 3. CONFIGURABLE SHORTCUTS TOOLBAR */}
          <div className="px-3.5 py-2 border-t border-white/[0.06] bg-black/25 flex flex-col gap-2 shrink-0">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1">
                {shortcuts.map(sc => (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => handleShortcutClick(sc)}
                    disabled={loading}
                    className="ax-tap px-2.5 py-1 rounded-full bg-white/[0.05] hover:bg-emerald-500/15 border border-white/[0.08] hover:border-emerald-500/30 text-[11px] font-mono text-slate-200 hover:text-emerald-300 whitespace-nowrap flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-40"
                    title={sc.promptTemplate}
                  >
                    <span className="text-emerald-400 font-bold">{sc.symbol || '+'}</span>
                    <span>{sc.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleOpenAddShortcut}
                  className="ax-tap w-6 h-6 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-slate-300 hover:text-emerald-400 cursor-pointer"
                  title="Add Shortcut"
                >
                  <AxIcon name="plus" className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setIsManagingShortcuts(!isManagingShortcuts);
                    if (isManagingShortcuts) resetShortcutEditor();
                  }}
                  className={`ax-tap w-6 h-6 rounded-lg border flex items-center justify-center cursor-pointer ${
                    isManagingShortcuts
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : 'bg-white/[0.05] border-white/[0.08] text-slate-400 hover:text-white'
                  }`}
                  title="Edit Shortcuts"
                >
                  <AxIcon name="settings" className="w-3.5 h-3.5 text-white ax-icon-white" />
                </button>
              </div>
            </div>

            {/* Inline Shortcut Manager Drawer */}
            {isManagingShortcuts && (
              <div className="axion-surface-l2 p-3 flex flex-col gap-2.5 max-h-56 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300 font-semibold">
                    Shortcuts
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsManagingShortcuts(false);
                      resetShortcutEditor();
                    }}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <AxIcon name="close" className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  {shortcuts.map((sc, idx) => (
                    <div
                      key={sc.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-black/30 border border-white/[0.06]"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-mono text-emerald-400 shrink-0">
                          {sc.symbol || '+'}
                        </span>
                        <span className="text-xs text-white truncate">{sc.label}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleReorderShortcut(sc.id, 'left')}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <AxIcon name="chevron-left" className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === shortcuts.length - 1}
                          onClick={() => handleReorderShortcut(sc.id, 'right')}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <AxIcon name="chevron-right" className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEditShortcut(sc)}
                          className="p-1 text-slate-400 hover:text-emerald-400 cursor-pointer"
                        >
                          <AxIcon name="edit" className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteShortcut(sc.id)}
                          className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                        >
                          <AxIcon name="delete" className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {editingShortcutId && (
                  <form
                    onSubmit={handleSaveShortcutForm}
                    className="flex flex-col gap-2 pt-2 border-t border-white/[0.08]"
                  >
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={shortcutSymbolInput}
                        onChange={e => setShortcutSymbolInput(e.target.value)}
                        maxLength={3}
                        placeholder="+"
                        className="w-10 ios-glass-input px-2 py-1.5 text-xs text-center font-mono text-white"
                      />
                      <input
                        type="text"
                        required
                        value={shortcutLabelInput}
                        onChange={e => setShortcutLabelInput(e.target.value)}
                        placeholder="Label (e.g. Focus Advice)"
                        className="flex-1 ios-glass-input px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <textarea
                      rows={2}
                      required
                      value={shortcutPromptInput}
                      onChange={e => setShortcutPromptInput(e.target.value)}
                      placeholder="Prompt..."
                      className="ios-glass-input px-2.5 py-1.5 text-xs text-white resize-none"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={resetShortcutEditor}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.06] text-[11px] text-slate-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={shortcutSaving}
                        className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 font-bold text-[11px] cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* 4. INPUT COMPOSER */}
          <div className="p-3 bg-black/35 border-t border-white/[0.08] flex items-center gap-2 shrink-0">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask Assistant..."
              className="flex-1 ios-glass-input rounded-full px-4 py-2.5 text-xs text-white placeholder-slate-500 resize-none max-h-24"
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="ax-pressable w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center disabled:opacity-40 cursor-pointer shrink-0 shadow-[0_0_16px_rgba(16,185,129,0.35)]"
              title="Send"
            >
              <AxIcon name="send" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

import { nanoid } from 'nanoid';
import { db, auth, doc, getDoc, setDoc, serverTimestamp } from '../firebase';
import { ChatShortcut } from '../types';
import { cleanUndefined, handleFirestoreError, OperationType } from './dbService';

const LOCAL_SHORTCUTS_KEY = 'axion_shortcuts';

export const DEFAULT_CHAT_SHORTCUTS: ChatShortcut[] = [
  {
    id: 'sc-1',
    label: 'Focus Advice',
    symbol: '+',
    promptTemplate: 'What subject needs the most attention today based on my recent sessions?',
    prompt: 'What subject needs the most attention today based on my recent sessions?',
    order: 0,
    isSystemDefault: true
  },
  {
    id: 'sc-2',
    label: 'Plan Tomorrow',
    symbol: '+',
    promptTemplate: 'Plan 3 focused revision and study sessions for tomorrow.',
    prompt: 'Plan 3 focused revision and study sessions for tomorrow.',
    order: 1,
    isSystemDefault: true
  },
  {
    id: 'sc-3',
    label: 'Log Day',
    symbol: '+',
    promptTemplate: 'Log a 45 min Physics Study session on Electrostatics and summarize my day.',
    prompt: 'Log a 45 min Physics Study session on Electrostatics and summarize my day.',
    order: 2,
    isSystemDefault: true
  },
  {
    id: 'sc-4',
    label: 'Summarize Today',
    symbol: '+',
    promptTemplate: "Summarize today's progress and focus efficiency.",
    prompt: "Summarize today's progress and focus efficiency.",
    order: 3,
    isSystemDefault: true
  }
];

/**
 * Normalizes any raw or legacy shortcut object into the strict ChatShortcut schema.
 */
export function normalizeShortcut(raw: any, index: number): ChatShortcut {
  const rawLabel = typeof raw?.label === 'string' ? raw.label.trim() : 'Quick Action';
  let symbol = typeof raw?.symbol === 'string' && raw.symbol.trim() ? raw.symbol.trim() : '';
  let cleanLabel = rawLabel;

  // Extract leading emoji from legacy labels like "📊 Summarize Today" if symbol wasn't stored separately
  if (!symbol) {
    const emojiMatch = rawLabel.match(/^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])\s+(.*)$/u);
    if (emojiMatch) {
      symbol = emojiMatch[1];
      cleanLabel = emojiMatch[2].trim();
    } else {
      symbol = '⚡';
    }
  } else if (cleanLabel.startsWith(symbol)) {
    cleanLabel = cleanLabel.slice(symbol.length).trim() || rawLabel;
  }

  const promptTemplate = (raw?.promptTemplate || raw?.prompt || '').trim();
  const order = typeof raw?.order === 'number' ? raw.order : index;
  const id = raw?.id || `custom-${nanoid(6)}`;
  const isSystemDefault =
    typeof raw?.isSystemDefault === 'boolean'
      ? raw.isSystemDefault
      : ['sc-1', 'sc-2', 'sc-3', 'sc-4'].includes(id);

  return {
    id,
    label: cleanLabel || 'Shortcut',
    symbol,
    promptTemplate,
    prompt: promptTemplate,
    order,
    isSystemDefault,
    timestamp: raw?.timestamp || Date.now()
  };
}

/**
 * Fetches and sorts user shortcuts from `users/{uid}/settings/shortcuts`,
 * falling back to localStorage or system defaults.
 */
export async function getChatShortcuts(): Promise<ChatShortcut[]> {
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    try {
      const docRef = doc(db, 'users', uid, 'settings', 'shortcuts');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.shortcuts) && data.shortcuts.length > 0) {
          const normalized = data.shortcuts
            .map((s: any, idx: number) => normalizeShortcut(s, idx))
            .sort((a, b) => a.order - b.order)
            .map((s, idx) => ({ ...s, order: idx }));
          try {
            localStorage.setItem(LOCAL_SHORTCUTS_KEY, JSON.stringify(normalized));
          } catch {}
          return normalized;
        }
      }
    } catch (err) {
      console.warn('getChatShortcuts from Firestore failed, using fallback:', err);
    }
  }

  try {
    const local = localStorage.getItem(LOCAL_SHORTCUTS_KEY);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map((s: any, idx: number) => normalizeShortcut(s, idx))
          .sort((a, b) => a.order - b.order)
          .map((s, idx) => ({ ...s, order: idx }));
      }
    }
  } catch {}

  return DEFAULT_CHAT_SHORTCUTS.map((s, idx) => ({ ...s, order: idx }));
}

/**
 * Persists the entire ordered list of shortcuts to `users/{uid}/settings/shortcuts`.
 */
export async function saveChatShortcuts(shortcuts: ChatShortcut[]): Promise<ChatShortcut[]> {
  const ordered = shortcuts
    .map((s, idx) => normalizeShortcut({ ...s, order: idx }, idx))
    .sort((a, b) => a.order - b.order)
    .map((s, idx) => ({ ...s, order: idx }));

  try {
    localStorage.setItem(LOCAL_SHORTCUTS_KEY, JSON.stringify(ordered));
  } catch {}

  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    const path = `users/${uid}/settings/shortcuts`;
    try {
      const docRef = doc(db, 'users', uid, 'settings', 'shortcuts');
      await setDoc(
        docRef,
        cleanUndefined({
          shortcuts: ordered,
          updatedAt: serverTimestamp()
        }),
        { merge: true }
      );
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, path);
      } catch (errInfo) {
        console.warn('Handled Firestore write exception in saveChatShortcuts:', errInfo);
      }
    }
  }

  return ordered;
}

/**
 * Creates a new shortcut and appends it to the end of the toolbar.
 */
export async function addChatShortcut(input: {
  label: string;
  symbol?: string;
  promptTemplate: string;
}): Promise<{ shortcut: ChatShortcut; all: ChatShortcut[] }> {
  const current = await getChatShortcuts();
  const newItem = normalizeShortcut(
    {
      id: `custom-${nanoid(6)}`,
      label: input.label.trim(),
      symbol: (input.symbol || '⚡').trim(),
      promptTemplate: input.promptTemplate.trim(),
      order: current.length,
      isSystemDefault: false
    },
    current.length
  );

  const all = await saveChatShortcuts([...current, newItem]);
  return { shortcut: newItem, all };
}

/**
 * Updates an existing shortcut's label, symbol, or promptTemplate.
 */
export async function updateChatShortcut(
  id: string,
  updates: Partial<Pick<ChatShortcut, 'label' | 'symbol' | 'promptTemplate'>>
): Promise<ChatShortcut[]> {
  const current = await getChatShortcuts();
  const next = current.map((sc, idx) => {
    if (sc.id !== id) return sc;
    const updatedPrompt =
      updates.promptTemplate !== undefined ? updates.promptTemplate.trim() : sc.promptTemplate;
    return normalizeShortcut(
      {
        ...sc,
        label: updates.label !== undefined ? updates.label.trim() : sc.label,
        symbol: updates.symbol !== undefined ? updates.symbol.trim() : sc.symbol,
        promptTemplate: updatedPrompt,
        prompt: updatedPrompt
      },
      idx
    );
  });

  return saveChatShortcuts(next);
}

/**
 * Reorders a shortcut left/right or to a target index.
 */
export async function reorderChatShortcut(
  id: string,
  directionOrIndex: 'left' | 'right' | number
): Promise<ChatShortcut[]> {
  const current = [...(await getChatShortcuts())];
  const fromIdx = current.findIndex(s => s.id === id);
  if (fromIdx === -1) return current;

  let toIdx = fromIdx;
  if (directionOrIndex === 'left') {
    toIdx = Math.max(0, fromIdx - 1);
  } else if (directionOrIndex === 'right') {
    toIdx = Math.min(current.length - 1, fromIdx + 1);
  } else if (typeof directionOrIndex === 'number') {
    toIdx = Math.max(0, Math.min(current.length - 1, directionOrIndex));
  }

  if (toIdx === fromIdx) return current;

  const [moved] = current.splice(fromIdx, 1);
  current.splice(toIdx, 0, moved);

  return saveChatShortcuts(current);
}

/**
 * Deletes a shortcut by ID and re-normalizes remaining orders.
 */
export async function removeChatShortcut(id: string): Promise<ChatShortcut[]> {
  const current = await getChatShortcuts();
  const filtered = current.filter(s => s.id !== id);
  return saveChatShortcuts(filtered);
}

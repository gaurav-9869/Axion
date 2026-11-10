import { 
  db, 
  auth, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit as limitQuery, 
  writeBatch,
  deleteDoc
} from '../firebase';
import { 
  LogItem, 
  PlanItem, 
  UserSettings, 
  SubjectPreference, 
  ShortcutItem, 
  setDynamicSubjects,
  deduplicateLogs,
  detectDuplicateLogs
} from '../types';
import { sound } from '../utils/sound';
import { nanoid } from 'nanoid';

// Enum and interface from firebase-integration skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Deep clean undefined fields to prevent Firestore setDoc/updateDoc from failing
export function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item)) as any;
  }
  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      const val = (obj as any)[key];
      if (val !== undefined) {
        newObj[key] = cleanUndefined(val);
      }
    }
    return newObj;
  }
  return obj;
}

// Clean up only obsolete legacy archive key; preserve local logs/plans until safely synced to Firestore
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.removeItem('axion_archive');
  }
} catch (e) {
  console.error("Failed to clean legacy localStorage key:", e);
}

// Global Toast Emitter (Silences database/sync jargon popups per strict UX policy)
export function showToast(message: string, type: 'success' | 'error') {
  if (!message) return;
  const lower = message.toLowerCase();
  if (
    lower.includes('firestore') ||
    lower.includes('synced') ||
    lower.includes('saved') ||
    lower.includes('cloud') ||
    lower.includes('cached') ||
    lower.includes('queued') ||
    lower.includes('deleted') ||
    lower.includes('removed') ||
    lower.includes('added')
  ) {
    return;
  }
  window.dispatchEvent(new CustomEvent('axion-toast', { detail: { message, type } }));
}

export async function saveStudyLog(log: LogItem): Promise<void> {
  const logId = log.id || nanoid();
  const cleanLog = { ...log, id: logId, timestamp: log.timestamp || Date.now() };

  // Save to Firestore silently if user is active
  if (auth.currentUser) {
    if (!navigator.onLine) {
      sound.playClick();
      return;
    }
    const uid = auth.currentUser.uid;
    const path = `users/${uid}/logs/${logId}`;
    try {
      const docRef = doc(db, 'users', uid, 'logs', logId);
      await setDoc(docRef, cleanUndefined(cleanLog), { merge: true });
      sound.playChime();
    } catch (error: any) {
      sound.playError();
      try {
        handleFirestoreError(error, OperationType.WRITE, path);
      } catch (errInfo) {
        console.warn("Handled Firestore write exception in saveStudyLog:", errInfo);
      }
    }
  } else {
    try {
      const existingStr = localStorage.getItem('axion_local_logs');
      const existing: LogItem[] = existingStr ? JSON.parse(existingStr) : [];
      const updated = deduplicateLogs([cleanLog, ...existing]);
      localStorage.setItem('axion_local_logs', JSON.stringify(updated));
      localStorage.removeItem('migrated_to_firebase');
    } catch (e) {
      console.warn("Local log cache notice:", e);
    }
    sound.playClick();
  }
}

export async function saveStudyLogsBatch(logs: LogItem[]): Promise<void> {
  if (!logs || logs.length === 0) return;
  if (auth.currentUser) {
    if (!navigator.onLine) {
      return;
    }
    const uid = auth.currentUser.uid;
    try {
      const batch = writeBatch(db);
      for (const log of logs) {
        const logId = log.id || nanoid();
        const cleanLog = { ...log, id: logId, timestamp: log.timestamp || Date.now() };
        const docRef = doc(db, 'users', uid, 'logs', logId);
        batch.set(docRef, cleanUndefined(cleanLog), { merge: true });
      }
      await batch.commit();
      sound.playChime();
    } catch (error: any) {
      console.warn("Firestore batch write failed, falling back to sequential writes:", error);
      for (const log of logs) {
        await saveStudyLog(log);
      }
    }
  } else {
    try {
      const existingStr = localStorage.getItem('axion_local_logs');
      const existing: LogItem[] = existingStr ? JSON.parse(existingStr) : [];
      const cleanedBatch = logs.map(log => ({ ...log, id: log.id || nanoid(), timestamp: log.timestamp || Date.now() }));
      const updated = deduplicateLogs([...cleanedBatch, ...existing]);
      localStorage.setItem('axion_local_logs', JSON.stringify(updated));
      localStorage.removeItem('migrated_to_firebase');
    } catch (e) {
      console.warn("Local batch log cache notice:", e);
    }
  }
}

export async function getStudyLogs(limitCount = 200): Promise<LogItem[]> {
  // Query Firestore first if user is active
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    try {
      const q = query(
        collection(db, 'users', uid, 'logs'),
        orderBy('timestamp', 'desc'),
        limitQuery(limitCount)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const rawLogs = snap.docs.map(d => ({ ...(d.data() as LogItem), id: d.id }));
        return deduplicateLogs(rawLogs);
      }
    } catch (error: any) {
      console.warn("Firestore getStudyLogs fetch failed with orderBy, attempting base query:", error);
      try {
        const fallbackQ = query(
          collection(db, 'users', uid, 'logs'),
          limitQuery(limitCount)
        );
        const fallbackSnap = await getDocs(fallbackQ);
        if (!fallbackSnap.empty) {
          const rawLogs = fallbackSnap.docs.map(d => ({ ...(d.data() as LogItem), id: d.id }));
          rawLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          return deduplicateLogs(rawLogs);
        }
      } catch (fallbackErr) {
        console.warn("Firestore fallback getStudyLogs query failed:", fallbackErr);
      }
    }
  }
  try {
    const localStr = localStorage.getItem('axion_local_logs');
    if (localStr) {
      const localLogs = JSON.parse(localStr);
      if (Array.isArray(localLogs)) {
        return deduplicateLogs(localLogs).slice(0, limitCount);
      }
    }
  } catch {}
  return [];
}

/**
 * Safely inspects cloud records for duplicate session logs without destructive cleanup.
 */
export async function detectLegacyDuplicateLogs(uid?: string): Promise<{
  totalLogs: number;
  uniqueLogs: number;
  duplicateCount: number;
  duplicatePlanIds: string[];
  duplicateLogIds: string[];
}> {
  const targetUid = uid || auth.currentUser?.uid;
  if (!targetUid) {
    return { totalLogs: 0, uniqueLogs: 0, duplicateCount: 0, duplicatePlanIds: [], duplicateLogIds: [] };
  }

  try {
    const q = query(collection(db, 'users', targetUid, 'logs'), orderBy('timestamp', 'desc'), limitQuery(1000));
    const snap = await getDocs(q);
    const rawLogs = snap.docs.map(d => ({ ...(d.data() as LogItem), id: d.id }));
    const stats = detectDuplicateLogs(rawLogs);
    const deduped = deduplicateLogs(rawLogs);
    return {
      totalLogs: rawLogs.length,
      uniqueLogs: deduped.length,
      duplicateCount: stats.duplicateCount,
      duplicatePlanIds: stats.duplicatePlanIds,
      duplicateLogIds: stats.duplicateLogIds
    };
  } catch (err) {
    console.warn("detectLegacyDuplicateLogs notice:", err);
    return { totalLogs: 0, uniqueLogs: 0, duplicateCount: 0, duplicatePlanIds: [], duplicateLogIds: [] };
  }
}

export async function deleteStudyLog(logId: string): Promise<void> {
  // Emit deletion event to synchronize memory states across views immediately
  window.dispatchEvent(new CustomEvent('axion-log-deleted', { detail: { logId } }));

  try {
    const existingStr = localStorage.getItem('axion_local_logs');
    if (existingStr) {
      const existing: LogItem[] = JSON.parse(existingStr);
      localStorage.setItem('axion_local_logs', JSON.stringify(existing.filter(l => l.id !== logId)));
    }
  } catch {}

  if (auth.currentUser) {
    if (!navigator.onLine) {
      sound.playError();
      return;
    }
    const uid = auth.currentUser.uid;
    const path = `users/${uid}/logs/${logId}`;
    try {
      const docRef = doc(db, 'users', uid, 'logs', logId);
      await deleteDoc(docRef);
      sound.playClick();
    } catch (error: any) {
      sound.playError();
      try {
        handleFirestoreError(error, OperationType.DELETE, path);
      } catch (errInfo) {
        console.warn("Handled Firestore write exception in deleteStudyLog:", errInfo);
      }
    }
  } else {
    sound.playClick();
  }
}

export async function saveDailyPlan(date: string, plan: PlanItem[]): Promise<void> {
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    const path = `users/${uid}/plans/${date}`;
    try {
      const docRef = doc(db, 'users', uid, 'plans', date);
      await setDoc(docRef, cleanUndefined({ date, plan, timestamp: Date.now() }), { merge: true });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, path);
      } catch (errInfo) {
        console.warn("Handled Firestore write exception in saveDailyPlan:", errInfo);
      }
    }
  } else {
    try {
      localStorage.setItem(`axion_plan_${date}`, JSON.stringify(plan));
    } catch {}
  }
}

export interface WeeklyReflection {
  id: string;
  whatWentWell: string;
  conceptualGaps: string;
  timestamp: number;
}

export async function getWeeklyReflections(): Promise<WeeklyReflection[]> {
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    try {
      const q = query(collection(db, 'users', uid, 'refinements'), orderBy('timestamp', 'desc'), limitQuery(20));
      const snap = await getDocs(q);

      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const validReflections: WeeklyReflection[] = [];
      const batch = writeBatch(db);
      let needsCleanup = false;

      snap.docs.forEach(docSnap => {
        const data = docSnap.data() as WeeklyReflection;
        if (data.timestamp && now - data.timestamp > SEVEN_DAYS_MS) {
           batch.delete(docSnap.ref);
           needsCleanup = true;
        } else {
           validReflections.push(data);
        }
      });

      if (needsCleanup) {
         await batch.commit();
         console.log("Cleaned up weekly reflections older than 7 days.");
      }

      return validReflections;
    } catch (error: any) {
      console.warn("Firestore getWeeklyReflections failed:", error);
    }
  }
  return [];
}

export async function getDailyPlan(date: string): Promise<PlanItem[]> {
  const planMap = new Map<string, PlanItem>();

  // Query Firestore if active
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    try {
      const docRef = doc(db, 'users', uid, 'plans', date);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.plan)) {
          data.plan.forEach((p: PlanItem) => p.id && planMap.set(p.id, p));
          return Array.from(planMap.values());
        }
      }
    } catch (error) {
      console.warn("Firestore getDailyPlan notice:", error);
    }
  }

  try {
    const localStr = localStorage.getItem(`axion_plan_${date}`) || localStorage.getItem(`pcbm_plan_${date}`);
    if (localStr) {
      const parsed = JSON.parse(localStr);
      if (Array.isArray(parsed)) {
        parsed.forEach((p: PlanItem) => p?.id && planMap.set(p.id, p));
        return Array.from(planMap.values());
      }
    }
  } catch {}

  return [];
}

export async function deleteDailyPlanItem(date: string, planId: string): Promise<boolean> {
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    const path = `users/${uid}/plans/${date}`;
    try {
      const docRef = doc(db, 'users', uid, 'plans', date);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.plan)) {
          const currentPlan: PlanItem[] = data.plan;
          const filtered = currentPlan.filter(p => p.id !== planId);
          if (filtered.length !== currentPlan.length) {
            await setDoc(docRef, cleanUndefined({ date, plan: filtered, timestamp: Date.now() }), { merge: true });
            window.dispatchEvent(new CustomEvent('axion-plan-deleted', { detail: { date, planId } }));
            return true;
          }
        }
      }
    } catch (error) {
      console.warn("deleteDailyPlanItem error:", error);
    }
  }
  return false;
}

export async function getPlansForDateRange(startDate: string, endDate: string): Promise<Record<string, PlanItem[]>> {
  const result: Record<string, PlanItem[]> = {};
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    try {
      const q = query(
        collection(db, 'users', uid, 'plans'),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        snap.docs.forEach(d => {
          const data = d.data();
          if (data && data.date && Array.isArray(data.plan)) {
            result[data.date] = data.plan;
          }
        });
      }
    } catch (error) {
      console.warn("getPlansForDateRange error:", error);
    }
  }
  return result;
}

export async function getShortcuts(): Promise<ShortcutItem[]> {
  const defaultShortcuts: ShortcutItem[] = [
    { id: 'sc-1', label: 'Summarize Today', symbol: '📊', promptTemplate: "Summarize today's progress and focus efficiency.", prompt: "Summarize today's progress and focus efficiency.", order: 0 },
    { id: 'sc-2', label: 'Focus Advice', symbol: '🎯', promptTemplate: "What subject needs the most attention?", prompt: "What subject needs the most attention?", order: 1 },
    { id: 'sc-3', label: 'Plan Tomorrow', symbol: '📅', promptTemplate: "Plan 3 focused revision sessions for tomorrow.", prompt: "Plan 3 focused revision sessions for tomorrow.", order: 2 },
    { id: 'sc-4', label: 'Log Session', symbol: '📝', promptTemplate: 'Log 45 min Physics Study session on "Work, Energy and Power"', prompt: 'Log 45 min Physics Study session on "Work, Energy and Power"', order: 3 }
  ];

  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    try {
      const docRef = doc(db, 'users', uid, 'settings', 'shortcuts');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.shortcuts) && data.shortcuts.length > 0) {
          return data.shortcuts as ShortcutItem[];
        }
      }
    } catch (err) {
      console.warn("getShortcuts from firestore failed:", err);
    }
  }

  // Local fallback
  try {
    const local = localStorage.getItem('axion_shortcuts');
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  return defaultShortcuts;
}

export async function saveAllShortcuts(shortcuts: ShortcutItem[]): Promise<void> {
  try {
    localStorage.setItem('axion_shortcuts', JSON.stringify(shortcuts));
  } catch {}

  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    try {
      const docRef = doc(db, 'users', uid, 'settings', 'shortcuts');
      await setDoc(docRef, cleanUndefined({ shortcuts, updatedAt: Date.now() }), { merge: true });
    } catch (err) {
      console.warn("saveAllShortcuts failed:", err);
    }
  }
}

export async function saveShortcut(shortcut: ShortcutItem): Promise<void> {
  const current = await getShortcuts();
  const existingIdx = current.findIndex(s => s.id === shortcut.id);
  let updated: ShortcutItem[];
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = shortcut;
  } else {
    updated = [...current, shortcut];
  }
  await saveAllShortcuts(updated);
}

export async function deleteShortcut(shortcutId: string): Promise<void> {
  const current = await getShortcuts();
  const updated = current.filter(s => s.id !== shortcutId);
  await saveAllShortcuts(updated);
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  // 1. Save locally
  try {
    localStorage.setItem('pcbm_settings', JSON.stringify(settings));
  } catch (err) {
    console.error("Local saveUserSettings failed:", err);
  }

  // 2. Save to Firestore
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    const path = `users/${uid}/settings/default`;
    try {
      const docRef = doc(db, 'users', uid, 'settings', 'default');
      await setDoc(docRef, cleanUndefined({ ...settings, updatedAt: Date.now() }), { merge: true });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, path);
      } catch (errInfo) {
        console.warn("Handled Firestore write exception in saveUserSettings:", errInfo);
      }
    }
  }
}

export async function getUserSettings(): Promise<UserSettings | null> {
  // 1. Try Firestore first
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    const path = `users/${uid}/settings/default`;
    try {
      const docRef = doc(db, 'users', uid, 'settings', 'default');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as UserSettings;
      }
    } catch (error) {
      console.warn("Firestore getUserSettings fetch failed, falling back:", error);
    }
  }

  // 2. Local fallback
  const localStr = localStorage.getItem('pcbm_settings');
  try { return localStr ? JSON.parse(localStr) : null; } catch { return null; }
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export async function saveChatMessage(role: 'user' | 'model', content: string): Promise<ChatMessage> {
  const msg: ChatMessage = {
    id: nanoid(),
    role,
    content,
    timestamp: Date.now()
  };

  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    const path = `users/${uid}/chats/${msg.id}`;
    try {
      const docRef = doc(db, 'users', uid, 'chats', msg.id);
      await setDoc(docRef, cleanUndefined(msg));
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, path);
      } catch (errInfo) {
        console.warn("Handled Firestore write exception in saveChatMessage:", errInfo);
      }
    }
  }

  return msg;
}

export async function getChatHistory(limitCount = 50): Promise<ChatMessage[]> {
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    const path = `users/${uid}/chats`;
    try {
      const q = query(collection(db, 'users', uid, 'chats'), orderBy('timestamp', 'asc'), limitQuery(limitCount));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map(d => d.data() as ChatMessage);
      }
    } catch (error) {
      console.warn("Firestore getChatHistory fetch failed:", error);
    }
  }

  return [];
}

// One-Time LocalStorage Hydration Bridge
export async function migrateLocalLogsToFirestore(uid: string): Promise<{ success: boolean; count: number }> {
  const localLogsStr = localStorage.getItem("axion_local_logs");
  const isMigrated = localStorage.getItem("migrated_to_firebase");
  if (localLogsStr && isMigrated !== "true") {
    try {
      const logs: LogItem[] = JSON.parse(localLogsStr);
      if (Array.isArray(logs) && logs.length > 0) {
        const batch = writeBatch(db);
        logs.forEach(log => {
          const logId = log.id || nanoid();
          const docRef = doc(db, 'users', uid, 'logs', logId);
          const cleanLog = cleanUndefined({ ...log, id: logId, timestamp: log.timestamp || Date.now() });
          batch.set(docRef, cleanLog, { merge: true });
        });
        await batch.commit();
        showToast("Local logs successfully migrated to Cloud Firestore!", "success");
        sound.playChime();
        localStorage.setItem("migrated_to_firebase", "true");
        localStorage.removeItem("axion_local_logs");
        return { success: true, count: logs.length };
      }
    } catch (err: any) {
      console.error("Migration batch failed:", err);
      showToast(`Migration Error: ${err.message || err}`, "error");
    }
  }
  return { success: false, count: 0 };
}

export async function migrateLocalStorageToFirestore(uid?: string): Promise<{ success: boolean; count: number }> {
  const activeUid = uid || auth.currentUser?.uid;
  if (!activeUid) return { success: false, count: 0 };

  let count = 0;
  try {
    if (!db) {
      return { success: false, count: 0 };
    }

    // 1. Settings: Only migrate local settings if cloud settings do NOT already exist or have empty identity fields
    const savedSettings = localStorage.getItem('pcbm_settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings) as UserSettings;
        const settingsDocRef = doc(db, 'users', activeUid, 'settings', 'default');
        const cloudSnap = await getDoc(settingsDocRef);
        if (!cloudSnap.exists()) {
          if (parsed.name || parsed.className || (parsed.subjectPageTotals && Object.keys(parsed.subjectPageTotals).length > 0)) {
            await setDoc(settingsDocRef, cleanUndefined({ ...parsed, updatedAt: Date.now() }), { merge: true });
            count++;
          }
        }
      } catch {}
    }

    // 2. Logs from date keys
    const logKeysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('axion_logs_') || key.startsWith('pcbm_log_'))) {
        try {
          const logs = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(logs)) {
            for (const item of logs) {
              if (item && item.topic) {
                const logId = item.id || nanoid();
                const docRef = doc(db, 'users', activeUid, 'logs', logId);
                await setDoc(docRef, cleanUndefined({ ...item, id: logId, timestamp: item.timestamp || Date.now() }), { merge: true });
                count++;
              }
            }
          }
          logKeysToRemove.push(key);
        } catch {}
      }
    }
    logKeysToRemove.forEach(k => localStorage.removeItem(k));

    // 3. Plans from date keys: merge with existing cloud plan items so cloud plans are never overwritten
    const planKeysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('pcbm_plan_') || key.startsWith('axion_plan_'))) {
        const date = key.replace('pcbm_plan_', '').replace('axion_plan_', '');
        try {
          const localPlan: PlanItem[] = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(localPlan) && localPlan.length > 0) {
            const planDocRef = doc(db, 'users', activeUid, 'plans', date);
            const cloudSnap = await getDoc(planDocRef);
            const mergedMap = new Map<string, PlanItem>();
            if (cloudSnap.exists()) {
              const cloudData = cloudSnap.data();
              if (Array.isArray(cloudData.plan)) {
                cloudData.plan.forEach((p: PlanItem) => p?.id && mergedMap.set(p.id, p));
              }
            }
            localPlan.forEach((p: PlanItem) => {
              if (p?.id && !p.isScheduledRevision && !mergedMap.has(p.id)) {
                mergedMap.set(p.id, p);
              }
            });
            await setDoc(planDocRef, cleanUndefined({ date, plan: Array.from(mergedMap.values()), timestamp: Date.now() }), { merge: true });
            count++;
          }
          planKeysToRemove.push(key);
        } catch {}
      }
    }
    planKeysToRemove.forEach(k => localStorage.removeItem(k));

    sound.playSuccess();
    return { success: true, count };
  } catch (e) {
    console.error('Migration error:', e);
    return { success: false, count };
  }
}

export async function saveSubjectPreferences(subjects: SubjectPreference[]): Promise<void> {
  // 1. Save locally
  try {
    localStorage.setItem('axion_subject_preferences', JSON.stringify(subjects));
    setDynamicSubjects(subjects);
  } catch (err) {
    console.error("Local saveSubjectPreferences failed:", err);
  }

  // 2. Save to Firestore under users/{uid}/settings/subjects and preferences
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    try {
      const subjectsRef = doc(db, 'users', uid, 'settings', 'subjects');
      await setDoc(subjectsRef, { subjects, updatedAt: Date.now() }, { merge: true });
      const docRef = doc(db, 'users', uid, 'settings', 'preferences');
      await setDoc(docRef, { subjects, updatedAt: Date.now() }, { merge: true });
    } catch (error) {
      console.warn("Firestore saveSubjectPreferences failed:", error);
    }
  }
}

export async function getSubjectPreferences(): Promise<SubjectPreference[] | null> {
  // 1. Try Firestore first (users/{uid}/settings/subjects then preferences)
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    try {
      const subjectsRef = doc(db, 'users', uid, 'settings', 'subjects');
      const subjectsSnap = await getDoc(subjectsRef);
      if (subjectsSnap.exists()) {
        const sData = subjectsSnap.data();
        if (sData && Array.isArray(sData.subjects)) {
          setDynamicSubjects(sData.subjects);
          return sData.subjects as SubjectPreference[];
        }
      }

      const docRef = doc(db, 'users', uid, 'settings', 'preferences');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data && Array.isArray(data.subjects)) {
          setDynamicSubjects(data.subjects);
          return data.subjects as SubjectPreference[];
        }
      }
    } catch (error) {
      console.warn("Firestore getSubjectPreferences failed, falling back:", error);
    }
  }

  // 2. Local fallback
  const localStr = localStorage.getItem('axion_subject_preferences');
  try {
    if (localStr) {
      const arr = JSON.parse(localStr);
      if (Array.isArray(arr)) {
        setDynamicSubjects(arr);
        return arr as SubjectPreference[];
      }
    }
  } catch {}

  return null;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export async function saveWeeklyReflection(reflection: { whatWentWell: string; conceptualGaps: string }): Promise<void> {
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    const refId = nanoid();
    const path = `users/${uid}/refinements/${refId}`;
    try {
      const docRef = doc(db, 'users', uid, 'refinements', refId);
      await setDoc(docRef, cleanUndefined({
        id: refId,
        whatWentWell: reflection.whatWentWell,
        conceptualGaps: reflection.conceptualGaps,
        timestamp: Date.now()
      }));
      showToast("Reflection saved to Cloud!", "success");
    } catch (error: any) {
      console.warn("Firestore saveWeeklyReflection failed:", error);
      showToast(`Firestore Error: ${error.message || error}`, "error");
    }
  }
}

export async function savePreparationChecklist(checklist: ChecklistItem[]): Promise<void> {
  // Save locally
  try {
    localStorage.setItem('axion_weekly_checklist', JSON.stringify(checklist));
  } catch (err) {
    console.error("Local savePreparationChecklist failed:", err);
  }

  // Save to Firestore
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    try {
      const docRef = doc(db, 'users', uid, 'settings', 'checklist');
      await setDoc(docRef, { checklist, updatedAt: Date.now() });
    } catch (error) {
      console.warn("Firestore savePreparationChecklist failed:", error);
    }
  }
}

export async function getPreparationChecklist(): Promise<ChecklistItem[] | null> {
  // Try Firestore first
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    try {
      const docRef = doc(db, 'users', uid, 'settings', 'checklist');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data && Array.isArray(data.checklist)) {
          return data.checklist as ChecklistItem[];
        }
      }
    } catch (error) {
      console.warn("Firestore getPreparationChecklist failed, falling back:", error);
    }
  }

  // Local fallback
  const localStr = localStorage.getItem('axion_weekly_checklist');
  try {
    if (localStr) {
      const arr = JSON.parse(localStr);
      if (Array.isArray(arr)) {
        return arr as ChecklistItem[];
      }
    }
  } catch {}

  return null;
}

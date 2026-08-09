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
  writeBatch 
} from '../firebase';
import { LogItem, PlanItem, UserSettings, SubjectPreference, setDynamicSubjects } from '../types';
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

// Automatic cleanup of legacy historical data from localStorage to prevent storage crashes
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('axion_logs_') || 
        key.startsWith('pcbm_log_') || 
        key === 'axion_local_logs' || 
        key.startsWith('axion_plan_') || 
        key.startsWith('pcbm_plan_') || 
        key === 'axion_chat_history' ||
        key === 'axion_plans' ||
        key === 'axion_logs' ||
        key === 'axion_settings' ||
        key === 'axion_archive'
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }
} catch (e) {
  console.error("Failed to clean legacy localStorage logs:", e);
}

// Global Toast Emitter
export function showToast(message: string, type: 'success' | 'error') {
  window.dispatchEvent(new CustomEvent('axion-toast', { detail: { message, type } }));
}

export async function saveStudyLog(log: LogItem): Promise<void> {
  const logId = log.id || nanoid();
  const cleanLog = { ...log, id: logId, timestamp: log.timestamp || Date.now() };

  // Save to Firestore if user is active (No persistent log caching in localStorage)
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    const path = `users/${uid}/logs/${logId}`;
    try {
      const docRef = doc(db, 'users', uid, 'logs', logId);
      await setDoc(docRef, cleanUndefined(cleanLog), { merge: true });
      showToast("Synced to Cloud Firestore!", "success");
      sound.playChime();
    } catch (error: any) {
      showToast(`Firestore Error: ${error.message || error}`, "error");
      sound.playError();
      try {
        handleFirestoreError(error, OperationType.WRITE, path);
      } catch (errInfo) {
        console.warn("Handled Firestore write exception in saveStudyLog:", errInfo);
      }
    }
  } else {
    console.log("Firestore sync skipped: user not authenticated.");
  }
}

export async function getStudyLogs(limitCount = 20): Promise<LogItem[]> {
  // Query Firestore first if user is active
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    const path = `users/${uid}/logs`;
    try {
      const q = query(
        collection(db, 'users', uid, 'logs'),
        orderBy('timestamp', 'desc'),
        limitQuery(limitCount)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map(d => d.data() as LogItem);
      }
    } catch (error: any) {
      console.warn("Firestore getStudyLogs fetch failed:", error);
    }
  }
  return [];
}

export async function saveDailyPlan(date: string, plan: PlanItem[]): Promise<void> {
  // Save to Firestore (No persistent caching in localStorage to follow zero-bloat strategy)
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
    const path = `users/${uid}/plans/${date}`;
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

  return [];
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

    // 1. Settings
    const savedSettings = localStorage.getItem('pcbm_settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        await saveUserSettings(parsed);
        count++;
      } catch {}
    }

    // 2. Logs from date keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('axion_logs_') || key.startsWith('pcbm_log_'))) {
        try {
          const logs = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(logs)) {
            for (const item of logs) {
              if (item && item.topic) {
                await saveStudyLog(item);
                count++;
              }
            }
          }
        } catch {}
      }
    }

    // 3. Plans from date keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('pcbm_plan_') || key.startsWith('axion_plan_'))) {
        const date = key.replace('pcbm_plan_', '').replace('axion_plan_', '');
        try {
          const plan = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(plan)) {
            await saveDailyPlan(date, plan);
            count++;
          }
        } catch {}
      }
    }

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

  // 2. Save to Firestore
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    try {
      const docRef = doc(db, 'users', uid, 'settings', 'preferences');
      await setDoc(docRef, { subjects, updatedAt: Date.now() }, { merge: true });
    } catch (error) {
      console.warn("Firestore saveSubjectPreferences failed:", error);
    }
  }
}

export async function getSubjectPreferences(): Promise<SubjectPreference[] | null> {
  // 1. Try Firestore first
  if (auth.currentUser) {
    const uid = auth.currentUser.uid;
    try {
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

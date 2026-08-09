import { audioManager } from "./lib/audio";
import { ensureValidToken } from './lib/auth';
import React, { useState, useEffect, useLayoutEffect } from 'react';
import { PlanItem, LogItem, UserSettings, getLocalDateString, getFocusScore, getSubjectConfig } from './types';
import CommandView from './components/CommandView';
import ArchiveView from './components/ArchiveView';
import AccountView from './components/AccountView';
import AnalysisView from './components/AnalysisView';
import SettingsView from './components/SettingsView';
import SundayReviewView from './components/SundayReviewView';
import Sidebar from './components/Sidebar';
import Chatbot from './components/Chatbot';
import { nanoid } from 'nanoid';
import { auth, onAuthStateChanged } from './firebase';
import { 
  getDailyPlan, 
  saveDailyPlan, 
  getStudyLogs, 
  saveStudyLog, 
  getUserSettings, 
  saveUserSettings, 
  migrateLocalStorageToFirestore,
  migrateLocalLogsToFirestore,
  getSubjectPreferences,
  showToast
} from './services/dbService';

interface AnimatedCounterProps {
  value: number;
  suffix?: string;
  duration?: number;
}

function AnimatedCounter({ value, suffix = '', duration = 1000 }: AnimatedCounterProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (value <= 0) {
      setCount(0);
      return;
    }
    const end = value;
    const totalFrames = 60;
    const stepTime = duration / totalFrames;
    let frame = 0;

    const timer = setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      const easeVal = progress * (2 - progress);
      const current = Math.round(easeVal * end);
      setCount(current);

      if (frame >= totalFrames) {
        setCount(end);
        clearInterval(timer);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [value, duration]);

  return <span>{count}{suffix}</span>;
}

function getClosestGoogleCalendarColorId(hexColor: string): string {
  let hex = hexColor.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;

  const googleColors = [
    { id: '1', r: 164, g: 189, b: 252 }, // Lavender
    { id: '2', r: 122, g: 231, b: 191 }, // Sage
    { id: '3', r: 219, g: 173, b: 255 }, // Grape
    { id: '4', r: 255, g: 136, b: 124 }, // Flamingo
    { id: '5', r: 251, g: 215, b: 91 },  // Banana
    { id: '6', r: 255, g: 184, b: 120 }, // Tangerine
    { id: '7', r: 70,  g: 214, b: 219 }, // Peacock
    { id: '8', r: 225, g: 225, b: 225 }, // Graphite
    { id: '9', r: 84,  g: 132, b: 237 }, // Blueberry
    { id: '10', r: 81, g: 183, b: 73 },  // Basil
    { id: '11', r: 220, g: 33,  b: 39 },  // Tomato
  ];

  let closestId = '9';
  let minDistance = Infinity;

  for (const gc of googleColors) {
    const distance = Math.sqrt(
      Math.pow(r - gc.r, 2) +
      Math.pow(g - gc.g, 2) +
      Math.pow(b - gc.b, 2)
    );
    if (distance < minDistance) {
      minDistance = distance;
      closestId = gc.id;
    }
  }

  return closestId;
}

export default function App() {
  const [currentTab, setCurrentTab] = useState('command');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeDate] = useState(() => getLocalDateString(0));
  const [morningPlan, setMorningPlan] = useState<PlanItem[]>([]);
  const [loggedSessions, setLoggedSessions] = useState<LogItem[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>({
      name: '',
      className: '',
      activeSubjects: ['bio', 'phys', 'chem', 'math'],
      subjectGoals: {},
      subjectPageTotals: {},
      uiSounds: localStorage.getItem('axion_ui_sounds') !== 'false'
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const [profileImg, setProfileImg] = useState<string | null>(null);

  // Core Glass Styling Depth States
  const [glassBlur, setGlassBlur] = useState(24);
  const [glassOpacity, setGlassOpacity] = useState(0.00);
  const [panelOpacity, setPanelOpacity] = useState(0.55);

  // Victory screen celebration modal state
  const [victoryData, setVictoryData] = useState<{
    focusTime: number;
    pagesCovered: number;
    questionsSolved: number;
    quote: string;
  } | null>(null);

  // Progressive Web Application (PWA) Service Worker Registration
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(() => console.log("Axion PWA Installed"))
          .catch((err) => console.error("PWA Setup Halted", err));
      });
    }
  }, []);

  // Premium Tactile Audio Feedback Loop
  useEffect(() => {
    audioManager.enabled = userSettings.uiSounds !== false;

    const handleGlobalClick = (e: MouseEvent) => {
      let target = e.target as HTMLElement | null;
      while (target && target !== document.body) {
        if (target.tagName === 'BUTTON') {
          audioManager.playSuccess();
          break;
        }
        target = target.parentElement;
      }
    };

    document.addEventListener('click', handleGlobalClick);
    return () => {
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [userSettings.uiSounds]);

  // Fixed Wallpaper Engine Loading Cycles & Glass Styles
  useLayoutEffect(() => {
    const customUrl = localStorage.getItem('custom_wallpaper_url');
    const customColor = localStorage.getItem('custom_wallpaper_color');
    const savedBlur = localStorage.getItem('ios_glass_blur');
    const savedOpacity = localStorage.getItem('ios_glass_opacity');
    const savedPanelOpacity = localStorage.getItem('ios_panel_opacity');
    
    if (savedBlur) setGlassBlur(Number(savedBlur));
    if (savedOpacity) setGlassOpacity(Number(savedOpacity));
    if (savedPanelOpacity) setPanelOpacity(Number(savedPanelOpacity));

    const root = document.documentElement;
    if (!root) return;
    
    if (customUrl) {
       root.style.setProperty('--wallpaper-url', `url("${customUrl}")`);
    } else {
       root.style.setProperty('--wallpaper-url', 'radial-gradient(circle at top left, #1e1b4b 0%, #0a0f18 100%)');
    }
    
    root.style.setProperty('--theme-primary', customColor || '#10B981');
    root.style.setProperty('--glass-blur', `${savedBlur ? Number(savedBlur) : 24}px`);
    root.style.setProperty('--wallpaper-dim', savedOpacity ? String(savedOpacity) : '0.00');
    root.style.setProperty('--panel-opacity', savedPanelOpacity ? String(savedPanelOpacity) : '0.55');
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const root = document.documentElement;
    if (!root) return;
    root.style.setProperty('--glass-blur', `${glassBlur}px`);
    root.style.setProperty('--wallpaper-dim', String(glassOpacity));
    root.style.setProperty('--panel-opacity', String(panelOpacity));
    localStorage.setItem('ios_glass_blur', String(glassBlur));
    localStorage.setItem('ios_glass_opacity', String(glassOpacity));
    localStorage.setItem('ios_panel_opacity', String(panelOpacity));
  }, [glassBlur, glassOpacity, panelOpacity, isLoaded]);

  const [currentUser, setCurrentUser] = useState<any>(undefined);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Global Toast event handler
  useEffect(() => {
    const handleToast = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.message) {
        setToast({ message: detail.message, type: detail.type });
        const timer = setTimeout(() => {
          setToast(null);
        }, 4000);
        return () => clearTimeout(timer);
      }
    };
    window.addEventListener('axion-toast', handleToast);
    return () => window.removeEventListener('axion-toast', handleToast);
  }, []);

  // Firebase Auth State Listener & LocalStorage Hydration Bridge
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user || null);
      if (user) {
        console.log("Firebase Auth persistently synced. UID:", user.uid);
        try {
          // One-time LocalStorage hydration check
          const localLogs = localStorage.getItem("axion_local_logs");
          const migrated = localStorage.getItem("migrated_to_firebase");
          if (localLogs && migrated !== "true") {
            await migrateLocalLogsToFirestore(user.uid);
          }

          // Auto-migration for fallback keys
          if (!localStorage.getItem('axion_firebase_migrated')) {
            await migrateLocalStorageToFirestore(user.uid);
            localStorage.setItem('axion_firebase_migrated', 'true');
          }
        } catch (err) {
          console.warn("Auth migration notice:", err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Synchronized Firestore + Local Storage Load Engine
  useEffect(() => {
    if (currentUser === undefined) return;

    async function initializeData() {
      try {
        const savedProfile = localStorage.getItem('gcal_profile');
        if (savedProfile) {
          try {
            const parsedProfile = JSON.parse(savedProfile);
            if (parsedProfile?.picture) setProfileImg(parsedProfile.picture);
          } catch {}
        }

        // Load custom subject preferences
        try {
          await getSubjectPreferences();
        } catch (err) {
          console.warn("getSubjectPreferences failed during hydration:", err);
        }

        // 1. Fetch user settings with error guard
        let settings = null;
        try {
          settings = await getUserSettings();
        } catch (err) {
          console.warn("getUserSettings failed during hydration, falling back to local:", err);
        }

        if (settings) {
          setUserSettings({
            name: settings.name || '',
            className: settings.className || '',
            activeSubjects: Array.isArray(settings.activeSubjects) ? settings.activeSubjects : ['bio', 'phys', 'chem', 'math'],
            subjectGoals: settings.subjectGoals || {},
            subjectPageTotals: settings.subjectPageTotals || {},
            uiSounds: settings.uiSounds !== undefined ? settings.uiSounds : (localStorage.getItem('axion_ui_sounds') !== 'false')
          });
        }

        // 2. Fetch daily plan with error guard
        let plan: PlanItem[] = [];
        try {
          plan = await getDailyPlan(activeDate);
        } catch (err) {
          console.warn("getDailyPlan failed during hydration, falling back to local:", err);
        }

        // Automated Spaced Repetition (SR) Injection
        const todayStr = getLocalDateString(0);
        const tomorrowStr = getLocalDateString(1);
        
        let allLogs: LogItem[] = [];
        try {
          allLogs = await getStudyLogs();
        } catch (err) {
          console.warn("getStudyLogs failed during hydration, falling back to local:", err);
        }
        
        allLogs.forEach(log => {
          if (log.nextReviewDate && (log.nextReviewDate === todayStr || log.nextReviewDate === tomorrowStr)) {
            const alreadyExists = plan.some(p => p.topic === log.topic && p.subject === log.subject);
            if (!alreadyExists) {
              plan.push({
                id: nanoid(),
                timestamp: Date.now(),
                subject: log.subject,
                topic: log.topic,
                sessionType: 'Revise',
                targetMins: 30,
                status: 'pending'
              });
            }
          }
        });

        setMorningPlan(plan);
        setLoggedSessions(allLogs);
      } catch (e) {
        console.error("Data load error:", e);
      } finally {
        setIsLoaded(true);
      }
    }

    initializeData();
  }, [activeDate, currentUser]);

  // Persistence Hook
  useEffect(() => {
    if (!isLoaded) return;

    let isCancelled = false;

    async function persistData() {
      try {
        await saveDailyPlan(activeDate, morningPlan);
      } catch (err) {
        console.log("saveDailyPlan deferred or handled quietly:", err);
      }

      if (isCancelled) return;

      try {
        await saveUserSettings(userSettings);
      } catch (err) {
        console.log("saveUserSettings deferred or handled quietly:", err);
      }
    }

    persistData();

    return () => {
      isCancelled = true;
    };
  }, [morningPlan, userSettings, isLoaded, activeDate]);

  const [isSyncing, setIsSyncing] = useState(false);

  const syncDailyBlocksToCalendar = async (todayLogs: LogItem[]) => {
    const token = await ensureValidToken();
    if (!token) {
      throw new Error("Google Calendar authentication token is missing or expired.");
    }

    const todayDate = getLocalDateString(0);

    // Group logs by sessionType
    const studyLogs = todayLogs.filter(l => !l.isMissed && l.sessionType === 'Study');
    const practiceLogs = todayLogs.filter(l => !l.isMissed && l.sessionType === 'Exercise');
    const reviseLogs = todayLogs.filter(l => !l.isMissed && l.sessionType === 'Revise');
    const missedLogs = todayLogs.filter(l => l.isMissed);

    // Sync today's blocks
    const syncBlock = async (type: 'Study' | 'Practice' | 'Revise', logs: LogItem[], colorId: string) => {
      if (logs.length === 0) return;

      const hash = `pcbm_${type.toLowerCase()}_${todayDate}`;
      const title = `[${type}] Daily ${type === 'Study' ? 'Study' : type === 'Practice' ? 'Practice' : 'Revision'} Block`;

      // Build rich description
      let description = `=== DAILY COMPOSITE BLOCK: ${type.toUpperCase()} ===\n\n`;
      logs.forEach(log => {
        const subjectName = getSubjectConfig(log.subject).name;
        description += `• Subject: ${subjectName}\n`;
        description += `  - Topic: ${log.topic}\n`;
        if (log.chapter) {
          description += `  - Chapter: ${log.chapter}\n`;
        }
        if (log.mcqCount !== undefined) {
          description += `  - MCQs Completed: ${log.mcqCount}\n`;
        }
        if (log.startPage !== undefined && log.endPage !== undefined && log.endPage > log.startPage) {
          description += `  - Pages: ${log.startPage} - ${log.endPage}\n`;
        }
        if (log.activeMins) {
          description += `  - Active Mins: ${log.activeMins}\n`;
        }
        if (log.retentionScore !== undefined) {
          description += `  - Retention Level: ${log.retentionScore}/10\n`;
        }
        if (log.notes) {
          description += `  - Notes: ${log.notes}\n`;
        }
        description += `\n`;
      });

      const totalMins = logs.reduce((acc, l) => acc + (l.activeMins || 0), 0);
      description += `Total Active Time: ${totalMins} minutes\n`;

      // Check if event already exists
      let existingEvent: any = null;
      try {
        const queryParam = encodeURIComponent(`pcbmHash=${hash}`);
        const listRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=${queryParam}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          if (listData.items && listData.items.length > 0) {
            existingEvent = listData.items[0];
          }
        }
      } catch (e) {
        console.error("Failed to query existing calendar event:", e);
      }

      if (existingEvent) {
        // PATCH existing event
        const patchRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingEvent.id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            summary: title,
            description: description,
            colorId: colorId
          })
        });
        if (!patchRes.ok) throw new Error(`PATCH failed for ${hash}`);
      } else {
        // POST new event
        const endStr = getLocalDateString(1);
        const postRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            summary: title,
            description: description,
            start: { date: todayDate },
            end: { date: endStr },
            colorId: colorId,
            extendedProperties: {
              private: { pcbmHash: hash }
            }
          })
        });
        if (!postRes.ok) throw new Error(`POST failed for ${hash}`);
      }
    };

    // Today's study, practice, and revise blocks
    const studyColorId = studyLogs.length > 0 ? getClosestGoogleCalendarColorId(getSubjectConfig(studyLogs[0].subject).color) : '9';
    const practiceColorId = practiceLogs.length > 0 ? getClosestGoogleCalendarColorId(getSubjectConfig(practiceLogs[0].subject).color) : '6';
    const reviseColorId = reviseLogs.length > 0 ? getClosestGoogleCalendarColorId(getSubjectConfig(reviseLogs[0].subject).color) : '10';

    await syncBlock('Study', studyLogs, studyColorId);
    await syncBlock('Practice', practiceLogs, practiceColorId);
    await syncBlock('Revise', reviseLogs, reviseColorId);

    // Missed blocks
    if (missedLogs.length > 0) {
      await syncBlock('Revise', missedLogs, '11');
    }

    // Spaced Repetition (SR) 3-Interval Escalation Engine
    // For each studied topic, schedule revision at +1, +7, +28 days
    if (studyLogs.length > 0) {
      const intervals = [
        { offset: 1, label: 'Day +1' },
        { offset: 7, label: 'Day +7' },
        { offset: 28, label: 'Day +28' }
      ];

      for (const interval of intervals) {
        const targetDate = getLocalDateString(interval.offset);
        const targetHash = `pcbm_revise_${targetDate}`;

        // Construct revision content to append
        let srContent = `\nScheduled Spaced Repetition Revision (${interval.label}) for topics studied on ${todayDate}:\n`;
        studyLogs.forEach(log => {
          const subjectName = getSubjectConfig(log.subject).name;
          srContent += `• [${subjectName}] ${log.topic}`;
          if (log.chapter) {
            srContent += ` (Ch. ${log.chapter})`;
          }
          if (log.mcqCount !== undefined) {
            srContent += ` (${log.mcqCount} MCQs)`;
          }
          if (log.startPage !== undefined && log.endPage !== undefined && log.endPage > log.startPage) {
            srContent += ` (Pages ${log.startPage} - ${log.endPage})`;
          }
          srContent += `\n`;
        });

        // Check if a Revision Block already exists on that target date
        let existingSrEvent: any = null;
        try {
          const queryParam = encodeURIComponent(`pcbmHash=${targetHash}`);
          const listRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=${queryParam}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (listRes.ok) {
            const listData = await listRes.json();
            if (listData.items && listData.items.length > 0) {
              existingSrEvent = listData.items[0];
            }
          }
        } catch (e) {
          console.error(`Failed to query SR event for ${targetDate}:`, e);
        }

        if (existingSrEvent) {
          // PATCH existing SR event: append the new revision details
          const updatedDescription = (existingSrEvent.description || '') + '\n' + srContent;
          const patchRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingSrEvent.id}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              description: updatedDescription
            })
          });
          if (!patchRes.ok) console.warn(`Failed to PATCH existing SR event on ${targetDate}`);
        } else {
          // POST new SR event
          const targetEndDate = getLocalDateString(interval.offset + 1);
          const srColorId = studyLogs.length > 0 ? getClosestGoogleCalendarColorId(getSubjectConfig(studyLogs[0].subject).color) : '10';
          const postRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              summary: `[Revise] Scheduled Revision Block`,
              description: `=== SCHEDULED SPACED REPETITION REVISION ===\n` + srContent,
              start: { date: targetDate },
              end: { date: targetEndDate },
              colorId: srColorId,
              extendedProperties: {
                private: { pcbmHash: targetHash }
              }
            })
          });
          if (!postRes.ok) console.warn(`Failed to POST new SR event on ${targetDate}`);
        }
      }
    }
  };

  const handleCloseDay = async () => {
    setIsSyncing(true);
    try {
      // 1. Maintain a deterministic, pure local scope for calculating missed logs
      const currentLogged = [...loggedSessions];
      const loggedPlanIds = new Set(currentLogged.map(l => l.planId).filter(Boolean));
      
      const missedLogsToSave: LogItem[] = [];

      morningPlan.forEach((plan) => {
        if (!loggedPlanIds.has(plan.id) && !currentLogged.some(l => l.planId === plan.id && l.isMissed)) {
          const missedLog: LogItem = {
            id: nanoid(),
            timestamp: Date.now(),
            planId: plan.id,
            subject: plan.subject,
            topic: plan.topic,
            sessionType: plan.sessionType,
            activeMins: 0,
            distractionMins: 0,
            recoveryMins: 0,
            notes: '',
            isMissed: true,
            synced: false
          };
          missedLogsToSave.push(missedLog);
        }
      });

      // 2. Sequentially await saveStudyLog for each constructed missed log BEFORE setting component state
      for (const missedLog of missedLogsToSave) {
        try {
          await saveStudyLog(missedLog);
        } catch (err) {
          console.warn("Failed to persist missed log to Firestore:", err);
        }
      }

      // 3. Build complete logs collection and perform state update
      const finalLogs = [...currentLogged, ...missedLogsToSave];
      
      // Determine today's logs for composite sync
      const getLogDate = (log: LogItem) => {
        if (log.timestamp) {
          return new Date(log.timestamp).toISOString().split('T')[0];
        }
        return getLocalDateString(0);
      };
      
      const todayLogs = finalLogs.filter(l => getLogDate(l) === activeDate);

      // 4. Determine Google Calendar Token Validity silently
      let calendarSyncEnabled = true;
      try {
        const token = await ensureValidToken();
        if (!token) {
          calendarSyncEnabled = false;
        }
      } catch (tokenErr) {
        console.warn("Silent ensureValidToken failed before starting loop:", tokenErr);
        calendarSyncEnabled = false;
      }

      let successCount = 0;
      let hasCalendarAuthError = !calendarSyncEnabled;

      if (calendarSyncEnabled) {
        try {
          // Sync today's blocks and future SR schedules
          await syncDailyBlocksToCalendar(todayLogs);
          
          // Mark all today's logs as synced
          todayLogs.forEach(l => {
            l.synced = true;
          });
          
          // Save updated logs back to Firestore/local storage
          for (const l of todayLogs) {
            await saveStudyLog(l);
          }
          
          successCount = todayLogs.length;
        } catch (calErr: any) {
          console.warn("Google Calendar sync failed for composite blocks:", calErr);
          hasCalendarAuthError = true;
          // Even if Google Calendar fails, ensure all logs are saved to Firestore (as unsynced)
          for (const l of todayLogs) {
            await saveStudyLog(l);
          }
        }
      } else {
        // Calendar not enabled: save today's logs directly to Firestore (unsynced)
        for (const l of todayLogs) {
          await saveStudyLog(l);
        }
      }

      setLoggedSessions([...finalLogs]);

      // Calculate celebration metrics
      const activeTodayLogs = todayLogs.filter(l => !l.isMissed);
      const missedTodayLogs = todayLogs.filter(l => l.isMissed);
      const focusTime = activeTodayLogs.reduce((acc, l) => acc + (l.activeMins || 0), 0);
      const pagesCovered = activeTodayLogs.filter(l => l.sessionType === 'Study').reduce((acc, l) => acc + (l.endPage && l.startPage ? Math.max(0, l.endPage - l.startPage) : 0), 0);
      const questionsSolved = activeTodayLogs.reduce((acc, l) => acc + (l.vsaCount || 0) + (l.saCount || 0) + (l.laCount || 0), 0);
      const missedCount = missedTodayLogs.length;
      
      let quoteFeedback = "Focus is a muscle, and you just gave it a world-class workout.";
      if (focusTime >= 120 || pagesCovered >= 25 || questionsSolved >= 20) {
        quoteFeedback = `Incredible focus today! You put in a legendary ${focusTime} minutes of deep work across ${pagesCovered} pages and solved ${questionsSolved} questions. High productivity score achieved!`;
      } else if (missedCount >= 2) {
        quoteFeedback = `You faced some heavy friction today with ${missedCount} missed sessions. But remember: showing up and logging it is part of the growth loop. Let's fine-tune your targets tomorrow!`;
      } else if (focusTime > 0) {
        quoteFeedback = `Consistent effort! You completed ${pagesCovered} pages, solved ${questionsSolved} questions, and accumulated ${focusTime} minutes of focus. Every brick counts toward your foundation.`;
      } else {
        quoteFeedback = "A rest day logged on the books. Sleep, recovery, and down-time are vital inputs for peak mental output tomorrow!";
      }

      // Trigger Celebration Victory Modal
      setVictoryData({
        focusTime,
        pagesCovered,
        questionsSolved,
        quote: quoteFeedback
      });

      audioManager.playChime();

    } catch (err: any) {
      console.error("Error in handleCloseDay:", err);
      showToast("Logs saved locally & Firestore! Calendar sync deferred.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const renderHeaderTitle = () => {
      switch(currentTab) {
          case 'archive': 
            return (
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-zinc-400 text-[22px]">inventory_2</span>
                <span>Archive</span>
              </div>
            );
          case 'account': 
            return (
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-zinc-400 text-[22px]">badge</span>
                <span>My Account</span>
              </div>
            );
          case 'analysis': 
            return (
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-zinc-400 text-[22px]">analytics</span>
                <span>Analysis</span>
              </div>
            );
          case 'settings': 
            return (
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-zinc-400 text-[22px]">tune</span>
                <span>Settings</span>
              </div>
            );
          case 'weekly':
            return (
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-amber-400 text-[22px]">check_box</span>
                <span>Weekly Review</span>
              </div>
            );
          default: 
            return (
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-zinc-400 text-[22px]">dashboard</span>
                <span>Tracker</span>
              </div>
            );
      }
  };

  return (
    <div className="flex min-h-screen max-w-full overflow-x-hidden relative text-zinc-100 bg-transparent">
      
      {/* Structural wallpaper canvas backing layout layer */}
      <div className="ios-wallpaper-canvas" />

      {/* Wallpaper Dimming Overlay Controls */}
      <div className="ios-wallpaper-dimmer" />

      {/* Sync Status Toast Component */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl border backdrop-blur-xl ${
          toast.type === 'success' 
            ? 'bg-emerald-950/85 border-emerald-500/30 text-emerald-200' 
            : 'bg-red-950/85 border-red-500/30 text-red-200'
        }`}>
          <span className="material-symbols-outlined text-[20px]">
            {toast.type === 'success' ? 'cloud_done' : 'cloud_off'}
          </span>
          <span className="text-sm font-semibold tracking-wide">{toast.message}</span>
        </div>
      )}

      <Sidebar 
        currentTab={currentTab} 
        setTab={setCurrentTab} 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
        profileImg={profileImg}
        userSettings={userSettings}
      />

      <div className={`flex-1 flex flex-col transition-all duration-300 relative z-10 md:ml-64`}>
        
        {/* Top Header Bar */}
        <header 
          className="ios-glass-panel rounded-t-none rounded-b-[24px] border-x-0 border-t-0 flex justify-between items-center w-[calc(100%-2rem)] mx-4 mt-4 px-6 py-4 sticky top-0 z-50 transition-all duration-500"
        >
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="md:hidden hover:bg-white/10 transition-all p-2 rounded-full cursor-pointer"
              style={{ color: 'var(--theme-primary, #10B981)' }}
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <h1 className="text-xl font-bold tracking-tight text-white animate-ios-fade-in" key={currentTab}>
                {renderHeaderTitle()}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div 
              className="w-10 h-10 rounded-full border relative flex items-center justify-center cursor-pointer group transition-all bg-black/40" 
              style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
              onClick={() => setCurrentTab('account')}
            >
               <div className="w-full h-full flex items-center justify-center font-bold text-sm text-zinc-200 overflow-hidden rounded-full">
                 {profileImg ? (
                     <img src={profileImg} alt="User Avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                 ) : (
                     userSettings.name ? userSettings.name.charAt(0).toUpperCase() : 'A'
                 )}
               </div>
               <div 
                 className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full border flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors shadow-md z-10 bg-zinc-900"
                 style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
               >
                 <span className="material-symbols-outlined text-[11px]" style={{ color: 'var(--theme-primary)' }}>settings</span>
               </div>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-24 flex flex-col overflow-y-auto min-w-0">
            {currentTab === 'command' && (
              <CommandView 
                morningPlan={morningPlan} 
                setMorningPlan={setMorningPlan}
                loggedSessions={loggedSessions}
                setLoggedSessions={setLoggedSessions}
                userSettings={userSettings}
                setUserSettings={setUserSettings}
              />
            )}
            {currentTab === 'archive' && <ArchiveView />}
            {currentTab === 'analysis' && (
              <AnalysisView 
                loggedSessions={loggedSessions} 
                userSettings={userSettings} 
                setUserSettings={setUserSettings}
              />
            )}
            {currentTab === 'weekly' && <SundayReviewView loggedSessions={loggedSessions} setLoggedSessions={setLoggedSessions} />}
            {currentTab === 'account' && (
              <AccountView 
                userSettings={userSettings} 
                setUserSettings={setUserSettings}
              />
            )}
            {currentTab === 'settings' && (
              <SettingsView userSettings={userSettings} setUserSettings={setUserSettings} 
                glassBlur={glassBlur}
                setGlassBlur={setGlassBlur}
                glassOpacity={glassOpacity}
                setGlassOpacity={setGlassOpacity}
                panelOpacity={panelOpacity}
                setPanelOpacity={setPanelOpacity}
              />
            )}
        </main>

        {/* Footer */}
        {currentTab === 'command' && (
            <footer 
              className="ios-glass-panel rounded-b-none rounded-t-[28px] border-x-0 border-b-0 w-[calc(100%-2rem)] mx-4 py-4 flex flex-col justify-center items-center gap-3 mt-auto transition-all duration-500"
            >
              <button 
                onClick={handleCloseDay} 
                disabled={isSyncing}
                className="font-bold hover:underline font-headline text-sm tracking-wide transition-all cursor-pointer active:opacity-70"
                style={{ color: 'var(--theme-primary, #10B981)' }}
              >
                 {isSyncing ? 'Saving & Syncing...' : 'Save Logs & Sync to Cloud'}
              </button>
              <p className="text-error/90 font-medium text-[11px] px-6 text-center max-w-xl bg-error/5 border border-error/10 py-1.5 rounded-xl">
                Note: Planned tasks left incomplete at the end of the day will be recorded as missed.
              </p>
            </footer>
        )}

        <Chatbot 
          morningPlan={morningPlan}
          setMorningPlan={setMorningPlan}
          loggedSessions={loggedSessions}
          setLoggedSessions={setLoggedSessions}
        />

        {/* End-of-Day Sync Celebration & Victory Screen */}
        {victoryData && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="ios-glass-panel p-8 max-w-md w-full text-zinc-100 flex flex-col gap-6 relative border border-white/20 shadow-2xl rounded-3xl animate-in zoom-in-95 duration-300">
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/30 text-amber-500 mb-2">
                  <span className="material-symbols-outlined text-[36px]">emoji_events</span>
                </div>
                <h3 className="font-headline text-2xl font-bold tracking-tight">Day Closed Successfully!</h3>
                <p className="text-zinc-400 text-sm">Your learning analytics and calendar are fully updated.</p>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-3 flex flex-col items-center text-center">
                  <span className="material-symbols-outlined text-[20px] text-emerald-400 mb-1">schedule</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Focus Time</span>
                  <span className="text-lg font-bold font-headline text-emerald-400 mt-1">
                    <AnimatedCounter value={victoryData.focusTime} suffix="m" />
                  </span>
                </div>
                <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-3 flex flex-col items-center text-center">
                  <span className="material-symbols-outlined text-[20px] text-sky-400 mb-1">menu_book</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Pages</span>
                  <span className="text-lg font-bold font-headline text-sky-400 mt-1">
                    <AnimatedCounter value={victoryData.pagesCovered} />
                  </span>
                </div>
                <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-3 flex flex-col items-center text-center">
                  <span className="material-symbols-outlined text-[20px] text-amber-400 mb-1">fact_check</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">MCQs Done</span>
                  <span className="text-lg font-bold font-headline text-amber-400 mt-1">
                    <AnimatedCounter value={victoryData.questionsSolved} />
                  </span>
                </div>
              </div>

              {/* Motivational Quote Block */}
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10 text-center italic text-zinc-300 text-sm leading-relaxed px-6">
                "{victoryData.quote}"
              </div>

              {/* Continue button */}
              <button
                onClick={() => {
                  setVictoryData(null);
                  audioManager.playSuccess();
                }}
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl text-sm transition-all shadow-lg active:scale-[0.98] cursor-pointer"
                style={{ backgroundColor: 'var(--theme-primary, #10B981)' }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

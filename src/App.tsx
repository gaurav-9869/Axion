import { audioManager } from "./lib/audio";
import { ensureValidToken } from './lib/auth';
import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { PlanItem, LogItem, UserSettings, getLocalDateString, getTotalStudyTime, deduplicateLogs } from './types';
import Tracker from './components/Tracker';
import Revision from './components/Revision';
import ArchiveView from './components/ArchiveView';
import AccountView from './components/AccountView';
import AnalysisView from './components/AnalysisView';
import SettingsView from './components/SettingsView';
import SundayReviewView from './components/SundayReviewView';
import NavigationDock from './components/NavigationDock';
import EnvironmentalCanvas from './components/EnvironmentalCanvas';
import Chatbot from './components/Chatbot';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AxionIconSprite, AxIcon } from './components/AxionIcons';
import { nanoid } from 'nanoid';
import { generateAdaptiveRecommendations } from './lib/revision/revisionEngine';
import { auth, onAuthStateChanged } from './firebase';
import { 
  getDailyPlan, 
  saveDailyPlan, 
  getStudyLogs, 
  saveStudyLogsBatch,
  getUserSettings, 
  saveUserSettings, 
  migrateLocalStorageToFirestore,
  migrateLocalLogsToFirestore,
  getSubjectPreferences
} from './services/dbService';
import { syncDailyMasterBlocksToCalendar } from './services/calendarService';
import { useSubjects } from './context/SubjectContext';

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

export default function App() {
  const { subjects } = useSubjects();
  const [currentTab, setCurrentTab] = useState('command');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeDate] = useState(() => getLocalDateString(0));
  const [morningPlan, setMorningPlan] = useState<PlanItem[]>([]);
  const [loggedSessions, setLoggedSessions] = useState<LogItem[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>(() => ({
    name: '',
    className: '',
    activeSubjects: subjects.map(s => s.id),
    subjectGoals: {},
    subjectPageTotals: {},
    uiSounds: localStorage.getItem('axion_ui_sounds') !== 'false'
  }));

  const [isLoaded, setIsLoaded] = useState(false);
  const [profileImg, setProfileImg] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Core Glass Styling Depth States (Inherited from DESIGN.md and surface system)
  const [glassBlur, setGlassBlur] = useState(28);
  const [glassOpacity, setGlassOpacity] = useState(0.00);
  const [panelOpacity, setPanelOpacity] = useState(0.82);

  // Day Summary celebration modal state
  const [victoryData, setVictoryData] = useState<{
    focusTime: number;
    pagesCovered: number;
    questionsSolved: number;
    quote: string;
  } | null>(null);

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
      root.style.setProperty('--wallpaper-url', customUrl.startsWith('url(') || customUrl.startsWith('radial-gradient') || customUrl.startsWith('linear-gradient') ? customUrl : `url("${customUrl}")`);
    } else {
      root.style.setProperty('--wallpaper-url', 'radial-gradient(circle at 20% 20%, rgba(16, 185, 129, 0.14) 0%, rgba(14, 116, 144, 0.10) 35%, #060a12 85%)');
    }
    
    root.style.setProperty('--theme-primary', customColor || '#10b981');
    root.style.setProperty('--glass-blur', `${savedBlur ? Number(savedBlur) : 28}px`);
    root.style.setProperty('--wallpaper-dim', savedOpacity ? String(savedOpacity) : '0.00');
    root.style.setProperty('--panel-opacity', savedPanelOpacity ? String(savedPanelOpacity) : '0.82');
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

  useEffect(() => {
    const handleLogDeleted = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.logId) {
        setLoggedSessions(prev => prev.filter(l => l.id !== detail.logId));
      }
    };
    window.addEventListener('axion-log-deleted', handleLogDeleted);

    const handleLogCreated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.log) {
        setLoggedSessions(prev => {
          const existingIdx = prev.findIndex(l => 
            l.id === detail.log.id || (detail.log.planId && l.planId === detail.log.planId)
          );
          if (existingIdx >= 0) {
            return prev.map((l, i) => i === existingIdx ? detail.log : l);
          }
          return [detail.log, ...prev];
        });
      }
    };
    window.addEventListener('axion-log-created', handleLogCreated);

    const handleLogUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.log) {
        setLoggedSessions(prev => {
          const existingIdx = prev.findIndex(l => 
            l.id === detail.log.id || (detail.log.planId && l.planId === detail.log.planId)
          );
          if (existingIdx >= 0) {
            return prev.map((l, i) => i === existingIdx ? detail.log : l);
          }
          return [detail.log, ...prev];
        });
      }
    };
    window.addEventListener('axion-log-updated', handleLogUpdated);

    const handlePlanCreated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.plan && detail.date === activeDate) {
        setMorningPlan(prev => {
          const exists = prev.some(p => p.id === detail.plan.id);
          return exists ? prev : [...prev, detail.plan];
        });
      }
    };
    window.addEventListener('axion-plan-created', handlePlanCreated);

    const handlePlanUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.plan && detail.date === activeDate) {
        setMorningPlan(prev => prev.map(p => p.id === detail.plan.id ? detail.plan : p));
      }
    };
    window.addEventListener('axion-plan-updated', handlePlanUpdated);

    const handlePlanDeleted = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.planId && detail.date === activeDate) {
        setMorningPlan(prev => prev.filter(p => p.id !== detail.planId));
      }
    };
    window.addEventListener('axion-plan-deleted', handlePlanDeleted);

    const handleProfileUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setProfileImg(detail?.picture || null);
    };
    window.addEventListener('axion-profile-updated', handleProfileUpdated);

    return () => {
      window.removeEventListener('axion-log-deleted', handleLogDeleted);
      window.removeEventListener('axion-log-created', handleLogCreated);
      window.removeEventListener('axion-log-updated', handleLogUpdated);
      window.removeEventListener('axion-plan-created', handlePlanCreated);
      window.removeEventListener('axion-plan-updated', handlePlanUpdated);
      window.removeEventListener('axion-plan-deleted', handlePlanDeleted);
      window.removeEventListener('axion-profile-updated', handleProfileUpdated);
    };
  }, [activeDate]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const localLogs = localStorage.getItem("axion_local_logs");
          const migrated = localStorage.getItem("migrated_to_firebase");
          if (localLogs && migrated !== "true") {
            await migrateLocalLogsToFirestore(user.uid);
          }

          if (!localStorage.getItem('axion_firebase_migrated')) {
            await migrateLocalStorageToFirestore(user.uid);
            localStorage.setItem('axion_firebase_migrated', 'true');
          }
        } catch (err) {
          console.warn("Auth migration notice:", err);
        }
      }
      setCurrentUser(user || null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUser === undefined) return;

    let isCancelled = false;
    setIsLoaded(false);

    async function initializeData() {
      try {
        const savedProfile = localStorage.getItem('gcal_profile');
        if (savedProfile) {
          try {
            const parsedProfile = JSON.parse(savedProfile);
            if (parsedProfile?.picture) setProfileImg(parsedProfile.picture);
          } catch {}
        } else if (currentUser?.photoURL) {
          setProfileImg(currentUser.photoURL);
        }

        try {
          await getSubjectPreferences();
        } catch (err) {
          console.warn("getSubjectPreferences failed during hydration:", err);
        }

        let settings = null;
        try {
          settings = await getUserSettings();
        } catch (err) {
          console.warn("getUserSettings failed during hydration, falling back to local:", err);
        }

        let plan: PlanItem[] = [];
        try {
          plan = await getDailyPlan(activeDate);
        } catch (err) {
          console.warn("getDailyPlan failed during hydration, falling back to local:", err);
        }

        let allLogs: LogItem[] = [];
        try {
          allLogs = await getStudyLogs(500);
        } catch (err) {
          console.warn("getStudyLogs failed during hydration, falling back to local:", err);
        }

        if (isCancelled) return;

        try {
          const recommendations = generateAdaptiveRecommendations(allLogs, activeDate);
          const dueTodayRecs = recommendations.filter(
            r => r.urgency === 'due_today' || r.targetReviewDate === activeDate
          );

          dueTodayRecs.forEach(rec => {
            const alreadyInPlan = plan.some(
              p => p.subject === rec.subject &&
                   p.topic.toLowerCase() === rec.topic.toLowerCase() &&
                   p.sessionType === 'Revise'
            );

            if (!alreadyInPlan) {
              const isAlreadyLoggedToday = allLogs.some(l => {
                const isToday = l.timestamp 
                  ? getLocalDateString(0, new Date(l.timestamp)) === activeDate 
                  : l.nextReviewDate === activeDate;
                return isToday && l.sessionType === 'Revise' && l.subject === rec.subject && l.topic.toLowerCase() === rec.topic.toLowerCase();
              });

              plan.push({
                id: `sched-rev-${nanoid(8)}`,
                timestamp: Date.now(),
                subject: rec.subject as any,
                topic: rec.topic,
                chapter: rec.chapter,
                sessionType: 'Revise',
                targetMins: rec.retentionBand === 'Very Weak' || rec.retentionBand === 'Weak' ? 45 : 30,
                status: isAlreadyLoggedToday ? 'completed' : 'pending',
                isScheduledRevision: true
              });
            }
          });
        } catch (err) {
          console.warn("Error calculating today's scheduled revisions:", err);
        }

        if (settings) {
          setUserSettings({
            name: settings.name || '',
            className: settings.className || '',
            activeSubjects: Array.isArray(settings.activeSubjects) && settings.activeSubjects.length > 0 ? settings.activeSubjects : subjects.map(s => s.id),
            subjectGoals: settings.subjectGoals || {},
            subjectPageTotals: settings.subjectPageTotals || {},
            uiSounds: settings.uiSounds !== undefined ? settings.uiSounds : (localStorage.getItem('axion_ui_sounds') !== 'false')
          });
        }

        setMorningPlan(plan);
        setLoggedSessions(deduplicateLogs(allLogs));
      } catch (e) {
        console.error("Data load error:", e);
      } finally {
        if (!isCancelled) {
          setIsLoaded(true);
        }
      }
    }

    initializeData();
    return () => {
      isCancelled = true;
    };
  }, [activeDate, currentUser]);

  useEffect(() => {
    if (!isLoaded) return;

    let isCancelled = false;

    async function persistData() {
      try {
        await saveDailyPlan(activeDate, morningPlan);
      } catch (err) {
        console.log("saveDailyPlan deferred:", err);
      }

      if (isCancelled) return;

      try {
        await saveUserSettings(userSettings);
      } catch (err) {
        console.log("saveUserSettings deferred:", err);
      }
    }

    persistData();

    return () => {
      isCancelled = true;
    };
  }, [morningPlan, userSettings, isLoaded, activeDate]);

  const [isSyncing, setIsSyncing] = useState(false);

  const handleCloseDay = async () => {
    setIsSyncing(true);
    try {
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

      if (missedLogsToSave.length > 0) {
        try {
          await saveStudyLogsBatch(missedLogsToSave);
        } catch (err) {
          console.warn("Deferred batch save:", err);
        }
      }

      const finalLogs = deduplicateLogs([...currentLogged, ...missedLogsToSave]);
      
      const getLogDate = (log: LogItem) => {
        if (log.timestamp) {
          return getLocalDateString(0, new Date(log.timestamp));
        }
        return log.nextReviewDate || getLocalDateString(0);
      };
      
      const todayLogs = finalLogs.filter(l => getLogDate(l) === activeDate);

      let calendarSyncEnabled = true;
      try {
        const token = await ensureValidToken();
        if (!token) {
          calendarSyncEnabled = false;
        }
      } catch {
        calendarSyncEnabled = false;
      }

      if (calendarSyncEnabled) {
        try {
          await syncDailyMasterBlocksToCalendar(todayLogs, activeDate);
          todayLogs.forEach(l => {
            l.synced = true;
          });
          await saveStudyLogsBatch(todayLogs);
        } catch {
          await saveStudyLogsBatch(todayLogs);
        }
      } else {
        await saveStudyLogsBatch(todayLogs);
      }

      setLoggedSessions([...finalLogs]);

      const activeTodayLogs = todayLogs.filter(l => !l.isMissed);
      const missedTodayLogs = todayLogs.filter(l => l.isMissed);
      const focusTime = activeTodayLogs.reduce((acc, l) => acc + getTotalStudyTime(l), 0);
      const pagesCovered = activeTodayLogs.filter(l => l.sessionType === 'Study').reduce((acc, l) => acc + (l.endPage && l.startPage ? Math.max(0, l.endPage - l.startPage) : 0), 0);
      const questionsSolved = activeTodayLogs.reduce((acc, l) => acc + (l.mcqCount || 0) + (l.vsaCount || 0) + (l.saCount || 0) + (l.laCount || 0), 0);
      const missedCount = missedTodayLogs.length;
      
      let quoteFeedback = "Focus is a muscle, and you just gave it a world-class workout.";
      if (focusTime >= 120 || pagesCovered >= 25 || questionsSolved >= 20) {
        quoteFeedback = `Great focus today: ${focusTime} minutes across ${pagesCovered} pages and ${questionsSolved} questions.`;
      } else if (missedCount >= 2) {
        quoteFeedback = `Logged ${missedCount} unfinished tasks. Tomorrow's queue is ready.`;
      } else if (focusTime > 0) {
        quoteFeedback = `Completed ${pagesCovered} pages, ${questionsSolved} questions, and ${focusTime} minutes of focus.`;
      } else {
        quoteFeedback = "Rest day recorded. Ready for tomorrow.";
      }

      setVictoryData({
        focusTime,
        pagesCovered,
        questionsSolved,
        quote: quoteFeedback
      });

      audioManager.playChime();
    } catch (err: any) {
      console.error("Error in handleCloseDay:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenNewTask = () => {
    audioManager.playClick();
    if (currentTab !== 'command') {
      setCurrentTab('command');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('axion-open-new-task'));
      }, 80);
    } else {
      window.dispatchEvent(new CustomEvent('axion-open-new-task'));
    }
  };

  const revisionDueCount = useMemo(() => {
    return morningPlan.filter(p => p.sessionType === 'Revise' && p.status !== 'completed').length;
  }, [morningPlan]);

  // Strictly 1-2 word headings with zero subtitles
  const renderHeaderMeta = () => {
    switch (currentTab) {
      case 'archive':
        return { title: 'Archive', icon: 'archive' };
      case 'account':
        return { title: 'Account', icon: 'account' };
      case 'analysis':
        return { title: 'Analysis', icon: 'analysis' };
      case 'revision':
        return { title: 'Revision', icon: 'revise' };
      case 'settings':
        return { title: 'Settings', icon: 'settings' };
      case 'weekly':
        return { title: 'Goals', icon: 'goals' };
      default:
        return { title: 'Tracker', icon: 'tasks' };
    }
  };

  const headerMeta = renderHeaderMeta();

  return (
    <div className="h-screen w-screen flex p-2.5 md:p-4 gap-3 md:gap-4 overflow-hidden box-border relative text-slate-100 bg-transparent">
      {/* Canonical Axion 2px Vector Sprite */}
      <AxionIconSprite />

      {/* Level 0: Environmental Backdrop & Vignette Scrim */}
      <EnvironmentalCanvas userSettings={userSettings} />

      {/* Responsive Spatial Navigation Dock (Tablet & Desktop Persistent, Mobile Capsule) */}
      <NavigationDock
        currentTab={currentTab}
        setTab={setCurrentTab}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        profileImg={profileImg}
        userSettings={userSettings}
        revisionBadgeCount={revisionDueCount}
      />

      {/* Central Main Operational Window (Level 1 Surface) */}
      <main className="flex-1 axion-surface-l1 rounded-[24px] flex flex-col overflow-hidden relative z-10 min-w-0">
        {/* Top Operational Header Bar */}
        <header className="px-5 md:px-8 py-4 border-b border-white/[0.06] flex items-center justify-between shrink-0 gap-4 bg-black/10">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="hidden sm:flex w-8 h-8 rounded-[10px] items-center justify-center border shrink-0"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderColor: 'rgba(255,255,255,0.08)'
                }}
              >
                <AxIcon name={headerMeta.icon} className="w-5 h-5 text-white ax-icon-white" />
              </div>
              <h1 className="text-[17px] md:text-[19px] font-bold tracking-tight text-white truncate">
                {headerMeta.title}
              </h1>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2.5 shrink-0">
            {currentTab === 'command' && (
              <button
                onClick={handleCloseDay}
                disabled={isSyncing}
                className="ax-pressable px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-white flex items-center gap-2 cursor-pointer disabled:opacity-50"
                title="Close Day"
              >
                <AxIcon
                  name="resync"
                  className={`w-5 h-5 text-white ax-icon-white ${isSyncing ? 'animate-spin' : ''}`}
                />
                <span className="hidden sm:inline">
                  {isSyncing ? 'Closing...' : 'Close Day'}
                </span>
              </button>
            )}

            <button
              onClick={() => setCurrentTab('account')}
              className="ax-pressable w-9 h-9 rounded-xl border border-white/10 bg-black/40 hover:border-white/25 flex items-center justify-center relative cursor-pointer overflow-hidden shrink-0"
              title="Account"
            >
              {profileImg ? (
                <img
                  src={profileImg}
                  alt="Avatar"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <AxIcon name="account" className="w-4 h-4 text-white ax-icon-white" />
              )}
            </button>
          </div>
        </header>

        {/* Scrollable Operational Viewport (pb-32 on mobile to guarantee clear scroll above dock & fixed buttons) */}
        <div className="flex-1 overflow-y-auto px-5 md:px-8 py-6 pb-32 md:pb-24 min-w-0">
          <div key={currentTab} className="ax-route-enter max-w-7xl w-full mx-auto flex flex-col gap-6">
            {currentTab === 'command' && (
              <Tracker
                morningPlan={morningPlan}
                setMorningPlan={setMorningPlan}
                loggedSessions={loggedSessions}
                setLoggedSessions={setLoggedSessions}
                userSettings={userSettings}
                setUserSettings={setUserSettings}
              />
            )}
            {currentTab === 'revision' && (
              <Revision
                logs={loggedSessions}
                setLogs={setLoggedSessions}
                currentPlan={morningPlan}
                setMorningPlan={setMorningPlan}
              />
            )}
            {currentTab === 'archive' && (
              <ArchiveView
                logs={loggedSessions}
                setLogs={setLoggedSessions}
              />
            )}
            {currentTab === 'analysis' && (
              <AnalysisView
                loggedSessions={loggedSessions}
                userSettings={userSettings}
                setUserSettings={setUserSettings}
              />
            )}
            {currentTab === 'weekly' && (
              <SundayReviewView
                loggedSessions={loggedSessions}
                setLoggedSessions={setLoggedSessions}
              />
            )}
            {currentTab === 'account' && (
              <AccountView
                userSettings={userSettings}
                setUserSettings={setUserSettings}
              />
            )}
            {currentTab === 'settings' && (
              <SettingsView
                userSettings={userSettings}
                setUserSettings={setUserSettings}
                glassBlur={glassBlur}
                setGlassBlur={setGlassBlur}
                glassOpacity={glassOpacity}
                setGlassOpacity={setGlassOpacity}
                panelOpacity={panelOpacity}
                setPanelOpacity={setPanelOpacity}
              />
            )}
          </div>
        </div>
      </main>

      {/* Unified Fixed Floating Action Cluster (Level 3 Floating Elements, z-[80] sits above mobile dock z-[75]) */}
      <div className="fixed bottom-[74px] right-3.5 md:bottom-6 md:right-6 z-[80] flex items-center gap-2.5 md:gap-3 pointer-events-auto">
        {/* Fixed New Task Button: Circular 48px (+) on mobile, expanded pill on desktop */}
        <button
          onClick={handleOpenNewTask}
          className="ax-pressable h-12 w-12 md:w-auto md:px-5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-[0_12px_28px_rgba(16,185,129,0.40)] cursor-pointer shrink-0 transition-transform active:scale-95"
          title="New Task"
          aria-label="New Task"
        >
          <AxIcon name="plus" className="w-5 h-5 text-slate-950 shrink-0" />
          <span className="hidden md:inline font-bold">New Task</span>
        </button>

        {/* Fixed Chatbot Assistant Launcher */}
        <Chatbot
          morningPlan={morningPlan}
          setMorningPlan={setMorningPlan}
          loggedSessions={loggedSessions}
          setLoggedSessions={setLoggedSessions}
        />
      </div>

      <OfflineIndicator />

      {/* Day Summary Modal */}
      {victoryData && (
        <div className="fixed inset-0 axion-surface-l3 z-[100] flex items-center justify-center p-4">
          <div className="axion-surface-l1 p-7 max-w-md w-full text-slate-100 flex flex-col gap-6 relative border border-white/15 shadow-2xl rounded-[26px] modal-emerge">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30 text-emerald-400 mb-1">
                <AxIcon name="tick" className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-white">Day Summary</h3>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="axion-surface-l2 p-3.5 flex flex-col items-center text-center">
                <AxIcon name="time" className="w-5 h-5 text-emerald-400 mb-1.5" />
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                  Focus
                </span>
                <span className="text-lg font-bold font-mono text-emerald-400 mt-1 tabular-nums">
                  <AnimatedCounter value={victoryData.focusTime} suffix="m" />
                </span>
              </div>
              <div className="axion-surface-l2 p-3.5 flex flex-col items-center text-center">
                <AxIcon name="pages" className="w-5 h-5 text-sky-400 mb-1.5" />
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                  Pages
                </span>
                <span className="text-lg font-bold font-mono text-sky-400 mt-1 tabular-nums">
                  <AnimatedCounter value={victoryData.pagesCovered} />
                </span>
              </div>
              <div className="axion-surface-l2 p-3.5 flex flex-col items-center text-center">
                <AxIcon name="mcq" className="w-5 h-5 text-amber-400 mb-1.5" />
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                  MCQs
                </span>
                <span className="text-lg font-bold font-mono text-amber-400 mt-1 tabular-nums">
                  <AnimatedCounter value={victoryData.questionsSolved} />
                </span>
              </div>
            </div>

            <div className="glass-inner-well p-4 text-center italic text-slate-300 text-xs leading-relaxed">
              "{victoryData.quote}"
            </div>

            <button
              onClick={() => {
                setVictoryData(null);
                audioManager.playSuccess();
              }}
              className="w-full py-3 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-lg cursor-pointer"
              style={{ backgroundColor: 'var(--theme-primary, #10b981)' }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

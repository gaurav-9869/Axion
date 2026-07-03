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
      subjectPageTotals: {}
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const [profileImg, setProfileImg] = useState<string | null>(null);
  const [showSyncTray, setShowSyncTray] = useState(false);

  // Core Glass Styling Depth States
  const [glassBlur, setGlassBlur] = useState(24);
  const [glassOpacity, setGlassOpacity] = useState(0.45);
  const [wallpaperStyle, setWallpaperStyle] = useState('');

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

  // Fixed Wallpaper Engine Loading Cycles
  useLayoutEffect(() => {
    const customUrl = localStorage.getItem('custom_wallpaper_url');
    const customColor = localStorage.getItem('custom_wallpaper_color');
    const savedBlur = localStorage.getItem('ios_glass_blur');
    const savedOpacity = localStorage.getItem('ios_glass_opacity');
    
    if (savedBlur) setGlassBlur(Number(savedBlur));
    if (savedOpacity) setGlassOpacity(Number(savedOpacity));

    const root = document.documentElement;
    if (!root) return;
    
    if (customUrl) {
       setWallpaperStyle(customUrl);
       root.style.setProperty('--wallpaper-url', `url(${customUrl})`);
    } else {
       root.style.setProperty('--wallpaper-url', 'radial-gradient(circle at top left, #1e1b4b 0%, #0a0f18 100%)');
    }
    
    root.style.setProperty('--theme-primary', customColor || '#10B981');
    root.style.setProperty('--glass-blur', `${savedBlur ? Number(savedBlur) : 24}px`);
    root.style.setProperty('--glass-opacity', savedOpacity ? String(savedOpacity) : '0.45');
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const root = document.documentElement;
    if (!root) return;
    root.style.setProperty('--glass-blur', `${glassBlur}px`);
    root.style.setProperty('--glass-opacity', String(glassOpacity));
    localStorage.setItem('ios_glass_blur', String(glassBlur));
    localStorage.setItem('ios_glass_opacity', String(glassOpacity));
  }, [glassBlur, glassOpacity, isLoaded]);

  const safeParseArray = (dataStr: string | null) => {
    if (!dataStr) return [];
    try { const parsed = JSON.parse(dataStr); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  };

  useEffect(() => {
    try {
        const savedPlan = localStorage.getItem(`pcbm_plan_${activeDate}`);
        const savedLog = localStorage.getItem(`pcbm_log_${activeDate}`);
        const savedSettings = localStorage.getItem('pcbm_settings');
        const savedProfile = localStorage.getItem('gcal_profile');
        
        let initialPlan = safeParseArray(savedPlan);

        // Automated Planning: Spaced Repetition SR injection
        const todayStr = getLocalDateString(0);
        const tomorrowStr = getLocalDateString(1);
        
        const allKeys = Object.keys(localStorage);
        allKeys.filter(k => k.startsWith('axion_logs_') || k.startsWith('pcbm_log_')).forEach(k => {
            if (k === `pcbm_log_${activeDate}` || k === `axion_logs_${activeDate}`) return; 
            const logs = safeParseArray(localStorage.getItem(k));
            logs.forEach(log => {
                if (log.nextReviewDate && (log.nextReviewDate === todayStr || log.nextReviewDate === tomorrowStr)) {
                    const alreadyExists = initialPlan.some(p => p.topic === log.topic && p.subject === log.subject);
                    if (!alreadyExists) {
                        initialPlan.push({
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
        });

        setMorningPlan(initialPlan);
        setLoggedSessions(safeParseArray(savedLog));

        if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            if (parsed && typeof parsed === 'object') {
                setUserSettings({
                    name: parsed.name || '',
                    className: parsed.className || '',
                    activeSubjects: Array.isArray(parsed.activeSubjects) ? parsed.activeSubjects : ['bio', 'phys', 'chem', 'math'],
                    subjectGoals: parsed.subjectGoals || {},
                    subjectPageTotals: parsed.subjectPageTotals || {}
                });
            }
        }
        
        if (savedProfile) {
            const parsedProfile = JSON.parse(savedProfile);
            if (parsedProfile?.picture) setProfileImg(parsedProfile.picture);
        }
    } catch (e) { console.error(e); }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(`pcbm_plan_${activeDate}`, JSON.stringify(morningPlan || []));
    localStorage.setItem(`pcbm_log_${activeDate}`, JSON.stringify(loggedSessions || []));
    localStorage.setItem('pcbm_settings', JSON.stringify(userSettings));
  }, [morningPlan, loggedSessions, userSettings, isLoaded, activeDate]);

  useEffect(() => {
    const checkSyncTime = async () => {
       const now = new Date();
       if (now.getHours() === 19 && now.getMinutes() >= 0 && now.getMinutes() <= 30) {
           const lastSyncStr = localStorage.getItem('last_auto_sync');
           if (lastSyncStr !== new Date().toDateString()) {
               const token = localStorage.getItem('gcal_token');
               if (token) {
                   setShowSyncTray(true);
               }
           }
       }
       // Enforce cache eviction engine on a regular heartbeat
       import('./lib/driveSync').then(m => m.enforceCacheEviction());
    };
    
    checkSyncTime();
    const int = setInterval(checkSyncTime, 60000); // check every minute
    return () => clearInterval(int);
  }, []);

  const [isSyncing, setIsSyncing] = useState(false);
  const hasUnsyncedLogs = loggedSessions.some(l => !l.synced);

  const createEventsForLog = async (token: string, log: LogItem) => {
    const datesToSchedule: { offset: number; type: string }[] = [];
    const todayNum = new Date().getDate();
    const todayDay = new Date().getDay();

    if (log.isMissed) {
        datesToSchedule.push({ offset: 0, type: 'MISSED' });
    } else if (log.sessionType === 'Study') {
        datesToSchedule.push({ offset: 0, type: 'STUDY' });
        datesToSchedule.push({ offset: 1, type: 'FOLLOW_UP' });

        const daysToNextSunday = (7 - todayDay) % 7 || 7;
        datesToSchedule.push({ offset: daysToNextSunday, type: 'WEEKLY_CONCLUSION' });

        let monthlyOffset = 0;
        let d28 = new Date();
        if (todayNum > 25) {
            d28.setMonth(d28.getMonth() + 1);
        }
        d28.setDate(28);
        monthlyOffset = Math.max(0, Math.ceil((d28.getTime() - new Date().getTime()) / (1000 * 3600 * 24)));
        if (monthlyOffset > 0) {
           datesToSchedule.push({ offset: monthlyOffset, type: 'MONTHLY_CONCLUSION' });
        }
    } else {
        datesToSchedule.push({ offset: 0, type: log.sessionType === 'Revise' ? 'REVISED' : 'PRACTICE' });
    }

    for (const schedule of datesToSchedule) {
        const dateStr = getLocalDateString(schedule.offset);
        const endStr = getLocalDateString(schedule.offset + 1);
        const eventHash = `pcbmlog_${log.id}_${schedule.offset}`;
        
        try {
            const queryParam = encodeURIComponent(`pcbmHash=${eventHash}`);
            const listRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?privateExtendedProperty=${queryParam}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (listRes.ok) {
                const listData = await listRes.json();
                if (listData.items && listData.items.length > 0) {
                    continue;
                }
            }
        } catch (e) {
            console.error(e);
        }

        let title = '';
        const subjectName = getSubjectConfig(log.subject).name;

        if (schedule.type === 'MISSED') {
            title = `Missed Session: ${subjectName} - ${log.topic}`;
        } else if (schedule.type === 'FOLLOW_UP') {
            title = `Follow-up Study: ${subjectName} - ${log.topic}`;
        } else if (schedule.type === 'WEEKLY_CONCLUSION') {
            title = `Weekly Summary: ${subjectName} - ${log.topic}`;
        } else if (schedule.type === 'MONTHLY_CONCLUSION') {
            title = `Monthly Review: ${subjectName} - ${log.topic}`;
        } else if (schedule.type === 'REVISED') {
            title = `[Revised] ${subjectName} - ${log.topic}`;
        } else if (schedule.type === 'PRACTICE') {
            title = `[Practice] ${subjectName} - ${log.topic}`;
        } else {
            title = `Study Block: ${subjectName} - ${log.topic}`;
        }

        let targetUnits = '';
        if (log.sessionType === 'Exercise') {
            const vsa = log.vsaCount || 0;
            const sa = log.saCount || 0;
            const la = log.laCount || 0;
            targetUnits = `Target Material: ${vsa + sa + la} Questions (${vsa} Short, ${sa} Medium, ${la} Long)`;
        } else {
            targetUnits = `Target Range: Pages ${log.startPage || 0} to ${log.endPage || 0}`;
            if (log.sessionType === 'Study') {
               const vsa = log.vsaCount || 0;
               const sa = log.saCount || 0;
               const la = log.laCount || 0;
               if (vsa + sa + la > 0) {
                   targetUnits += `\nQuestions: ${vsa + sa + la} (${vsa} Short, ${sa} Medium, ${la} Long)`;
               }
            }
        }

        let colorId = '9'; // Deep blue for Study
        if (schedule.type === 'MISSED' || log.isMissed) colorId = '11'; // Red
        else if (log.sessionType === 'Revise' || schedule.type === 'REVISED') colorId = '10'; // Green
        else if (log.sessionType === 'Exercise' || schedule.type === 'PRACTICE') colorId = '6'; // Orange

        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                summary: title,
                description: log.isMissed ? 'Session was scheduled but not completed.' : `${targetUnits}\n\nFocus Rating: ${getFocusScore(log)}%\nRetention Level: ${log.retentionScore || 'N/A'}/10\n\nStudy Notes:\n${log.notes}`,
                start: { date: dateStr },
                end: { date: endStr },
                colorId: colorId,
                extendedProperties: {
                    private: { pcbmHash: eventHash }
                }
            })
        });
        if (!res.ok) throw new Error("API status: " + res.status);
    }
  };

  const handleCloseDay = async () => {
    setIsSyncing(true);
    let finalLogs = [...loggedSessions];
    const loggedPlanIds = new Set(finalLogs.map(l => l.planId).filter(Boolean));
    let hasPenalties = false;

    morningPlan.forEach((plan) => {
        if (!loggedPlanIds.has(plan.id) && !finalLogs.some(l => l.planId === plan.id && l.isMissed)) {
            hasPenalties = true;
            finalLogs.push({
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
            });
        }
    });

    if (hasPenalties) {
        setLoggedSessions([...finalLogs]);
    }

    const token = localStorage.getItem('gcal_token');
    
    if (!token) {
        alert("Please sign in with Google inside your Profile account pane to synchronize parameters.");
        setIsSyncing(false);
        return;
    }

    let successCount = 0;
    try {
        for (let i = 0; i < finalLogs.length; i++) {
            if (!finalLogs[i].synced) {
                await createEventsForLog(token, finalLogs[i]);
                finalLogs[i].synced = true;
                successCount++;
            }
        }
        setLoggedSessions([...finalLogs]);
        if(successCount > 0) alert(`Successfully updated your calendar with ${successCount} study logs!`);
        else alert("Everything is currently up to date.");
    } catch(err: any) {
        alert("Could not update calendar. Your connection session might need to be refreshed.");
    } finally {
        setIsSyncing(false);
    }
  };

  // Enforced unified Analysis spelling parameter alongside header symbols/icons
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
    <div className="flex min-h-screen max-w-full overflow-x-hidden relative text-zinc-100 bg-[#060a12]">
      
      {/* Structural wallpaper canvas backing layout layer */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center transition-all duration-500" 
        style={{ 
          backgroundImage: wallpaperStyle ? `url(${wallpaperStyle})` : 'radial-gradient(circle at top left, #121026 0%, #05080f 100%)' 
        }} 
      />

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
          style={{
            backdropFilter: 'blur(var(--glass-blur, 24px))',
            WebkitBackdropFilter: 'blur(var(--glass-blur, 24px))',
            backgroundColor: 'rgba(10, 15, 24, var(--glass-opacity, 0.45))',
            borderColor: 'rgba(255, 255, 255, 0.1)'
          }}
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
            {currentTab === 'analysis' && <AnalysisView loggedSessions={loggedSessions} userSettings={userSettings} />}
            {currentTab === 'weekly' && <SundayReviewView loggedSessions={loggedSessions} setLoggedSessions={setLoggedSessions} />}
            {currentTab === 'account' && (
              <AccountView 
                userSettings={userSettings} 
                setUserSettings={setUserSettings}
              />
            )}
            {currentTab === 'settings' && (
              <SettingsView 
                glassBlur={glassBlur}
                setGlassBlur={setGlassBlur}
                glassOpacity={glassOpacity}
                setGlassOpacity={setGlassOpacity}
              />
            )}
        </main>

        {/* Calendar Sync Footer */}
        {currentTab === 'command' && (
            <footer 
              className="ios-glass-panel rounded-b-none rounded-t-[28px] border-x-0 border-b-0 w-[calc(100%-2rem)] mx-4 py-4 flex flex-col justify-center items-center gap-3 mt-auto transition-all duration-500"
              style={{
                backdropFilter: 'blur(var(--glass-blur, 24px))',
                WebkitBackdropFilter: 'blur(var(--glass-blur, 24px))',
                backgroundColor: 'rgba(10, 15, 24, var(--glass-opacity, 0.45))',
                borderColor: 'rgba(255, 255, 255, 0.1)'
              }}
            >
              <button 
                onClick={handleCloseDay} 
                disabled={isSyncing}
                className="font-bold hover:underline font-headline text-sm tracking-wide transition-all cursor-pointer active:opacity-70"
                style={{ color: 'var(--theme-primary, #10B981)' }}
              >
                 {isSyncing ? 'Syncing with Google...' : 'Save Logs & Sync to Calendar'}
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
      </div>
      {/* Google Drive Master Backup Tray */}
      {showSyncTray && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-xl border border-indigo-500/30 shadow-2xl p-6 rounded-3xl z-[100] flex flex-col md:flex-row items-center gap-6 animate-ios-slide-up max-w-lg w-[calc(100%-2rem)]">
              <div className="w-14 h-14 bg-indigo-500/20 rounded-full flex items-center justify-center shrink-0 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                  <span className="material-symbols-outlined text-[28px] text-indigo-400">cloud_upload</span>
              </div>
              <div className="flex-1 flex flex-col gap-1 text-center md:text-left">
                  <h4 className="text-white font-bold text-lg tracking-tight">Daily Cloud Sync Ready</h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">It's 7:00 PM. Would you like to backup your day's history to Google Drive?</p>
              </div>
              <div className="flex gap-3 w-full md:w-auto">
                  <button 
                      onClick={() => setShowSyncTray(false)} 
                      className="flex-1 md:flex-none px-5 py-2.5 rounded-xl border border-white/10 text-zinc-300 text-sm font-bold hover:bg-white/5 transition-colors cursor-pointer"
                  >
                      Skip
                  </button>
                  <button 
                      onClick={async () => {
                          const token = localStorage.getItem('gcal_token');
                          if (token) {
                              const { syncArchive } = await import('./lib/driveSync');
                              const success = await syncArchive(token);
                              if (success) {
                                  alert("Backup to Google Drive successful!");
                              } else {
                                  alert("Backup failed. Please check your connection.");
                              }
                          }
                          setShowSyncTray(false);
                      }} 
                      className="flex-1 md:flex-none px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95 cursor-pointer"
                  >
                      Sync Now
                  </button>
              </div>
          </div>
      )}

    </div>
  );
}

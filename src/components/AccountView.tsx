import React, { useState, useEffect } from 'react';
import { UserSettings } from '../types';
import { useSubjects } from '../context/SubjectContext';
import { auth, onAuthStateChanged, syncGoogleAuthWithFirebase } from '../firebase';
import { migrateLocalLogsToFirestore, migrateLocalStorageToFirestore, getStudyLogs, saveUserSettings } from '../services/dbService';
import { saveOAuthTokens, GOOGLE_OAUTH_SCOPES, getGoogleClientId } from '../lib/auth';
import { AxIcon } from './AxionIcons';

declare var google: any;

interface AccountViewProps {
  userSettings: UserSettings;
  setUserSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
}

export default function AccountView({ userSettings, setUserSettings }: AccountViewProps) {
  const { subjects, getSubjectConfig } = useSubjects();
  const [hasToken, setHasToken] = useState(false);
  const [userProfile, setUserProfile] = useState<{ name: string; picture: string; email: string } | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const fetchUserProfile = async (token: string) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data);
        localStorage.setItem('gcal_profile', JSON.stringify(data));
        window.dispatchEvent(new CustomEvent('axion-profile-updated', { detail: data }));
      }
    } catch (err) {
      console.error("Failed to fetch profile", err);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('gcal_token');
    const expires = localStorage.getItem('gcal_token_expires');

    if (token && expires && Number(expires) > Date.now()) {
      setHasToken(true);
      const profile = localStorage.getItem('gcal_profile');
      if (profile) {
        try {
          setUserProfile(JSON.parse(profile));
        } catch (e) {}
      } else {
        fetchUserProfile(token);
      }
    } else if (auth.currentUser) {
      setHasToken(true);
      const profile = localStorage.getItem('gcal_profile');
      if (profile) {
        try {
          setUserProfile(JSON.parse(profile));
        } catch (e) {}
      } else {
        setUserProfile({
          name: auth.currentUser.displayName || 'Connected',
          picture: auth.currentUser.photoURL || '',
          email: auth.currentUser.email || ''
        });
      }
    } else {
      localStorage.removeItem('gcal_token');
      localStorage.removeItem('gcal_token_expires');
      setHasToken(false);
    }

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setHasToken(true);
        const savedProfile = localStorage.getItem('gcal_profile');
        if (savedProfile) {
          try {
            setUserProfile(JSON.parse(savedProfile));
            return;
          } catch (e) {}
        }
        setUserProfile({
          name: user.displayName || 'Connected',
          picture: user.photoURL || '',
          email: user.email || ''
        });
      }
    });
    return () => unsub();
  }, []);

  const handleConnect = () => {
    try {
      const clientId = getGoogleClientId();
      if (!clientId) return;
      if (typeof google === 'undefined' || !google.accounts?.oauth2) return;

      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_OAUTH_SCOPES,
        prompt: 'consent',
        callback: async (response: any) => {
          if (response.error) {
            console.error("[Google OAuth] Authorization failed:", response);
          } else {
            saveOAuthTokens(response.access_token, response.expires_in || 3600);
            setHasToken(true);
            fetchUserProfile(response.access_token);

            try {
              const firebaseUser = await syncGoogleAuthWithFirebase(null, response.access_token);
              if (firebaseUser) {
                await migrateLocalLogsToFirestore(firebaseUser.uid);
                await migrateLocalStorageToFirestore(firebaseUser.uid);
              }
            } catch (fbErr: any) {
              console.error("Auth sync failed:", fbErr);
            }
          }
        },
        error_callback: (nonOAuthErr: any) => {
          console.error("[Google OAuth] Authorization client error:", nonOAuthErr);
        }
      });
      client.requestAccessToken();
    } catch (err: any) {
      console.error("Error setting up Google Auth:", err);
    }
  };

  const handleDisconnect = async () => {
    localStorage.removeItem('gcal_token');
    localStorage.removeItem('gcal_profile');
    localStorage.removeItem('gcal_token_expires');
    window.dispatchEvent(new CustomEvent('axion-profile-updated', { detail: null }));
    setHasToken(false);
    setUserProfile(null);
    try {
      await auth.signOut();
    } catch (err: any) {
      console.error("Signout error:", err);
    }
  };

  const handleManualSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      await saveUserSettings(userSettings);
    } catch (err) {
      console.warn("Saved locally:", err);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const exportData = async () => {
    let logsList = [];
    try {
      logsList = await getStudyLogs(500);
    } catch (err) {
      console.warn("Error fetching logs for export:", err);
    }

    const data: Record<string, any> = {
      userSettings,
      cloudLogs: logsList
    };
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('pcbm_') || key.startsWith('axion_'))) {
        try {
          data[key] = JSON.parse(localStorage.getItem(key) || '');
        } catch (e) {
          data[key] = localStorage.getItem(key);
        }
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `axion-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const allKnownSubjects = Array.from(
    new Set([...subjects.map(s => s.id), ...(userSettings.activeSubjects || [])])
  );

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto text-slate-100 ax-enter">
      {/* Profile Card */}
      <div className="axion-surface-l2 p-6 flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl border border-white/15 bg-slate-900 overflow-hidden flex items-center justify-center shrink-0 text-xl font-bold text-emerald-400 shadow-lg">
              {userProfile?.picture ? (
                <img
                  src={userProfile.picture}
                  alt="Profile"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                userSettings.name ? userSettings.name.charAt(0).toUpperCase() : 'A'
              )}
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-bold text-white tracking-tight">Profile</h2>
              <span
                className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border ${
                  hasToken
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-white/[0.06] text-slate-400 border-white/10'
                }`}
              >
                {hasToken ? 'Connected' : 'Local'}
              </span>
            </div>
          </div>

          <button
            onClick={handleManualSaveProfile}
            disabled={isSavingProfile}
            className="ax-tap px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-2 cursor-pointer self-start sm:self-center shadow-lg"
          >
            <AxIcon name="tick" className="w-5 h-5 text-slate-950" />
            <span>{isSavingProfile ? 'Saving...' : 'Save'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Name
            </label>
            <input
              type="text"
              value={userSettings.name}
              onChange={e => setUserSettings(prev => ({ ...prev, name: e.target.value }))}
              className="w-full ios-glass-input p-3 text-xs text-white"
              placeholder="e.g., Rahul Sharma"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Track
            </label>
            <input
              type="text"
              value={userSettings.className}
              onChange={e => setUserSettings(prev => ({ ...prev, className: e.target.value }))}
              className="w-full ios-glass-input p-3 text-xs text-white"
              placeholder="e.g., 11th PCBM"
            />
          </div>
        </div>
      </div>

      {/* Syllabus Card */}
      <div className="axion-surface-l2 p-6 flex flex-col gap-5">
        <div className="border-b border-white/[0.06] pb-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AxIcon name="pages" className="w-5 h-5 text-sky-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">Syllabus</h3>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {allKnownSubjects.map(sub => {
            const conf = getSubjectConfig(sub);
            const currentVal = userSettings.subjectPageTotals?.[sub] || '';
            const currentGoal = userSettings.subjectGoals?.[sub] || '';
            return (
              <div
                key={sub}
                className="glass-inner-well p-4 rounded-2xl flex flex-col gap-3 border border-white/[0.06]"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: conf.color }}
                  >
                    {conf.name}
                  </span>
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: conf.color }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    Total Pages
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={currentVal}
                      onChange={e =>
                        setUserSettings(prev => ({
                          ...prev,
                          subjectPageTotals: {
                            ...prev.subjectPageTotals,
                            [sub]: Number(e.target.value)
                          }
                        }))
                      }
                      className="w-full ios-glass-input p-2.5 pr-8 text-xs font-mono text-white tabular-nums"
                      placeholder="650"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono uppercase">
                      pg
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    Target
                  </label>
                  <input
                    type="text"
                    value={currentGoal}
                    onChange={e =>
                      setUserSettings(prev => ({
                        ...prev,
                        subjectGoals: {
                          ...prev.subjectGoals,
                          [sub]: e.target.value
                        }
                      }))
                    }
                    className="w-full ios-glass-input p-2.5 text-xs text-white"
                    placeholder="Nov"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Calendar & Backup */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="axion-surface-l2 p-6 flex flex-col justify-between gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AxIcon name="calendar" className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white tracking-tight">Calendar</h3>
              </div>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  hasToken ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                }`}
              />
            </div>

            <div className="glass-inner-well p-4 rounded-2xl flex items-center gap-3.5">
              {userProfile?.picture ? (
                <img
                  src={userProfile.picture}
                  alt="Profile"
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-full border border-white/20"
                />
              ) : (
                <div className="w-11 h-11 bg-white/[0.08] flex items-center justify-center rounded-full border border-white/15">
                  <AxIcon name="account" className="w-5 h-5 text-white ax-icon-white" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-bold text-white text-sm truncate">
                  {userProfile ? userProfile.name : 'Not Connected'}
                </div>
                <div className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                  {hasToken ? userProfile?.email : 'Google Account'}
                </div>
              </div>
            </div>
          </div>

          {hasToken ? (
            <button
              onClick={handleDisconnect}
              className="ax-tap w-full text-xs px-5 py-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 cursor-pointer transition-colors font-bold"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              className="ax-tap w-full text-xs px-5 py-3 rounded-xl bg-white text-slate-950 hover:bg-slate-200 cursor-pointer transition-all font-bold shadow-lg flex items-center justify-center gap-2"
            >
              <AxIcon name="resync" className="w-5 h-5 text-slate-950" />
              <span>Sign In with Google</span>
            </button>
          )}
        </div>

        <div className="axion-surface-l2 p-6 flex flex-col justify-between gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AxIcon name="export" className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-bold text-white tracking-tight">Backup</h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded">
                Active
              </span>
            </div>

            <div className="glass-inner-well p-4 rounded-2xl flex items-center justify-between text-xs">
              <span className="text-slate-400">Account Backup</span>
              <span className="font-mono text-emerald-400 font-semibold">Ready</span>
            </div>
          </div>

          <button
            onClick={exportData}
            className="ax-tap w-full text-xs px-5 py-3 rounded-xl bg-white/[0.08] border border-white/15 text-white hover:bg-white/[0.14] cursor-pointer transition-colors flex items-center justify-center gap-2 font-bold"
          >
            <AxIcon name="export" className="w-5 h-5 text-emerald-400" />
            <span>Export Data</span>
          </button>
        </div>
      </div>
    </div>
  );
}

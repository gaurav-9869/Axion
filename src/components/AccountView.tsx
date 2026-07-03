import React, { useState, useEffect, useRef } from 'react';
import { UserSettings, getSubjectConfig } from '../types';

declare var google: any;

interface AccountViewProps {
    userSettings: UserSettings;
    setUserSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
}

export default function AccountView({ userSettings, setUserSettings }: AccountViewProps) {
  const [hasToken, setHasToken] = useState(false);
  const [userProfile, setUserProfile] = useState<{name: string, picture: string, email: string} | null>(null);
  const [newSubjectName, setNewSubjectName] = useState('');
  const silentRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUserProfile = async (token: string) => {
      try {
          const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
              headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
              const data = await res.json();
              setUserProfile(data);
              localStorage.setItem('gcal_profile', JSON.stringify(data));
          }
      } catch (err) { console.error("Failed to fetch profile", err); }
  };

  const startSilentRefresh = (clientId: string) => {
      if (silentRefreshRef.current) clearInterval(silentRefreshRef.current);
      silentRefreshRef.current = setInterval(() => {
          try {
              const client = google.accounts.oauth2.initTokenClient({
                  client_id: clientId,
                  scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file',
                  prompt: '',
                  callback: (response: any) => {
                      if (!response.error && response.access_token) {
                          localStorage.setItem('gcal_token', response.access_token);
                          localStorage.setItem('gcal_token_expires', String(Date.now() + response.expires_in * 1000));
                          setHasToken(true);
                      } else {
                          localStorage.removeItem('gcal_token');
                          localStorage.removeItem('gcal_token_expires');
                          setHasToken(false);
                          if (silentRefreshRef.current) clearInterval(silentRefreshRef.current);
                      }
                  },
              });
              client.requestAccessToken();
          } catch (e) {
              console.error("Silent refresh failed", e);
          }
      }, 45 * 60 * 1000);
  };

  useEffect(() => {
     const token = localStorage.getItem('gcal_token');
     const expires = localStorage.getItem('gcal_token_expires');

     if (token && expires && Date.now() < Number(expires)) {
         setHasToken(true);
         const profile = localStorage.getItem('gcal_profile');
         if (profile) {
             try { setUserProfile(JSON.parse(profile)); } catch(e) {}
         } else {
             fetchUserProfile(token);
         }
         const clientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;
         if (clientId && clientId !== 'your_google_client_id_here') {
             startSilentRefresh(clientId);
         }
     } else {
         if (token) {
             localStorage.removeItem('gcal_token');
             localStorage.removeItem('gcal_token_expires');
         }
         setHasToken(false);
     }

     return () => {
         if (silentRefreshRef.current) clearInterval(silentRefreshRef.current);
     };
  }, []);

  const handleConnect = () => {
     try {
         const clientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;
         if (!clientId || clientId === 'your_google_client_id_here') {
             alert("Please configure VITE_GOOGLE_CLIENT_ID in your environment variables/secrets.");
             return;
         }
         const client = google.accounts.oauth2.initTokenClient({
             client_id: clientId,
             scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file',
             prompt: 'consent',
             callback: (response: any) => {
                 if (response.error) {
                     alert("Auth error: " + response.error);
                 } else {
                     localStorage.setItem('gcal_token', response.access_token);
                     localStorage.setItem('gcal_token_expires', String(Date.now() + response.expires_in * 1000));
                     setHasToken(true);
                     fetchUserProfile(response.access_token);
                     startSilentRefresh(clientId);
                 }
             },
         });
         client.requestAccessToken();
     } catch(err: any) { alert("Error setting up Calendar OAuth: " + err.message); }
  };

  const handleDisconnect = () => {
      localStorage.removeItem('gcal_token');
      localStorage.removeItem('gcal_profile');
      localStorage.removeItem('gcal_token_expires');
      setHasToken(false);
      setUserProfile(null);
      if (silentRefreshRef.current) clearInterval(silentRefreshRef.current);
  };

  const exportData = () => {
      const data: Record<string, any> = {};
      for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('pcbm_')) {
             try { data[key] = JSON.parse(localStorage.getItem(key) || ''); }
             catch(e) { data[key] = localStorage.getItem(key); }
          }
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `axion-export-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
  };

  const handleAddSubject = () => {
      const trimmed = newSubjectName.trim().toLowerCase();
      if (!trimmed) return;
      if (!userSettings.activeSubjects.includes(trimmed as any)) {
          setUserSettings(prev => ({
              ...prev,
              activeSubjects: [...prev.activeSubjects, trimmed as any]
          }));
      }
      setNewSubjectName('');
  };

  const allKnownSubjects = Array.from(new Set(['phys', 'chem', 'bio', 'math', ...userSettings.activeSubjects]));

  return (
    <div className="flex flex-col gap-8 w-full max-w-4xl mx-auto text-zinc-100">
        <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-[32px] p-6 sm:p-10 flex flex-col gap-10 shadow-2xl">

             {/* SECTION 1: USER IDENTITY */}
             <div className="flex flex-col gap-5 border-b border-white/10 pb-8">
                 <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-300 flex items-center gap-2">
                     <span className="material-symbols-outlined text-[18px]">badge</span> User Identity
                 </h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                     <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Name</label>
                        <input
                           type="text" value={userSettings.name}
                           onChange={e => setUserSettings(prev => ({...prev, name: e.target.value}))}
                           className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-sm outline-none focus:border-white/30 transition-colors"
                           placeholder="e.g. Rahul"
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Target Class / Stream</label>
                        <input
                           type="text" value={userSettings.className}
                           onChange={e => setUserSettings(prev => ({...prev, className: e.target.value}))}
                           className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-sm outline-none focus:border-white/30 transition-colors"
                           placeholder="e.g. 11th PCBM"
                        />
                     </div>
                 </div>
             </div>

             {/* SECTION 2: SUBJECT MANAGER */}
             <div className="flex flex-col gap-5 border-b border-white/10 pb-8">
                 <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-300 flex items-center gap-2">
                     <span className="material-symbols-outlined text-[18px]">category</span> Subject Tracking
                 </h3>
                 <div>
                    <label className="block text-[12px] font-medium text-zinc-400 mb-4">Toggle subjects to include them in your daily Planner & Logger menus.</label>
                    <div className="flex flex-wrap gap-3 mb-5">
                        {allKnownSubjects.map(sub => {
                            const isChecked = userSettings.activeSubjects.includes(sub as any);
                            const conf = getSubjectConfig(sub);
                            return (
                               <label key={sub} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-colors ${isChecked ? 'bg-white/20 border-white/30 text-white' : 'bg-black/20 border-white/5 text-zinc-400 hover:bg-black/40'}`}>
                                   <input
                                      type="checkbox" className="hidden" checked={isChecked}
                                      onChange={(e) => {
                                          if (e.target.checked) setUserSettings(prev => ({ ...prev, activeSubjects: [...prev.activeSubjects, sub as any] }));
                                          else setUserSettings(prev => ({ ...prev, activeSubjects: prev.activeSubjects.filter(s => s !== sub) }));
                                      }}
                                   />
                                   <span className="font-semibold text-sm capitalize">{conf.name}</span>
                                   {isChecked && <span className="material-symbols-outlined text-[16px] ml-1">check</span>}
                               </label>
                            );
                        })}
                    </div>
                 </div>
             </div>

             {/* SECTION 3: SYLLABUS PAGE TOTALS */}
             <div className="flex flex-col gap-5 border-b border-white/10 pb-8">
                 <div>
                     <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-300 flex items-center gap-2">
                         <span className="material-symbols-outlined text-[18px]">menu_book</span> Syllabus Page Totals
                     </h3>
                     <p className="text-[12px] text-zinc-400 mt-2 leading-relaxed">
                         Enter the total number of pages in your syllabus for each subject. This powers the pace predictor in the Analysis tab.
                     </p>
                 </div>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     {allKnownSubjects.map(sub => {
                         const conf = getSubjectConfig(sub);
                         const currentVal = userSettings.subjectPageTotals?.[sub] || '';
                         return (
                             <div key={sub} className="flex flex-col gap-2">
                                 <label className="text-xs font-bold uppercase tracking-wider" style={{ color: conf.color }}>
                                     {conf.name}
                                 </label>
                                 <div className="relative">
                                     <input
                                         type="number"
                                         min="0"
                                         value={currentVal}
                                         onChange={e => setUserSettings(prev => ({
                                             ...prev,
                                             subjectPageTotals: {
                                                 ...prev.subjectPageTotals,
                                                 [sub]: Number(e.target.value)
                                             }
                                         }))}
                                         className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 text-sm outline-none focus:border-white/30 transition-colors font-mono"
                                         placeholder="e.g. 800"
                                         style={{ borderColor: currentVal ? `${conf.color}40` : undefined }}
                                     />
                                     <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 font-bold uppercase">pg</span>
                                 </div>
                             </div>
                         );
                     })}
                 </div>
             </div>

             {/* SECTION 4: CLOUD & LOCAL DATA */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="flex flex-col gap-4">
                     <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-300 flex items-center gap-2">
                         <span className="material-symbols-outlined text-[18px]">cloud_sync</span> Synchronization
                     </h3>
                     <div className="flex flex-col justify-between p-6 bg-black/20 border border-white/5 rounded-2xl h-full gap-6">
                         <div className="flex items-center gap-4">
                             {userProfile ? (
                                 <img src={userProfile.picture} alt="Profile" referrerPolicy="no-referrer" className="w-12 h-12 rounded-full border-2 border-white/20" />
                             ) : (
                                 <div className="w-12 h-12 bg-white/10 flex items-center justify-center rounded-full border border-white/5">
                                    <span className="material-symbols-outlined text-[24px] text-zinc-400">account_circle</span>
                                 </div>
                             )}
                             <div>
                                 <h4 className="font-bold text-zinc-100 text-base">{userProfile ? userProfile.name : 'Disconnected'}</h4>
                                 <p className="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5">
                                     {hasToken ? (
                                         <>
                                             <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                             {userProfile?.email}
                                             <span className="ml-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold">AUTO-REFRESH ON</span>
                                         </>
                                     ) : 'Requires Google OAuth'}
                                 </p>
                             </div>
                         </div>
                         {hasToken ? (
                             <button onClick={handleDisconnect} className="w-full text-sm px-6 py-3.5 rounded-xl border border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer transition-colors font-bold mt-auto">Disconnect Account</button>
                         ) : (
                             <button onClick={handleConnect} className="w-full text-sm px-6 py-3.5 rounded-xl bg-white text-black hover:bg-zinc-200 cursor-pointer transition-all font-bold mt-auto">Sign In with Google</button>
                         )}
                     </div>
                 </div>

                 <div className="flex flex-col gap-4">
                     <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-300 flex items-center gap-2">
                         <span className="material-symbols-outlined text-[18px]">hard_drive</span> Cold Storage
                     </h3>
                     <div className="flex flex-col justify-between p-6 bg-black/20 border border-white/5 rounded-2xl h-full gap-4">
                         {hasToken && (
                             <div className="border-b border-white/10 pb-4 mb-2">
                                 <h4 className="font-bold text-zinc-100 text-base">Google Drive Sync</h4>
                                 <p className="text-xs text-zinc-400 mt-1 mb-4 leading-relaxed">Restore your entire application history from the cloud backup.</p>
                                 <button 
                                     onClick={async () => {
                                         const { downloadAndRestoreBackup } = await import('../lib/driveSync');
                                         const token = localStorage.getItem('gcal_token');
                                         if (!token) return;
                                         try {
                                             const success = await downloadAndRestoreBackup(token);
                                             if (success) {
                                                alert("History restored from Google Drive! Reloading...");
                                                window.location.reload();
                                             } else {
                                                alert("No backup file found in Google Drive.");
                                             }
                                         } catch (e) {
                                             alert("Failed to restore backup.");
                                         }
                                     }}
                                     className="w-full text-sm px-6 py-3.5 rounded-xl border border-indigo-500/50 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 cursor-pointer transition-colors font-bold flex items-center justify-center gap-2"
                                 >
                                     <span className="material-symbols-outlined text-[18px]">cloud_download</span> Fetch History
                                 </button>
                             </div>
                         )}
                         <div>
                             <h4 className="font-bold text-zinc-100 text-base">Local Data Export</h4>
                             <p className="text-[12px] text-zinc-400 leading-relaxed mt-2">Download a structured JSON copy of all your tracked study hours, goals, and history.</p>
                         </div>
                         <button onClick={exportData} className="w-full text-sm px-6 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 cursor-pointer transition-colors flex items-center justify-center gap-2 font-bold mt-auto">
                             <span className="material-symbols-outlined text-[18px]">download</span> Export Database
                         </button>
                     </div>
                 </div>
             </div>

        </div>
    </div>
  );
}

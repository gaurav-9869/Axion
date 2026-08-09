import { audioManager } from "../lib/audio";
import React, { useState, useEffect } from 'react';
import { UserSettings, getSubjectConfig } from '../types';
import { auth, syncGoogleAuthWithFirebase } from '../firebase';
import { migrateLocalLogsToFirestore, showToast } from '../services/dbService';
import { saveOAuthTokens } from '../lib/auth';

declare var google: any;

interface AccountViewProps {
    userSettings: UserSettings;
    setUserSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
}

export default function AccountView({ userSettings, setUserSettings }: AccountViewProps) {
  const [hasToken, setHasToken] = useState(false);
  const [userProfile, setUserProfile] = useState<{name: string, picture: string, email: string} | null>(null);

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

  useEffect(() => {
     const token = localStorage.getItem('gcal_token');
     const expires = localStorage.getItem('gcal_token_expires');

     if (token) {
         setHasToken(true);
         const profile = localStorage.getItem('gcal_profile');
         if (profile) {
             try { setUserProfile(JSON.parse(profile)); } catch(e) {}
         } else {
             fetchUserProfile(token);
         }
     } else {
         localStorage.removeItem('gcal_token');
         localStorage.removeItem('gcal_token_expires');
         setHasToken(false);
     }
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
             scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
             prompt: 'consent',
             callback: async (response: any) => {
                 if (response.error) {
                     alert("Auth error: " + response.error);
                 } else {
                     localStorage.setItem('gcal_token', response.access_token);
                     localStorage.setItem('gcal_token_expires', String(Date.now() + response.expires_in * 1000));
                     setHasToken(true);
                     fetchUserProfile(response.access_token);

                     // Google OAuth + Firebase Auth Handshake
                     try {
                         showToast("Syncing with Cloud Firestore...", "success");
                         const firebaseUser = await syncGoogleAuthWithFirebase(null, response.access_token);
                         if (firebaseUser) {
                             // Perform one-time migration
                             await migrateLocalLogsToFirestore(firebaseUser.uid);
                         }
                     } catch (fbErr: any) {
                         console.error("Firebase Handshake sync failed:", fbErr);
                         showToast(`Firebase Sync Failed: ${fbErr.message || fbErr}`, "error");
                     }
                 }
             },
         });
         client.requestAccessToken();
     } catch(err: any) { alert("Error setting up Google Auth: " + err.message); }
  };

  const handleDisconnect = async () => {
      localStorage.removeItem('gcal_token');
      localStorage.removeItem('gcal_profile');
      localStorage.removeItem('gcal_token_expires');
      setHasToken(false);
      setUserProfile(null);
      try {
          await auth.signOut();
          showToast("Successfully disconnected from Google & Firebase Cloud.", "success");
      } catch (err: any) {
          console.error("Firebase signout error:", err);
      }
  };

  const exportData = () => {
      const data: Record<string, any> = {};
      for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('pcbm_') || key.startsWith('axion_'))) {
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

  const allKnownSubjects = Array.from(new Set(['phys', 'chem', 'bio', 'math', ...userSettings.activeSubjects]));

  return (
    <div className="flex flex-col gap-8 w-full max-w-4xl mx-auto text-zinc-100 animate-ios-fade-in">
        <div className="ios-glass-panel p-6 sm:p-10 flex flex-col gap-10 shadow-2xl">

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
                           className="w-full ios-glass-card-nested p-3.5 text-sm outline-none focus:border-white/30 transition-colors"
                           placeholder="e.g. Rahul"
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Target Class / Stream</label>
                        <input
                           type="text" value={userSettings.className}
                           onChange={e => setUserSettings(prev => ({...prev, className: e.target.value}))}
                           className="w-full ios-glass-card-nested p-3.5 text-sm outline-none focus:border-white/30 transition-colors"
                           placeholder="e.g. 11th PCBM"
                        />
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
                                         className="w-full ios-glass-card-nested p-3.5 text-sm outline-none focus:border-white/30 transition-colors font-mono"
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
                         <span className="material-symbols-outlined text-[18px]">cloud_sync</span> Google Calendar Sync
                     </h3>
                     <div className="flex flex-col justify-between p-6 ios-glass-card-nested h-full gap-6">
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
                                         </>
                                     ) : 'Requires Google OAuth'}
                                 </p>
                             </div>
                         </div>
                         {hasToken ? (
                             <button onClick={handleDisconnect} className="w-full text-sm px-6 py-3.5 rounded-xl border border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer transition-colors font-bold mt-auto">Disconnect Calendar</button>
                         ) : (
                             <button onClick={handleConnect} className="w-full text-sm px-6 py-3.5 rounded-xl bg-white text-black hover:bg-zinc-200 cursor-pointer transition-all font-bold mt-auto">Sign In with Google</button>
                         )}
                     </div>
                 </div>

                 <div className="flex flex-col gap-4">
                     <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-300 flex items-center gap-2">
                         <span className="material-symbols-outlined text-[18px]">hard_drive</span> Cloud Firestore Database
                     </h3>
                     <div className="flex flex-col justify-between p-6 ios-glass-card-nested h-full gap-4">
                         <div>
                             <h4 className="font-bold text-zinc-100 text-base flex items-center gap-2">
                               <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                               Cloud Persistence
                             </h4>
                             <p className="text-[12px] text-zinc-400 leading-relaxed mt-2">
                               All morning plans, study logs, chat history, and settings are continuously saved to your Firebase Firestore database.
                             </p>
                         </div>
                         <button onClick={exportData} className="w-full text-sm px-6 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 cursor-pointer transition-colors flex items-center justify-center gap-2 font-bold mt-auto">
                             <span className="material-symbols-outlined text-[18px]">download</span> Export Database Copy
                         </button>
                     </div>
                 </div>
             </div>

        </div>
    </div>
  );
}

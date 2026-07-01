import React from 'react';
import { UserSettings } from '../types';

interface AccountViewProps {
  userSettings: UserSettings;
  setUserSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
}

export default function AccountView({ userSettings, setUserSettings }: AccountViewProps) {
  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col gap-8 w-full">
      <h2 className="text-2xl font-bold tracking-tight text-white">Account Settings</h2>
      
      <div className="bg-black/40 backdrop-blur-md border border-white/10 p-6 rounded-3xl flex flex-col gap-6 shadow-2xl">
        <div>
          <label className="text-sm text-zinc-400 block mb-2">Display Name</label>
          <input 
            type="text" 
            value={userSettings.name} 
            onChange={e => setUserSettings(prev => ({ ...prev, name: e.target.value }))}
            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-white/30"
            placeholder="e.g. Alex"
          />
        </div>
        <div>
          <label className="text-sm text-zinc-400 block mb-2">Class / Academic Year</label>
          <input 
            type="text" 
            value={userSettings.className} 
            onChange={e => setUserSettings(prev => ({ ...prev, className: e.target.value }))}
            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-white/30"
            placeholder="e.g. University Year 2"
          />
        </div>
      </div>
    </div>
  );
}

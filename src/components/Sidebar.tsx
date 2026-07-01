import React from 'react';
import { UserSettings } from '../types';

interface SidebarProps {
  currentTab: string;
  setTab: (tab: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  profileImg: string | null;
  userSettings: UserSettings;
}

export default function Sidebar({ currentTab, setTab, isOpen, setIsOpen, profileImg, userSettings }: SidebarProps) {
  const tabs = [
    { id: 'command', label: 'Tracker Node' },
    { id: 'archive', label: 'Refs Directory' },
    { id: 'analysis', label: 'Focus Analysis' },
    { id: 'account', label: 'Account' },
    { id: 'settings', label: 'Liquid Blur' }
  ];

  return (
    <div className={`fixed inset-y-0 left-0 z-20 w-64 bg-black/80 backdrop-blur-xl border-r border-white/10 p-6 transform transition-transform duration-300 md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-xl font-bold tracking-widest text-white">AXION</h2>
        <button className="md:hidden text-zinc-400 text-2xl" onClick={() => setIsOpen(false)}>&times;</button>
      </div>
      <nav className="flex flex-col gap-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setTab(tab.id); setIsOpen(false); }}
            className={`text-left px-4 py-3 rounded-xl transition-all ${currentTab === tab.id ? 'bg-white/10 text-white font-medium' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {userSettings.name && (
        <div className="absolute bottom-6 left-6 right-6 flex items-center gap-3">
          {profileImg ? (
            <img src={profileImg} alt="Profile" className="w-10 h-10 rounded-full" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-white">{userSettings.name[0]}</div>
          )}
          <div className="flex flex-col truncate">
            <span className="text-sm text-white font-medium truncate">{userSettings.name}</span>
            <span className="text-xs text-zinc-500 truncate">{userSettings.className}</span>
          </div>
        </div>
      )}
    </div>
  );
}

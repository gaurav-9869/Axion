import React from 'react';
import { UserSettings } from '../types';
import { sound } from '../utils/sound';

export interface NavigationDockProps {
  currentTab: string;
  setTab: (tab: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  profileImg?: string | null;
  userSettings?: UserSettings;
  revisionBadgeCount?: number;
}

export default function NavigationDock({
  currentTab,
  setTab,
  setIsOpen,
  revisionBadgeCount = 0
}: NavigationDockProps) {
  const navItems = [
    { id: 'command', label: 'Tracker', icon: 'tasks' },
    {
      id: 'revision',
      label: 'Revision',
      icon: 'revise',
      badge: revisionBadgeCount > 0 ? revisionBadgeCount : undefined
    },
    { id: 'archive', label: 'Archive', icon: 'archive' },
    { id: 'analysis', label: 'Analysis', icon: 'analysis' },
    { id: 'weekly', label: 'Goals', icon: 'goals' },
    { id: 'settings', label: 'Settings', icon: 'settings' }
  ];

  const activeNavIndex = navItems.findIndex(item => item.id === currentTab);

  const onSelectRoute = (id: string) => {
    sound.playClick();
    setTab(id);
    setIsOpen(false);
  };

  return (
    <>
      {/* TABLET & DESKTOP (min-width: 768px): Persistently Visible Icon-Only Dock (72px) */}
      <aside
        className="hidden md:flex static shrink-0 h-full w-[72px] z-[40] axion-dock-l1 rounded-[24px] flex-col justify-between p-3.5 border border-white/[0.08] select-none"
        style={{
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          background: 'rgba(13, 19, 31, 0.82)'
        }}
      >
        <div className="flex flex-col gap-6 w-full items-center">
          {/* Brand Logo */}
          <div className="flex items-center justify-center pt-1">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAobVYE0QokyD3GCSUhKvgVu4VEsx-UrFhvGlrtVdm1KkhyGXgObNLGGrYQyMeMWPK4V6n8OBoSQ1EyrZBJIAaS31dD0zYX0hg_mIsPF1nNWGypveB4wqnM9K1-jfB66n6ds-sGq0TbxFplPJtIl6Cti8P8xveTxRWudRY51pp6Qvg55l65tpE5CWTa6rCVJODVjJFnUzms3Umz-Z39yW2YFpoUCfcf-nOIeCS5JBS8SSKc_Bd9zDbUCwXfSZ3tobyc1Io"
              alt="Axion Logo"
              className="w-8 h-8 rounded-xl object-cover ring-1 ring-white/10 shadow-sm shrink-0"
            />
          </div>

          {/* Primary Navigation Items with Autonomous Sliding Glider Track (Icon Only) */}
          <nav className="relative flex flex-col gap-1.5 w-full">
            {activeNavIndex >= 0 && (
              <div
                aria-hidden="true"
                className="dock-active-glider left-0 right-0 h-[42px]"
                style={{
                  transform: `translate3d(0, ${activeNavIndex * 48}px, 0)`
                }}
              />
            )}

            {navItems.map(route => {
              const isActive = currentTab === route.id;
              return (
                <button
                  key={route.id}
                  onClick={() => onSelectRoute(route.id)}
                  aria-label={route.label}
                  className={`ax-pressable relative z-10 h-[42px] w-full flex items-center justify-center rounded-xl transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <svg
                    className={`ax-icon w-5 h-5 shrink-0 ${
                      isActive ? 'stroke-white text-white' : 'stroke-slate-400 text-slate-400'
                    }`}
                  >
                    <use href={`#ax-${route.icon}`} />
                  </svg>

                  {route.badge !== undefined && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 text-slate-950 text-[9px] font-mono font-bold flex items-center justify-center tabular-nums">
                      {route.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Status Indicator Dot */}
        <div className="pt-3 border-t border-white/[0.06] flex items-center justify-center w-full">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
        </div>
      </aside>

      {/* MOBILE (< 768px): Detached Horizontal Floating Capsule (Icon-Only, No Text Expansion) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-[75] w-fit max-w-[94vw] flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-white/[0.10] shadow-[0_20px_48px_rgba(0,0,0,0.75)]"
        style={{
          background: 'rgba(18, 26, 45, 0.95)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)'
        }}
      >
        {navItems.map(route => {
          const isActive = currentTab === route.id;
          return (
            <button
              key={route.id}
              onClick={() => onSelectRoute(route.id)}
              aria-label={route.label}
              className={`ax-pressable relative w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'text-white font-semibold bg-emerald-500/15 border border-emerald-500/35 shadow-[0_0_16px_rgba(16,185,129,0.25)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              <svg
                className={`ax-icon w-5 h-5 shrink-0 ${
                  isActive ? 'stroke-white text-white' : 'stroke-slate-400 text-slate-400'
                }`}
              >
                <use href={`#ax-${route.icon}`} />
              </svg>
              {route.badge !== undefined && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 text-slate-950 text-[9px] font-mono font-bold flex items-center justify-center tabular-nums">
                  {route.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}


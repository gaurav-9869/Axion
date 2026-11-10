import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const installed = await install();
      if (!installed) {
        setShowGuide(true);
      }
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`flex items-center gap-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold shadow-sm transition active:scale-95 ${className}`}
        title="Install Axion as an app"
      >
        <span className="material-symbols-outlined text-[16px]">
          {isIOS ? 'ios_share' : 'install_mobile'}
        </span>
        <span>{isIOS ? 'Install on iOS' : 'Install App'}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-white/15 p-6 shadow-2xl text-zinc-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-400">install_mobile</span>
                <h3 className="text-base font-bold text-white">
                  {isIOS ? 'Install on iPhone / iPad' : 'Install Axion App'}
                </h3>
              </div>
              <button 
                onClick={() => setShowGuide(false)}
                className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {isIOS ? (
              <div className="text-xs text-zinc-300 space-y-2.5 leading-relaxed">
                <p>1. Tap the <strong className="text-white">Share</strong> button in Safari's bottom toolbar.</p>
                <p>2. Scroll down and select <strong className="text-white">Add to Home Screen</strong>.</p>
                <p>3. Tap <strong className="text-white">Add</strong> in the top right.</p>
              </div>
            ) : (
              <div className="text-xs text-zinc-300 space-y-2.5 leading-relaxed">
                <p>To install Axion on your Android device:</p>
                <div className="p-3 bg-black/40 rounded-xl border border-white/10 space-y-2">
                  <p className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">1.</span>
                    <span>Tap the <strong className="text-white">three dots menu (⋮)</strong> at the top right of Chrome / browser.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">2.</span>
                    <span>Select <strong className="text-white">"Install app"</strong> or <strong className="text-white">"Add to Home screen"</strong>.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">3.</span>
                    <span>Confirm by tapping <strong className="text-white">Install</strong>.</span>
                  </p>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Once installed, Axion will launch full-screen directly from your home screen with offline caching.
                </p>
              </div>
            )}

            <button
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 py-2.5 text-xs font-bold text-black transition"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

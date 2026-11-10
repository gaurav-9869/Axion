import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500/90 backdrop-blur-md border border-amber-400/30 px-3.5 py-2 text-xs font-medium text-white shadow-2xl animate-fade-in">
      <span className="h-2 w-2 rounded-full bg-white animate-ping" />
      <span>Offline Mode — Cached data is being used.</span>
    </div>
  );
};

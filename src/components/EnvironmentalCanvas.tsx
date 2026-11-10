import React, { useEffect, useState } from 'react';
import { UserSettings } from '../types';

interface EnvironmentalCanvasProps {
  userSettings?: UserSettings;
  dimmed?: boolean;
}

export default function EnvironmentalCanvas({ userSettings, dimmed = false }: EnvironmentalCanvasProps) {
  const [wallpaperSrc, setWallpaperSrc] = useState<string>('');

  useEffect(() => {
    const syncWallpaper = () => {
      const custom = userSettings?.customWallpaper || localStorage.getItem('axion_custom_wallpaper') || '';
      setWallpaperSrc(custom.trim());
    };

    syncWallpaper();
    window.addEventListener('axion-wallpaper-change', syncWallpaper);
    window.addEventListener('storage', syncWallpaper);
    return () => {
      window.removeEventListener('axion-wallpaper-change', syncWallpaper);
      window.removeEventListener('storage', syncWallpaper);
    };
  }, [userSettings?.customWallpaper]);

  const isGradient = wallpaperSrc.startsWith('radial-gradient') || wallpaperSrc.startsWith('linear-gradient');
  const isImage = Boolean(wallpaperSrc) && !isGradient;

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none" aria-hidden="true">
      {/* Level 0: Environmental Substrate */}
      {isImage ? (
        <img
          src={wallpaperSrc}
          alt=""
          className="fixed inset-0 w-full h-full object-cover scale-[1.02] transition-all duration-300"
        />
      ) : (
        <div
          className="ios-wallpaper-canvas wallpaper-layer"
          style={
            isGradient
              ? { backgroundImage: wallpaperSrc }
              : undefined
          }
        />
      )}

      {/* Radial Vignette Scrim */}
      <div
        className="ios-wallpaper-dimmer wallpaper-scrim"
        style={
          dimmed
            ? {
                background:
                  'radial-gradient(ellipse at center, rgba(6, 10, 18, 0.72) 0%, rgba(4, 8, 16, 0.94) 100%)'
              }
            : undefined
        }
      />
    </div>
  );
}

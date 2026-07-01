import React from 'react';

interface SettingsViewProps {
  glassBlur: number;
  setGlassBlur: (val: number) => void;
  glassOpacity: number;
  setGlassOpacity: (val: number) => void;
}

export default function SettingsView({ glassBlur, setGlassBlur, glassOpacity, setGlassOpacity }: SettingsViewProps) {
  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col gap-8 w-full">
      <h2 className="text-2xl font-bold tracking-tight text-white">Liquid Blur Config</h2>
      
      <div className="bg-black/40 backdrop-blur-md border border-white/10 p-6 rounded-3xl flex flex-col gap-6 shadow-2xl">
        <div>
          <label className="text-sm text-zinc-400 flex justify-between mb-2">
            <span>Glass Blur Amount</span>
            <span className="text-white">{glassBlur}px</span>
          </label>
          <input 
            type="range" 
            min="0" max="40" 
            value={glassBlur} 
            onChange={e => setGlassBlur(Number(e.target.value))}
            className="w-full accent-white"
          />
        </div>
        <div>
          <label className="text-sm text-zinc-400 flex justify-between mb-2">
            <span>Glass Opacity Depth</span>
            <span className="text-white">{Math.round(glassOpacity * 100)}%</span>
          </label>
          <input 
            type="range" 
            min="0" max="1" step="0.05"
            value={glassOpacity} 
            onChange={e => setGlassOpacity(Number(e.target.value))}
            className="w-full accent-white"
          />
        </div>
      </div>
    </div>
  );
}

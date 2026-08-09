import { sound } from "../utils/sound";
import React, { useRef, useState, useEffect } from 'react';
import { UserSettings, SubjectPreference, PRESET_COLORS, dynamicSubjects } from '../types';
import { migrateLocalStorageToFirestore, saveSubjectPreferences, getSubjectPreferences } from '../services/dbService';
import { nanoid } from 'nanoid';

interface SettingsViewProps {
    glassBlur: number;
    setGlassBlur: (val: number) => void;
    glassOpacity: number;
    setGlassOpacity: (val: number) => void;
    panelOpacity: number;
    setPanelOpacity: (val: number) => void;
    userSettings: UserSettings;
    setUserSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
}

export default function SettingsView({ 
    glassBlur, 
    setGlassBlur, 
    glassOpacity, 
    setGlassOpacity,
    panelOpacity,
    setPanelOpacity,
    userSettings,
    setUserSettings
}: SettingsViewProps) {
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const [subjects, setSubjects] = useState<SubjectPreference[]>(() => [...dynamicSubjects]);
  const [newSubName, setNewSubName] = useState('');
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);

  useEffect(() => {
    async function loadSubjects() {
      const prefs = await getSubjectPreferences();
      if (prefs && prefs.length > 0) {
        setSubjects(prefs);
      }
    }
    loadSubjects();
  }, []);

  const handleSaveSubjects = async (updated: SubjectPreference[]) => {
    setSubjects(updated);
    await saveSubjectPreferences(updated);
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim()) return;

    const name = newSubName.trim();
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '') || nanoid(6);

    if (subjects.some(s => s.id === id || s.name.toLowerCase() === name.toLowerCase())) {
      sound.playError();
      alert("A subject with this name already exists!");
      return;
    }

    const preset = PRESET_COLORS[selectedColorIndex];
    const newSubject: SubjectPreference = {
      id,
      name,
      color: preset.hex,
      bg: preset.bg,
      text: preset.text,
      border: preset.border
    };

    const updated = [...subjects, newSubject];
    await handleSaveSubjects(updated);
    setNewSubName('');
    sound.playSuccess();
  };

  const handleDeleteSubject = async (id: string) => {
    if (subjects.length <= 1) {
      sound.playError();
      alert("You must have at least one subject!");
      return;
    }

    const updated = subjects.filter(s => s.id !== id);
    await handleSaveSubjects(updated);
    sound.playClick();
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const updated = [...subjects];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;
    await handleSaveSubjects(updated);
    sound.playClick();
  };

  const handleMoveDown = async (index: number) => {
    if (index === subjects.length - 1) return;
    const updated = [...subjects];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    await handleSaveSubjects(updated);
    sound.playClick();
  };

  const [apiKeyInput, setApiKeyInput] = useState(() => localStorage.getItem('axion_gemini_api_key') || localStorage.getItem('gemini_api_key') || '');
  const [saveStatus, setSaveStatus] = useState('');
  const [migrationStatus, setMigrationStatus] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);

  const isEnvKeyConfigured = !!(import.meta as any).env.VITE_GEMINI_API_KEY && (import.meta as any).env.VITE_GEMINI_API_KEY !== 'dummy';

  const handleSaveApiKey = () => {
      const trimmed = apiKeyInput.trim();
      if (!trimmed) {
          localStorage.removeItem('axion_gemini_api_key');
          localStorage.removeItem('gemini_api_key');
          setSaveStatus('API key cleared successfully.');
      } else {
          localStorage.setItem('axion_gemini_api_key', trimmed);
          setSaveStatus('API key saved successfully!');
      }
      sound.playClick();
      setTimeout(() => setSaveStatus(''), 4000);
  };

  const handleClearApiKey = () => {
      setApiKeyInput('');
      localStorage.removeItem('axion_gemini_api_key');
      localStorage.removeItem('gemini_api_key');
      setSaveStatus('API key cleared successfully.');
      sound.playClick();
      setTimeout(() => setSaveStatus(''), 4000);
  };

  const handleMigration = async () => {
      setIsMigrating(true);
      setMigrationStatus('Migrating data to Cloud Firestore...');
      sound.playSwoosh();
      const res = await migrateLocalStorageToFirestore();
      if (res.success) {
          setMigrationStatus(`Successfully synced ${res.count} records to Cloud Firestore!`);
          sound.playSuccess();
      } else {
          setMigrationStatus('Migration process completed or offline mode active.');
          sound.playClick();
      }
      setIsMigrating(false);
      setTimeout(() => setMigrationStatus(''), 6000);
  };

  const handleExportBackup = () => {
      sound.playClick();
      const data = {
          plans: localStorage.getItem('axion_plans'),
          logs: localStorage.getItem('axion_logs'),
          settings: localStorage.getItem('axion_settings'),
          archive: localStorage.getItem('axion_archive')
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `axion_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const data = JSON.parse(event.target?.result as string);
              if (data.plans) localStorage.setItem('axion_plans', data.plans);
              if (data.logs) localStorage.setItem('axion_logs', data.logs);
              if (data.settings) localStorage.setItem('axion_settings', data.settings);
              if (data.archive) localStorage.setItem('axion_archive', data.archive);
              sound.playSuccess();
              alert("Backup restored successfully! Reloading application...");
              window.location.reload();
          } catch (err) {
              sound.playError();
              alert("Invalid backup file.");
          }
      };
      reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const rawDataUrl = event.target?.result as string;
          const img = new Image();
          img.onload = () => {
              const MAX_WIDTH = 1920;
              const MAX_HEIGHT = 1080;
              let width = img.width;
              let height = img.height;
              
              if (width > height) {
                  if (width > MAX_WIDTH) {
                      height *= MAX_WIDTH / width;
                      width = MAX_WIDTH;
                  }
              } else {
                  if (height > MAX_HEIGHT) {
                      width *= MAX_HEIGHT / height;
                      height = MAX_HEIGHT;
                  }
              }
              
              const canvas = document.createElement('canvas');
              canvas.width = Math.floor(width);
              canvas.height = Math.floor(height);
              const ctx = canvas.getContext('2d');
              
              if (ctx) {
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                  
                  const thumbCanvas = document.createElement('canvas');
                  const thumbCtx = thumbCanvas.getContext('2d', { willReadFrequently: true });
                  if (thumbCtx) {
                      thumbCanvas.width = 100;
                      thumbCanvas.height = Math.floor(100 * (height / width));
                      thumbCtx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
                      const imgData = thumbCtx.getImageData(0, 0, thumbCanvas.width, thumbCanvas.height);
                      
                      let r = 0, g = 0, b = 0, a = 0;
                      for (let i = 0; i < imgData.data.length; i += 4) {
                          r += imgData.data[i];
                          g += imgData.data[i + 1];
                          b += imgData.data[i + 2];
                          a++;
                      }
                      r = Math.floor(r / a);
                      g = Math.floor(g / a);
                      b = Math.floor(b / a);
                      
                      const max = Math.max(r, g, b);
                      if (max > 0) {
                          const boost = 255 / max;
                          r = Math.min(255, Math.floor(r * boost * 0.8));
                          g = Math.min(255, Math.floor(g * boost * 0.8));
                          b = Math.min(255, Math.floor(b * boost * 0.8));
                      }
                      
                      const dominantColor = `rgb(${r}, ${g}, ${b})`;
                      document.documentElement.style.setProperty('--wallpaper-url', `url("${compressedDataUrl}")`);
                      document.documentElement.style.setProperty('--theme-primary', dominantColor);
                      
                      try {
                          localStorage.setItem('custom_wallpaper_url', compressedDataUrl);
                          localStorage.setItem('custom_wallpaper_color', dominantColor);
                          sound.playSuccess();
                      } catch (e) {
                          alert("Failed to save wallpaper. Image might still be too large.");
                      }
                  }
              }
          };
          img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-4xl mx-auto text-zinc-100 animate-ios-fade-in">
        <div className="ios-glass-panel p-6 sm:p-10 flex flex-col gap-10 shadow-2xl">
             
             {/* Workspace Interface & Glass Controls */}
             <div className="flex flex-col gap-5 border-b border-white/10 pb-8">
                 <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                     <span className="material-symbols-outlined text-[18px]">palette</span> Workspace Interface
                 </h3>
                 
                 <div className="flex flex-col gap-4">
                     <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Adaptive Wallpaper Engine</label>
                     <p className="text-[12px] text-zinc-400 max-w-xl leading-relaxed">
                         Upload an image under 1 MB. The internal canvas engine will analyze the image data and automatically re-render the application's primary accents to match the dominant color scheme.
                     </p>
                     
                     <input 
                         type="file" 
                         accept="image/*" 
                         className="hidden" 
                         ref={fileInputRef} 
                         onChange={handleFileUpload} 
                     />
                     <button 
                         onClick={() => fileInputRef.current?.click()}
                         className="flex items-center justify-center gap-3 w-full py-5 rounded-2xl border-2 border-dashed border-white/20 hover:border-emerald-400/50 hover:bg-white/5 transition-all cursor-pointer font-bold tracking-wide"
                     >
                         <span className="material-symbols-outlined text-[24px] text-emerald-400">imagesmode</span>
                         Upload Custom Wallpaper
                     </button>
                     <button
                         onClick={() => {
                             sound.playClick();
                             localStorage.removeItem('custom_wallpaper_url');
                             localStorage.removeItem('custom_wallpaper_color');
                             document.documentElement.style.setProperty('--wallpaper-url', 'radial-gradient(circle at top left, #1e1b4b 0%, #0a0f18 100%)');
                             document.documentElement.style.setProperty('--theme-primary', '#10B981');
                         }}
                         className="flex items-center justify-center gap-3 w-full py-3 mt-2 rounded-2xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer font-bold text-xs tracking-wide text-zinc-400 hover:text-zinc-200"
                     >
                         <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                         Restore Default Wallpaper
                     </button>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6 ios-glass-card-nested p-6">
                     <div className="flex flex-col gap-3 md:col-span-2">
                         <div className="flex justify-between items-center text-xs">
                             <label className="font-semibold text-zinc-400 uppercase tracking-wider">UI Sound Effects</label>
                             <button 
                               onClick={() => {
                                 const nextVal = userSettings.uiSounds === false;
                                 setUserSettings(prev => ({ ...prev, uiSounds: nextVal }));
                                 sound.setEnabled(nextVal);
                                 if (nextVal) sound.playClick();
                               }}
                               className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${userSettings.uiSounds !== false ? 'bg-emerald-500' : 'bg-zinc-700'}`}
                             >
                                 <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${userSettings.uiSounds !== false ? 'left-7' : 'left-1'}`} />
                             </button>
                         </div>
                         <p className="text-[10px] text-zinc-500">Tactile audio feedback for buttons and actions.</p>
                     </div>

                     <div className="flex flex-col gap-3">
                         <div className="flex justify-between items-center text-xs">
                             <label className="font-semibold text-zinc-400 uppercase tracking-wider">Glass Opacity / Blur Intensity</label>
                             <span className="font-mono bg-black/40 border border-white/10 px-2 py-1 rounded font-bold" style={{ color: 'var(--theme-primary)' }}>{glassBlur}px</span>
                         </div>
                         <input 
                             type="range" min="4" max="48" step="1" 
                             value={glassBlur} 
                             onChange={(e) => setGlassBlur(Number(e.target.value))}
                             onMouseUp={() => sound.playClick()} 
                             onTouchEnd={() => sound.playClick()} 
                             style={{ accentColor: "var(--theme-primary)" }} 
                             className="w-full bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                         />
                     </div>

                     <div className="flex flex-col gap-3">
                         <div className="flex justify-between items-center text-xs">
                             <label className="font-semibold text-zinc-400 uppercase tracking-wider">Background Dimming Overlay</label>
                             <span className="font-mono bg-black/40 border border-white/10 px-2 py-1 rounded font-bold" style={{ color: 'var(--theme-primary)' }}>{Math.round(glassOpacity * 100)}%</span>
                         </div>
                         <input 
                             type="range" min="0.00" max="0.90" step="0.05" 
                             value={glassOpacity} 
                             onChange={(e) => setGlassOpacity(Number(e.target.value))}
                             onMouseUp={() => sound.playClick()} 
                             onTouchEnd={() => sound.playClick()} 
                             style={{ accentColor: "var(--theme-primary)" }} 
                             className="w-full bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                         />
                     </div>

                     <div className="flex flex-col gap-3">
                         <div className="flex justify-between items-center text-xs">
                             <label className="font-semibold text-zinc-400 uppercase tracking-wider">Panel Opacity</label>
                             <span className="font-mono bg-black/40 border border-white/10 px-2 py-1 rounded font-bold" style={{ color: 'var(--theme-primary)' }}>{Math.round(panelOpacity * 100)}%</span>
                         </div>
                         <input 
                             type="range" min="0.00" max="0.90" step="0.05"
                             value={panelOpacity} 
                             onChange={(e) => setPanelOpacity(Number(e.target.value))}
                             onMouseUp={() => sound.playClick()} 
                             onTouchEnd={() => sound.playClick()} 
                             style={{ accentColor: "var(--theme-primary)" }} 
                             className="w-full bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                         />
                     </div>
                 </div>
             </div>

             {/* Dynamic Subject Management Section */}
             <div className="flex flex-col gap-5 border-b border-white/10 pb-8">
                 <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                     <span className="material-symbols-outlined text-[18px]">auto_stories</span> Dynamic Subject Management
                 </h3>
                 
                 <div className="flex flex-col gap-4">
                     <p className="text-[12px] text-zinc-400 max-w-xl leading-relaxed">
                         Add, delete, and reorder subjects to customize your study curriculum. Reordering changes the sequence of cards and inputs across all views.
                     </p>

                     {/* Subject List */}
                     <div className="grid grid-cols-1 gap-2.5 mt-2">
                         {subjects.map((sub, index) => (
                             <div 
                                 key={sub.id} 
                                 className="flex items-center justify-between p-3.5 ios-glass-card-nested hover:bg-white/5 transition-colors"
                             >
                                 <div className="flex items-center gap-3 min-w-0 pr-4">
                                     <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: sub.color }} />
                                     <span className="font-bold text-sm text-white truncate">{sub.name}</span>
                                     <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest px-1.5 py-0.5 rounded bg-black/40">ID: {sub.id}</span>
                                 </div>
                                 <div className="flex items-center gap-1 shrink-0">
                                     <button 
                                         onClick={() => handleMoveUp(index)}
                                         disabled={index === 0}
                                         className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/5 hover:border-white/10 hover:bg-white/5 transition-all text-zinc-400 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                                         title="Move Up"
                                     >
                                         <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                                     </button>
                                     <button 
                                         onClick={() => handleMoveDown(index)}
                                         disabled={index === subjects.length - 1}
                                         className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/5 hover:border-white/10 hover:bg-white/5 transition-all text-zinc-400 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                                         title="Move Down"
                                     >
                                         <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                                     </button>
                                     <button 
                                         onClick={() => handleDeleteSubject(sub.id)}
                                         className="w-8 h-8 rounded-lg flex items-center justify-center border border-rose-500/10 hover:border-rose-500/30 hover:bg-rose-500/10 transition-all text-rose-400 cursor-pointer"
                                         title="Delete"
                                     >
                                         <span className="material-symbols-outlined text-[18px]">delete</span>
                                     </button>
                                 </div>
                             </div>
                         ))}
                     </div>

                     {/* Add Subject Form */}
                     <form onSubmit={handleAddSubject} className="flex flex-col gap-4 mt-4 p-4 rounded-2xl bg-black/25 border border-white/5">
                         <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Add Custom Subject</div>
                         
                         <div className="flex flex-col sm:flex-row gap-3">
                             <input 
                                 type="text"
                                 placeholder="Subject Name (e.g. English, Computer Science)..."
                                 value={newSubName}
                                 onChange={(e) => setNewSubName(e.target.value)}
                                 className="flex-1 ios-glass-card-nested px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-400/50"
                             />
                             <button 
                                 type="submit"
                                 className="px-6 py-3 rounded-xl bg-emerald-500 text-black font-bold text-sm tracking-wide transition-all cursor-pointer hover:bg-emerald-400 shrink-0"
                             >
                                 Add Subject
                             </button>
                         </div>

                         {/* Color Selection Palette */}
                         <div className="flex flex-col gap-2 mt-1">
                             <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Select Theme Color</div>
                             <div className="flex flex-wrap gap-2.5">
                                 {PRESET_COLORS.map((color, idx) => (
                                     <button
                                         key={color.name}
                                         type="button"
                                         onClick={() => {
                                             setSelectedColorIndex(idx);
                                             sound.playClick();
                                         }}
                                         className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer border ${idx === selectedColorIndex ? 'border-white scale-110 shadow-lg' : 'border-white/10 hover:scale-105'}`}
                                         style={{ backgroundColor: color.hex }}
                                         title={color.name}
                                     >
                                         {idx === selectedColorIndex && (
                                             <span className="material-symbols-outlined text-black font-bold text-[18px]">check</span>
                                         )}
                                     </button>
                                 ))}
                             </div>
                         </div>
                     </form>
                 </div>
             </div>

             {/* Gemini API Key Configuration */}
             <div className="flex flex-col gap-5 border-b border-white/10 pb-8">
                 <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                     <span className="material-symbols-outlined text-[18px]">api</span> Gemini API Configuration
                 </h3>
                 
                 <div className="flex flex-col gap-4">
                     <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Custom API Key</label>
                     <p className="text-[12px] text-zinc-400 max-w-xl leading-relaxed">
                         Provide your own Gemini API Key to enable AI assistance and session analysis.
                     </p>
                     
                     <div className="flex flex-col sm:flex-row gap-3 mt-2">
                         <input 
                             type="password"
                             placeholder="Enter your Gemini API Key..."
                             value={apiKeyInput}
                             onChange={(e) => setApiKeyInput(e.target.value)}
                             className="flex-1 ios-glass-card-nested px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-400/50"
                         />
                         <div className="flex gap-2">
                             <button 
                                 onClick={handleSaveApiKey}
                                 className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-500/20 border border-emerald-400/30 hover:bg-emerald-500/30 text-emerald-400 font-bold tracking-wide text-sm transition-all cursor-pointer"
                             >
                                 Save Key
                             </button>
                             {apiKeyInput && (
                                 <button 
                                     onClick={handleClearApiKey}
                                     className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/25 text-red-400 font-bold tracking-wide text-sm transition-all cursor-pointer"
                                 >
                                     Clear
                                 </button>
                             )}
                         </div>
                     </div>
                     {saveStatus && (
                         <p className="text-[11px] text-emerald-400/90 flex items-center gap-1.5 font-medium mt-1">
                             <span className="material-symbols-outlined text-[14px]">check_circle</span> {saveStatus}
                         </p>
                     )}
                     {isEnvKeyConfigured && !apiKeyInput && (
                         <p className="text-[11px] text-emerald-400/80 flex items-center gap-1.5 font-medium mt-1">
                             <span className="material-symbols-outlined text-[14px]">info</span> Active: Environment API key is configured.
                         </p>
                     )}
                 </div>
             </div>

         </div>
    </div>
  );
}

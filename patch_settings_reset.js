import fs from 'fs';
let code = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

const replacement = `                     <button 
                         onClick={() => fileInputRef.current?.click()}
                         className="flex items-center justify-center gap-3 w-full py-5 rounded-2xl border-2 border-dashed border-white/20 hover:border-emerald-400/50 hover:bg-white/5 transition-all cursor-pointer font-bold tracking-wide"
                     >
                         <span className="material-symbols-outlined text-[24px] text-emerald-400">imagesmode</span>
                         Upload Custom Wallpaper
                     </button>
                     <button
                         onClick={() => {
                             audioManager.playDigitalTick();
                             localStorage.removeItem('custom_wallpaper_url');
                             localStorage.removeItem('custom_wallpaper_color');
                             document.documentElement.style.setProperty('--wallpaper-url', 'radial-gradient(circle at top left, #1e1b4b 0%, #0a0f18 100%)');
                             document.documentElement.style.setProperty('--theme-primary', '#10B981');
                         }}
                         className="flex items-center justify-center gap-3 w-full py-3 mt-2 rounded-2xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer font-bold text-xs tracking-wide text-zinc-400 hover:text-zinc-200"
                     >
                         <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                         Restore Default Wallpaper
                     </button>`;

code = code.replace(/<button\s*onClick=\{\(\) => fileInputRef\.current\?\.click\(\)\}[\s\S]*?Upload Custom Wallpaper\s*<\/button>/, replacement);

fs.writeFileSync('src/components/SettingsView.tsx', code);

import fs from 'fs';
let code = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

// Update Interface
code = code.replace(/glassOpacity: number;\n    setGlassOpacity: \(val: number\) => void;/, "glassOpacity: number;\n    setGlassOpacity: (val: number) => void;\n    panelOpacity: number;\n    setPanelOpacity: (val: number) => void;");

// Update Component Params
code = code.replace(/glassOpacity,\n     setGlassOpacity,/, "glassOpacity,\n     setGlassOpacity,\n     panelOpacity,\n     setPanelOpacity,");

// Add Slider
const sliderCode = `                     <div className="flex flex-col gap-3">
                         <div className="flex justify-between items-center text-xs">
                             <label className="font-semibold text-zinc-400 uppercase tracking-wider">Panel Opacity</label>
                             <span className="font-mono bg-black/40 border border-white/10 px-2 py-1 rounded font-bold" style={{ color: 'var(--theme-primary)' }}>{Math.round(panelOpacity * 100)}%</span>
                         </div>
                         <input 
                             type="range" min="0.10" max="0.90" step="0.05"
                             value={panelOpacity} 
                             onChange={(e) => setPanelOpacity(Number(e.target.value))}
                             style={{ accentColor: "var(--theme-primary)" }} onMouseUp={() => audioManager.playPop()} onTouchEnd={() => audioManager.playPop()} className="w-full  bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                         />
                     </div>
                 </div>`;

code = code.replace(/<\/div>\n                 <\/div>/, `</div>\n${sliderCode}`);

fs.writeFileSync('src/components/SettingsView.tsx', code);

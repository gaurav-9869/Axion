import React, { useRef } from 'react';

interface SettingsViewProps {
    glassBlur: number;
    setGlassBlur: (val: number) => void;
    glassOpacity: number;
    setGlassOpacity: (val: number) => void;
}

export default function SettingsView({ 
    glassBlur, 
    setGlassBlur, 
    glassOpacity, 
    setGlassOpacity 
}: SettingsViewProps) {
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Wallpaper size guard — base64 encoding inflates size by ~33%,
      // so a 1MB image becomes ~1.3MB in localStorage. Warn and stop early.
      const ONE_MB = 1 * 1024 * 1024;
      if (file.size > ONE_MB) {
          alert(`Image is too large (${(file.size / ONE_MB).toFixed(1)} MB). Please use an image under 1 MB to avoid storage issues. You can compress it at squoosh.app first.`);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          const img = new Image();
          img.onload = () => {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                  canvas.width = 100;
                  canvas.height = Math.floor(100 * (img.height / img.width));
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  
                  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
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

                  document.documentElement.style.setProperty('--wallpaper-url', `url(${dataUrl})`);
                  document.documentElement.style.setProperty('--theme-primary', dominantColor);
                  
                  localStorage.setItem('custom_wallpaper_url', dataUrl);
                  localStorage.setItem('custom_wallpaper_color', dominantColor);
              }
          };
          img.src = dataUrl;
      };
      reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-4xl mx-auto text-zinc-100">
        <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-[32px] p-6 sm:p-10 flex flex-col gap-10 shadow-2xl">
             
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
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6 bg-black/20 p-6 rounded-2xl border border-white/5">
                     <div className="flex flex-col gap-3">
                         <div className="flex justify-between items-center text-xs">
                             <label className="font-semibold text-zinc-400 uppercase tracking-wider">Background Blur Depth</label>
                             <span className="font-mono bg-black/40 border border-white/10 px-2 py-1 rounded text-emerald-400 font-bold">{glassBlur}px</span>
                         </div>
                         <input 
                             type="range" min="4" max="48" step="1" 
                             value={glassBlur} 
                             onChange={(e) => setGlassBlur(Number(e.target.value))}
                             className="w-full accent-emerald-400 bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                         />
                     </div>
                     <div className="flex flex-col gap-3">
                         <div className="flex justify-between items-center text-xs">
                             <label className="font-semibold text-zinc-400 uppercase tracking-wider">Panel Opacity</label>
                             <span className="font-mono bg-black/40 border border-white/10 px-2 py-1 rounded text-emerald-400 font-bold">{Math.round(glassOpacity * 100)}%</span>
                         </div>
                         <input 
                             type="range" min="0.10" max="0.90" step="0.05" 
                             value={glassOpacity} 
                             onChange={(e) => setGlassOpacity(Number(e.target.value))}
                             className="w-full accent-emerald-400 bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                         />
                     </div>
                 </div>
             </div>
        </div>
    </div>
  );
}

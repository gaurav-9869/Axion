import fs from 'fs';
let code = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

code = code.replace(/import React, \{ useState/g, 'import { audioManager } from "../lib/audio";\nimport React, { useState');

// Remove current wallpaper
code = code.replace(/onClick=\{\(\) => \{[\s\S]*?localStorage\.removeItem\('custom_wallpaper_color'\);[\s\S]*?\}\}/, 
`onClick={() => {
    audioManager.playDigitalTick();
    localStorage.removeItem('custom_wallpaper_url');
    localStorage.removeItem('custom_wallpaper_color');
    document.documentElement.style.setProperty('--wallpaper-url', 'radial-gradient(circle at top left, #1e1b4b 0%, #0a0f18 100%)');
    document.documentElement.style.setProperty('--theme-primary', '#10B981');
}}`);

fs.writeFileSync('src/components/SettingsView.tsx', code);

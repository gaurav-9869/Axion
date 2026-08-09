import fs from 'fs';
let code = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');

code = code.replace(/setCurrentTab\(item\.id\)/g, 'audioManager.playSubtleTap(); setCurrentTab(item.id)');
code = code.replace(/setCurrentTab\('settings'\)/g, 'audioManager.playSubtleTap(); setCurrentTab(\'settings\')');

fs.writeFileSync('src/components/Sidebar.tsx', code);

import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/const \[glassOpacity, setGlassOpacity\] = useState\(0\.45\);/, 'const [glassOpacity, setGlassOpacity] = useState(0.00);');
code = code.replace(/root\.style\.setProperty\('--wallpaper-dim', savedOpacity \? String\(savedOpacity\) : '0\.45'\);/, "root.style.setProperty('--wallpaper-dim', savedOpacity ? String(savedOpacity) : '0.00');");

fs.writeFileSync('src/App.tsx', code);

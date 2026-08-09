import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Add state
code = code.replace(/const \[glassOpacity, setGlassOpacity\] = useState\(0\.45\);/, "const [glassOpacity, setGlassOpacity] = useState(0.45);\n  const [panelOpacity, setPanelOpacity] = useState(0.55);");

// Update useLayoutEffect
code = code.replace(/const savedOpacity = localStorage\.getItem\('ios_glass_opacity'\);/, "const savedOpacity = localStorage.getItem('ios_glass_opacity');\n    const savedPanelOpacity = localStorage.getItem('ios_panel_opacity');");
code = code.replace(/if \(savedOpacity\) setGlassOpacity\(Number\(savedOpacity\)\);/, "if (savedOpacity) setGlassOpacity(Number(savedOpacity));\n    if (savedPanelOpacity) setPanelOpacity(Number(savedPanelOpacity));");
code = code.replace(/root\.style\.setProperty\('--wallpaper-dim', savedOpacity \? String\(savedOpacity\) : '0\.45'\);/, "root.style.setProperty('--wallpaper-dim', savedOpacity ? String(savedOpacity) : '0.45');\n    root.style.setProperty('--panel-opacity', savedPanelOpacity ? String(savedPanelOpacity) : '0.55');");

// Update useEffect
code = code.replace(/root\.style\.setProperty\('--wallpaper-dim', String\(glassOpacity\)\);/, "root.style.setProperty('--wallpaper-dim', String(glassOpacity));\n    root.style.setProperty('--panel-opacity', String(panelOpacity));");
code = code.replace(/localStorage\.setItem\('ios_glass_opacity', String\(glassOpacity\)\);/, "localStorage.setItem('ios_glass_opacity', String(glassOpacity));\n    localStorage.setItem('ios_panel_opacity', String(panelOpacity));");
code = code.replace(/\[glassBlur, glassOpacity, isLoaded\]/, "[glassBlur, glassOpacity, panelOpacity, isLoaded]");

// Pass props
code = code.replace(/glassOpacity=\{glassOpacity\}\n\s*setGlassOpacity=\{setGlassOpacity\}/, "glassOpacity={glassOpacity}\n                setGlassOpacity={setGlassOpacity}\n                panelOpacity={panelOpacity}\n                setPanelOpacity={setPanelOpacity}");

fs.writeFileSync('src/App.tsx', code);

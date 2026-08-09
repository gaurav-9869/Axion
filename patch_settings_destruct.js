import fs from 'fs';
let code = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

code = code.replace(
/export default function SettingsView\(\{ \n    glassBlur, \n    setGlassBlur, \n    glassOpacity, \n    setGlassOpacity,\n    userSettings,\n    setUserSettings\n\}: SettingsViewProps\)/,
`export default function SettingsView({ 
    glassBlur, 
    setGlassBlur, 
    glassOpacity, 
    setGlassOpacity,
    panelOpacity,
    setPanelOpacity,
    userSettings,
    setUserSettings
}: SettingsViewProps)`
);

fs.writeFileSync('src/components/SettingsView.tsx', code);

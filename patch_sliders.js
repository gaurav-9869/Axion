import fs from 'fs';
let code = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

code = code.replace(/min="0\.10"/g, 'min="0.00"');

fs.writeFileSync('src/components/SettingsView.tsx', code);

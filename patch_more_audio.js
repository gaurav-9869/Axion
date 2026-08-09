import fs from 'fs';
let codeSettings = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

codeSettings = codeSettings.replace(/audioManager\.playPop\(\)/g, 'audioManager.playDigitalTick()');

fs.writeFileSync('src/components/SettingsView.tsx', codeSettings);

let codeChatbot = fs.readFileSync('src/components/Chatbot.tsx', 'utf8');
codeChatbot = codeChatbot.replace(/audioManager\.playPop\(\)/g, 'audioManager.playSubtleTap()');
fs.writeFileSync('src/components/Chatbot.tsx', codeChatbot);

let codeApp = fs.readFileSync('src/App.tsx', 'utf8');
codeApp = codeApp.replace(/audioManager\.playPop\(\)/g, 'audioManager.playSuccess()');
fs.writeFileSync('src/App.tsx', codeApp);


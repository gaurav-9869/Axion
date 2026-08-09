import fs from 'fs';
let code = fs.readFileSync('src/components/DailyLedger.tsx', 'utf8');

code = code.replace(/audioManager\.playPop\(\);\n *setSessionTasks/g, 'audioManager.playSuccess();\n      setSessionTasks');
code = code.replace(/if \(!chapterVector\.trim\(\)\) return;/g, 'if (!chapterVector.trim()) {\n        audioManager.playError();\n        return;\n      }');

fs.writeFileSync('src/components/DailyLedger.tsx', code);

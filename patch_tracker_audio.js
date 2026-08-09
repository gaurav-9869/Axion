import fs from 'fs';
let code = fs.readFileSync('src/components/TrackerView.tsx', 'utf8');

// replace audioManager.playPop() with audioManager.playSuccess() on append plan
code = code.replace(/audioManager\.playPop\(\);\n *setSessionTasks/g, 'audioManager.playSuccess();\n      setSessionTasks');

// Error on empty input
code = code.replace(/if \(!chapterVector\.trim\(\)\) return;/g, 'if (!chapterVector.trim()) {\n        audioManager.playError();\n        return;\n      }');

// Subtle tap on task complete
code = code.replace(/audioManager\.playChime\(\);\n *const updatedTasks/g, 'audioManager.playChime();\n    const updatedTasks');

fs.writeFileSync('src/components/TrackerView.tsx', code);

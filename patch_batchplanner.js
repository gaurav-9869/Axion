import fs from 'fs';
let code = fs.readFileSync('src/components/BatchPlanner.tsx', 'utf8');

code = code.replace(/import React, \{ useState/g, 'import { audioManager } from "../lib/audio";\nimport React, { useState');

code = code.replace(/const handleAppend = \(\) => \{/g, `const handleAppend = () => {
    audioManager.playSubtleTap();`);

code = code.replace(/setLocalTasks\(\[\.\.\.localTasks, newTask\]\);/g, `audioManager.playSuccess();
    setLocalTasks([...localTasks, newTask]);`);

code = code.replace(/if \(!topicVector\.trim\(\)\) return;/g, `if (!topicVector.trim()) {
      audioManager.playError();
      return;
    }`);

fs.writeFileSync('src/components/BatchPlanner.tsx', code);

import fs from 'fs';
let code = fs.readFileSync('src/components/DailyLedger.tsx', 'utf8');

code = code.replace(/const handleSaveLog = \(\) => \{/g, `const handleSaveLog = () => {
    if (!props.logTopic.trim() && !canvasDrawingData) {
        audioManager.playError();
    }`);

code = code.replace(/audioManager\.playChime\(\);/g, 'audioManager.playSuccess();');

code = code.replace(/const handleExtractAI = async \(\) => \{/g, `const handleExtractAI = async () => {
    audioManager.playHologramOpen();`);

fs.writeFileSync('src/components/DailyLedger.tsx', code);

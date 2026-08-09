import fs from 'fs';
let code = fs.readFileSync('src/components/ArchiveView.tsx', 'utf8');

code = code.replace(/import \{ ensureValidToken \} from '\.\.\/lib\/auth';/g, 'import { ensureValidToken } from "../lib/auth";\nimport { audioManager } from "../lib/audio";');

code = code.replace(/const handleSyncToDrive = async \(\) => \{/g, `const handleSyncToDrive = async () => {
    audioManager.playHologramOpen();`);

code = code.replace(/const handleDownloadDrive = async \(\) => \{/g, `const handleDownloadDrive = async () => {
    audioManager.playHologramOpen();`);

code = code.replace(/alert\("Backup to Google Drive successful!"\);/g, `audioManager.playSuccess(); alert("Backup to Google Drive successful!");`);
code = code.replace(/alert\("Sync complete! Data merged."\);/g, `audioManager.playSuccess(); alert("Sync complete! Data merged.");`);

fs.writeFileSync('src/components/ArchiveView.tsx', code);

import fs from 'fs';
let code = fs.readFileSync('src/components/ArchiveView.tsx', 'utf8');

code = code.replace(
/const handleSyncToDrive = async \(\) => \{\n      const token = localStorage\.getItem\('gcal_token'\);\n      if \(!token\) \{/,
`const handleSyncToDrive = async () => {
      const token = await ensureValidToken();
      if (!token) {`
);

code = code.replace(
/const handleDownloadDrive = async \(\) => \{\n      const token = localStorage\.getItem\('gcal_token'\);\n      if \(!token\) \{/,
`const handleDownloadDrive = async () => {
      const token = await ensureValidToken();
      if (!token) {`
);

code = code.replace(/import \{ ensureValidToken \} from '\.\.\/lib\/auth';/, "");
code = code.replace(/import React/, "import { ensureValidToken } from '../lib/auth';\nimport React");

fs.writeFileSync('src/components/ArchiveView.tsx', code);

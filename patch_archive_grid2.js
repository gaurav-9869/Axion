import fs from 'fs';
let code = fs.readFileSync('src/components/ArchiveView.tsx', 'utf8');

code = code.replace(/minmax\(280px, 1fr\)/g, 'minmax(250px, 1fr)');

fs.writeFileSync('src/components/ArchiveView.tsx', code);

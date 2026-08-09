import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/bg-\[#060a12\]/, 'bg-transparent');

fs.writeFileSync('src/App.tsx', code);

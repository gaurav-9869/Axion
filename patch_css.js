import fs from 'fs';
let code = fs.readFileSync('src/index.css', 'utf8');
code = code.replace(/body\s*\{/, 'html { background-color: transparent !important; }\nbody { background-color: transparent !important;');
fs.writeFileSync('src/index.css', code);

import fs from 'fs';
let code = fs.readFileSync('src/index.css', 'utf8');

code = code.replace(/to \{ opacity: 1; transform: translateY\(0\); \}/, 'to { opacity: 1; transform: none; }');

fs.writeFileSync('src/index.css', code);

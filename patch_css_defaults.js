import fs from 'fs';
let code = fs.readFileSync('src/index.css', 'utf8');

code = code.replace(/var\(--wallpaper-dim, 0\.45\)/, 'var(--wallpaper-dim, 0.00)');

fs.writeFileSync('src/index.css', code);

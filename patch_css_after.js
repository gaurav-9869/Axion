import fs from 'fs';
let code = fs.readFileSync('src/index.css', 'utf8');

code = code.replace(
/background: rgba\(0, 0, 0, var\(--wallpaper-dim, 0\.00\)\);/,
'background: #000;\n  opacity: var(--wallpaper-dim, 0.00);'
);

fs.writeFileSync('src/index.css', code);

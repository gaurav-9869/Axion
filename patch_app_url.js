import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  /root\.style\.setProperty\('--wallpaper-url', `url\(\$\{customUrl\}\)`\);/,
  'root.style.setProperty(\'--wallpaper-url\', `url("${customUrl}")`);'
);

fs.writeFileSync('src/App.tsx', code);

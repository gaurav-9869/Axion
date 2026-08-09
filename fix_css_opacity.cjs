const fs = require('fs');
let css = fs.readFileSync('src/index.css', 'utf8');
css = css.replace(
  '--color-surface-glass: rgba(15, 22, 36, var(--glass-opacity, 0.45));',
  '--color-surface-glass: color-mix(in srgb, var(--theme-primary) 8%, rgb(10 15 24 / var(--glass-opacity, 0.45)));'
);
fs.writeFileSync('src/index.css', css);
console.log('CSS fixed.');

const fs = require('fs');
let app = fs.readFileSync('src/App.tsx', 'utf8');
app = app.replace(/              style={{\n                backdropFilter: 'blur\(var\(--glass-blur, 24px\)\)',\n                WebkitBackdropFilter: 'blur\(var\(--glass-blur, 24px\)\)',\n                backgroundColor: 'rgba\(10, 15, 24, var\(--glass-opacity, 0\.45\)\)',\n                borderColor: 'rgba\(255, 255, 255, 0\.1\)'\n              }}/g, '');
fs.writeFileSync('src/App.tsx', app);
console.log('Cleaned footer glass styles.');

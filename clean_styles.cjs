const fs = require('fs');

// 1. App.tsx
let app = fs.readFileSync('src/App.tsx', 'utf8');
app = app.replace(/          style={{\n            backdropFilter: 'blur\(var\(--glass-blur, 24px\)\)',\n            WebkitBackdropFilter: 'blur\(var\(--glass-blur, 24px\)\)',\n            backgroundColor: 'rgba\(10, 15, 24, var\(--glass-opacity, 0\.45\)\)',\n            borderColor: 'rgba\(255, 255, 255, 0\.1\)'\n          }}/g, '');

// 2. BatchPlanner.tsx
let batch = fs.readFileSync('src/components/BatchPlanner.tsx', 'utf8');
batch = batch.replace(/ style={glassStyle}/g, '');
batch = batch.replace(/  const glassStyle = {[\s\S]*?};\n/g, '');

fs.writeFileSync('src/App.tsx', app);
fs.writeFileSync('src/components/BatchPlanner.tsx', batch);

console.log('Cleaned inline glass styles.');

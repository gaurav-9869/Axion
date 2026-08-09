const fs = require('fs');

let sunday = fs.readFileSync('src/components/SundayReviewView.tsx', 'utf8');
sunday = sunday.replace('style={{ color: "var(--theme-primary)" }}">', 'style={{ color: "var(--theme-primary)" }}>');
fs.writeFileSync('src/components/SundayReviewView.tsx', sunday);

console.log('Quotes fixed.');

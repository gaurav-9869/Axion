const fs = require('fs');
let content = fs.readFileSync('src/components/ConceptVelocity.tsx', 'utf8');
content = content.replace(/bg-black\/20 border border-white\/5 p-6 rounded-2xl/g, 'ios-glass-card-nested p-6');
fs.writeFileSync('src/components/ConceptVelocity.tsx', content);
console.log('Fixed ConceptVelocity');

const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/components/**/*.tsx');
files.push('src/App.tsx');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace standard panel strings
    content = content.replace(/bg-black\/40 backdrop-blur-md border border-white\/10 rounded-3xl/g, 'ios-glass-panel');
    content = content.replace(/bg-black\/40 backdrop-blur-md border border-white\/10 rounded-\[32px\]/g, 'ios-glass-panel');
    content = content.replace(/bg-black\/40 backdrop-blur-md border border-white\/10 rounded-\[28px\]/g, 'ios-glass-panel');
    content = content.replace(/bg-black\/40 backdrop-blur-md border border-white\/10 rounded-2xl/g, 'ios-glass-panel');
    
    // Specific elements 
    content = content.replace(/bg-black\/40 backdrop-blur-md border border-white\/10/g, 'ios-glass-panel');
    
    fs.writeFileSync(file, content);
});

console.log('Glass panels updated.');

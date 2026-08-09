const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/components/**/*.tsx');
files.push('src/App.tsx');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/animate-fade-in/g, 'animate-ios-fade-in');
    fs.writeFileSync(file, content);
});

console.log('Animations fixed.');

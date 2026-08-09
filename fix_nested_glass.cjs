const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/components/**/*.tsx');
files.push('src/App.tsx');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // BatchPlanner inner cards
    content = content.replace(/bg-black\/15 border border-white\/\[0\.04\]/g, 'ios-glass-card-nested border-0');
    // ArchiveView Drive Sync
    content = content.replace(/bg-black\/40 border border-white\/10 rounded-xl/g, 'ios-glass-card-nested');
    // ArchiveView inner logs
    content = content.replace(/bg-black\/20 border border-white\/5 p-5 rounded-2xl/g, 'ios-glass-card-nested p-5');
    // AnalysisView inner cards
    content = content.replace(/bg-black\/20 border border-white\/5 rounded-2xl/g, 'ios-glass-card-nested');
    content = content.replace(/bg-black\/30 rounded-xl p-3 text-center border border-white\/5/g, 'ios-glass-card-nested p-3 text-center');
    content = content.replace(/bg-black\/20 px-3 py-2 rounded-xl border border-white\/5/g, 'ios-glass-card-nested px-3 py-2');
    
    // SundayReviewView system refinement cards
    content = content.replace(/bg-black\/20 border border-white\/5 rounded-2xl hover:bg-white\/5/g, 'ios-glass-card-nested hover:bg-white/5');
    
    // Daily Ledger cards
    content = content.replace(/bg-black\/40 border border-white\/10 rounded-xl/g, 'ios-glass-card-nested');
    content = content.replace(/bg-black\/20 p-3 rounded-2xl border border-white\/5/g, 'ios-glass-card-nested p-3');

    // Account View inner cards
    content = content.replace(/bg-black\/20 border border-white\/5 rounded-2xl/g, 'ios-glass-card-nested');

    // Settings View inner cards
    content = content.replace(/bg-black\/20 p-6 rounded-2xl border border-white\/5/g, 'ios-glass-card-nested p-6');
    content = content.replace(/bg-black\/40 border border-white\/10 hover:border-emerald-400\/50/g, 'ios-glass-card-nested hover:border-emerald-400/50');
    content = content.replace(/bg-black\/40 border border-white\/10 hover:border-amber-400\/50/g, 'ios-glass-card-nested hover:border-amber-400/50');
    
    fs.writeFileSync(file, content);
});

console.log('Nested glass panels updated.');

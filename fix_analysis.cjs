const fs = require('fs');

let analysis = fs.readFileSync('src/components/AnalysisView.tsx', 'utf8');

// Fix retention score color
analysis = analysis.replace('text-amber-500">psychology</span>', '">psychology</span>').replace('text-[14px]">psychology', 'text-[14px]" style={{ color: "var(--theme-primary)" }}>psychology');

// Double check maxDayPages logic to be absolutely safe
analysis = analysis.replace('const maxDayPages = Math.max(', 'const maxDayPages = Math.max(1, '); // Ensure 1 is present in max

fs.writeFileSync('src/components/AnalysisView.tsx', analysis);
console.log('Analysis fixed.');

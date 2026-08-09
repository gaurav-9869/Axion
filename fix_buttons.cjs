const fs = require('fs');
let content = fs.readFileSync('src/components/SundayReviewView.tsx', 'utf8');

content = content.replace(
    /className=\{\`w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer \$\{\n\s*log.systemRefinementWorks === true\n\s*\? ''/g,
    'className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer ${\n                                            log.systemRefinementWorks === true \n                                                ? \'\' '
);

// We'll just add the inline style for the true state.
content = content.replace(
    /onClick=\{\(\) => handleToggleWorks\(log.id, log.systemRefinementWorks\)\}\n\s*className=\{\`/g,
    'onClick={() => handleToggleWorks(log.id, log.systemRefinementWorks)}\n                                        style={log.systemRefinementWorks === true ? { backgroundColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)", color: "var(--theme-primary)", border: "1px solid color-mix(in srgb, var(--theme-primary) 30%, transparent)" } : undefined}\n                                        className={`'
);

fs.writeFileSync('src/components/SundayReviewView.tsx', content);
console.log('Fixed buttons');

const fs = require('fs');
let code = fs.readFileSync('src/components/AnalysisView.tsx', 'utf-8');

code = code.replace(
  '<div className="flex flex-col xl:flex-row gap-6 items-start w-full text-zinc-100 animate-fade-in">\n      <div className="flex-1 flex flex-col gap-6 min-w-0 w-full">',
  '<div className="flex flex-col gap-6 w-full text-zinc-100 animate-fade-in">'
);

code = code.replace(
  '      </div>\n      <div className="w-full xl:w-[420px] shrink-0 flex flex-col gap-6">\n      {/* ── NESTED UI GROUPING (Topic Logs) ───────────────────────────────── */}',
  '      {/* ── NESTED UI GROUPING (Topic Logs) ───────────────────────────────── */}'
);

code = code.replace(
  '      </div>\n      </div>\n    </div>\n  );\n}',
  '    </div>\n  );\n}'
);

code = code.replace(
  '<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">',
  '<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">'
);

code = code.replace(
  '<div className="relative w-44 h-44 shrink-0">',
  '<div className="relative w-32 h-32 md:w-40 md:h-40 shrink-0 mx-auto">'
);

fs.writeFileSync('src/components/AnalysisView.tsx', code);

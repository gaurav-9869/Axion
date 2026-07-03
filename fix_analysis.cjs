const fs = require('fs');
let code = fs.readFileSync('src/components/AnalysisView.tsx', 'utf-8');

code = code.replace(
  '<div className="flex flex-col gap-8 w-full text-zinc-100 animate-fade-in">',
  '<div className="flex flex-col xl:flex-row gap-6 items-start w-full text-zinc-100 animate-fade-in">\n      <div className="flex-1 flex flex-col gap-6 min-w-0 w-full">'
);

code = code.replace(
  '      {/* ── NESTED UI GROUPING (Topic Logs) ───────────────────────────────── */}',
  '      </div>\n\n      <div className="w-full xl:w-[420px] shrink-0 flex flex-col gap-6">\n      {/* ── NESTED UI GROUPING (Topic Logs) ───────────────────────────────── */}'
);

code = code.replace(
  '        </div>\n      </div>\n    </div>\n  );\n}',
  '        </div>\n      </div>\n      </div>\n    </div>\n  );\n}'
);

code = code.replace(
  '<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">',
  '<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">'
);

fs.writeFileSync('src/components/AnalysisView.tsx', code);

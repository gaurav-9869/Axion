const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

code = code.replace(
  'const apiKey = process.env.GEMINI_API_KEY;',
  'const rawKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";\n      const apiKey = rawKey.replace(/^["\']|["\']$/g, "").trim();'
);

code = code.replace(
  'apiKey: process.env.GEMINI_API_KEY || "dummy",',
  'apiKey: (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "dummy").replace(/^["\']|["\']$/g, "").trim(),'
);

fs.writeFileSync('server.ts', code);

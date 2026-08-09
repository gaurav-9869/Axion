import fs from 'fs';
let code = fs.readFileSync('src/components/ArchiveView.tsx', 'utf8');

code = code.replace(/<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">/g, '<div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>');

fs.writeFileSync('src/components/ArchiveView.tsx', code);

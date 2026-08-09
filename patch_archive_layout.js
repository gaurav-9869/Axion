import fs from 'fs';
let code = fs.readFileSync('src/components/ArchiveView.tsx', 'utf8');

code = code.replace(/className="flex flex-col md:flex-row gap-6 items-start w-full"/g, 'className="flex flex-col lg:flex-row gap-6 items-start w-full"');
code = code.replace(/className="ios-glass-panel p-4 w-full md:w-64 flex flex-col gap-2 h-fit max-h-\[70vh\] overflow-y-auto shrink-0 shadow-lg"/g, 'className="ios-glass-panel p-4 w-full lg:w-64 flex flex-col gap-2 h-fit max-h-[70vh] lg:max-h-[75vh] overflow-y-auto shrink-0 shadow-lg"');

fs.writeFileSync('src/components/ArchiveView.tsx', code);

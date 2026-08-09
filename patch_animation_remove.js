import fs from 'fs';

const files = [
  'src/components/BatchPlanner.tsx',
  'src/components/AnalysisView.tsx',
  'src/components/SundayReviewView.tsx'
];

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/animate-ios-fade-in/g, '');
  fs.writeFileSync(file, code);
}

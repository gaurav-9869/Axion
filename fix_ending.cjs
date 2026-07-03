const fs = require('fs');
let code = fs.readFileSync('src/components/AnalysisView.tsx', 'utf-8');
const lastIndex = code.lastIndexOf('      </div>\n    </div>\n}');
code = code.substring(0, lastIndex) + '    </div>\n  );\n}';
fs.writeFileSync('src/components/AnalysisView.tsx', code);

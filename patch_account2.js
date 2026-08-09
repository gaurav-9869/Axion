import fs from 'fs';
let code = fs.readFileSync('src/components/AccountView.tsx', 'utf8');

code = code.replace(
  "if (token) {\n         setHasToken(true);",
  "if (token && expires && Number(expires) > Date.now()) {\n         setHasToken(true);"
);

code = code.replace(
  "} else { setHasToken(false); }",
  "} else {\n         localStorage.removeItem('gcal_token');\n         localStorage.removeItem('gcal_token_expires');\n         setHasToken(false);\n     }"
);

fs.writeFileSync('src/components/AccountView.tsx', code);

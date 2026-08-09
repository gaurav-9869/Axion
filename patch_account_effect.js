import fs from 'fs';
let code = fs.readFileSync('src/components/AccountView.tsx', 'utf8');

code = code.replace(
/const token = localStorage\.getItem\('gcal_token'\);\n     const expires = localStorage\.getItem\('gcal_token_expires'\);\n     if \(token\) \{/,
`const token = localStorage.getItem('gcal_token');
     const expires = localStorage.getItem('gcal_token_expires');
     if (token && expires && Number(expires) > Date.now()) {`
);

fs.writeFileSync('src/components/AccountView.tsx', code);

import fs from 'fs';
let code = fs.readFileSync('src/components/AccountView.tsx', 'utf8');

// Remove startSilentRefresh entirely
code = code.replace(/const startSilentRefresh = \(clientId: string\) => \{[\s\S]*?\}, 45 \* 60 \* 1000\);\n  \};/, '');

// Fix useEffect for gcal_token check
code = code.replace(/const expires = localStorage\.getItem\('gcal_token_expires'\);\n\n     if \(token && expires && Number\(expires\) > Date\.now\(\)\) \{/, 'if (token) {');
code = code.replace(/\} else \{\n         if \(token\) \{\n             localStorage\.removeItem\('gcal_token'\);\n             localStorage\.removeItem\('gcal_token_expires'\);\n         \}\n         setHasToken\(false\);\n     \}/, '} else { setHasToken(false); }');

// Remove startSilentRefresh calls
code = code.replace(/startSilentRefresh\(clientId\);/g, '');
code = code.replace(/if \(silentRefreshRef\.current\) clearInterval\(silentRefreshRef\.current\);/g, '');

fs.writeFileSync('src/components/AccountView.tsx', code);

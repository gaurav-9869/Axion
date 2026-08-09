const fs = require('fs');

// 1. DailyLedger.tsx
let daily = fs.readFileSync('src/components/DailyLedger.tsx', 'utf8');
daily = daily.replace('text-amber-400">{props.logRetention}', '">{props.logRetention}').replace('text-[var(--theme-primary)]">{props.logRetention}', '">{props.logRetention}');
daily = daily.replace('<span className="text-xs font-mono font-bold bg-black/40 border border-white/10 px-2.5 py-1 rounded ">', '<span className="text-xs font-mono font-bold bg-black/40 border border-white/10 px-2.5 py-1 rounded" style={{ color: "var(--theme-primary)" }}>');
daily = daily.replace('className="w-full accent-amber-400 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer mt-1"', 'className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer mt-1" style={{ accentColor: "var(--theme-primary)" }}');
daily = daily.replace(/text-amber-400/g, 'text-[var(--theme-primary)]'); // Catch any others and fix
fs.writeFileSync('src/components/DailyLedger.tsx', daily);

// 2. ArchiveView.tsx
let archive = fs.readFileSync('src/components/ArchiveView.tsx', 'utf8');
archive = archive.replace('className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-xl font-bold transition-all disabled:opacity-50"', 'className="px-4 py-2 text-white text-xs rounded-xl font-bold transition-all disabled:opacity-50 hover:brightness-110" style={{ backgroundColor: "var(--theme-primary)" }}');
fs.writeFileSync('src/components/ArchiveView.tsx', archive);

// 3. SundayReviewView.tsx
let sunday = fs.readFileSync('src/components/SundayReviewView.tsx', 'utf8');
sunday = sunday.replace('text-[28px] text-amber-400', 'text-[28px]" style={{ color: "var(--theme-primary)" }}');
fs.writeFileSync('src/components/SundayReviewView.tsx', sunday);

// 4. AccountView.tsx
let account = fs.readFileSync('src/components/AccountView.tsx', 'utf8');
// remove the expiration check
account = account.replace('if (token && expires && Date.now() < Number(expires)) {', 'if (token) {');
fs.writeFileSync('src/components/AccountView.tsx', account);

console.log('Colors and Auth patched.');

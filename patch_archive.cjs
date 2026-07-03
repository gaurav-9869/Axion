const fs = require('fs');
let code = fs.readFileSync('src/components/ArchiveView.tsx', 'utf8');

// Add imports
code = code.replace("import { LogItem", "import { syncArchive, downloadLatestArchive } from '../lib/driveSync';\nimport { LogItem");

// Add sync states
code = code.replace("const [editFormData", "const [isSyncing, setIsSyncing] = useState(false);\n  const [lastSync, setLastSync] = useState<string>(localStorage.getItem('last_auto_sync') || 'Never');\n  const [editFormData");

// Add sync handlers
const syncHandlers = `
  const handleSyncToDrive = async () => {
      const token = localStorage.getItem('gcal_token');
      if (!token) {
          alert('Please connect Google account in Account settings first.');
          return;
      }
      setIsSyncing(true);
      const success = await syncArchive(token);
      if (success) {
          setLastSync(localStorage.getItem('last_auto_sync') || 'Just now');
          alert('Successfully backed up to Axion Archive in Drive!');
      } else {
          alert('Sync failed. Please check connection and permissions.');
      }
      setIsSyncing(false);
  };

  const handleDownloadDrive = async () => {
      const token = localStorage.getItem('gcal_token');
      if (!token) {
          alert('Please connect Google account in Account settings first.');
          return;
      }
      if (!confirm('This will download the latest 2 months of archive and merge with your local device. Proceed?')) return;
      
      setIsSyncing(true);
      const success = await downloadLatestArchive(token);
      if (success) {
          alert('Restored data successfully! Please refresh the app.');
          window.location.reload();
      } else {
          alert('Download failed.');
      }
      setIsSyncing(false);
  };
`;

code = code.replace("useEffect(() => {", syncHandlers + "\n  useEffect(() => {");

// Add sync UI
const syncUI = `
                <div className="w-full flex items-center justify-between bg-black/40 border border-white/10 rounded-xl p-4 mt-2 mb-4">
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold">Drive Synchronisation</span>
                        <span className="text-xs text-zinc-500">Last sync: {lastSync}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handleDownloadDrive} disabled={isSyncing} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs rounded-xl font-bold transition-all disabled:opacity-50">
                           {isSyncing ? '...' : 'PULL FROM DRIVE'}
                        </button>
                        <button onClick={handleSyncToDrive} disabled={isSyncing} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-xl font-bold transition-all disabled:opacity-50">
                           {isSyncing ? 'SYNCING...' : 'PUSH TO DRIVE'}
                        </button>
                    </div>
                </div>
`;

code = code.replace("{/* Goal #5 & #7", syncUI + "\n        {/* Goal #5 & #7");

// Add time UI to logs
const timeUI = `
                                            <span className="text-[10px] font-mono text-zinc-500 bg-black/30 px-2 py-1 border border-white/5 rounded-lg flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[12px]">schedule</span>
                                                {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Unknown Time'}
                                            </span>
                                        </span>
                                    </div>
`;

code = code.replace("</span>\n                                    </div>\n                                    <div className=\"flex items-center gap-3\">", timeUI + "                                    <div className=\"flex items-center gap-3\">");

fs.writeFileSync('src/components/ArchiveView.tsx', code);

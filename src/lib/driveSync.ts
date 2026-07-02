export const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
export const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';
export const BACKUP_FILENAME = 'axion_master_backup.json';

export async function findBackupFile(accessToken: string): Promise<string | null> {
    const q = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`);
    const res = await fetch(`${DRIVE_API_URL}/files?q=${q}&spaces=appDataFolder`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error('Failed to find backup file');
    const data = await res.json();
    if (data.files && data.files.length > 0) {
        return data.files[0].id;
    }
    return null;
}

export async function uploadBackup(accessToken: string): Promise<boolean> {
    try {
        const fileId = await findBackupFile(accessToken);
        
        const backupData: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('axion_') || key.startsWith('pcbm_'))) {
                backupData[key] = localStorage.getItem(key) || '';
            }
        }
        const fileContent = JSON.stringify(backupData);
        const metadata = { name: BACKUP_FILENAME, parents: ['appDataFolder'] };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([fileContent], { type: 'application/json' }));

        const url = fileId 
            ? `${UPLOAD_API_URL}/files/${fileId}?uploadType=multipart`
            : `${UPLOAD_API_URL}/files?uploadType=multipart`;
        
        const method = fileId ? 'PATCH' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form
        });
        
        if (!res.ok) throw new Error('Upload failed');
        localStorage.setItem('last_auto_sync', new Date().toDateString());
        return true;
    } catch (e) {
        console.error("Drive upload error", e);
        return false;
    }
}

export async function downloadAndRestoreBackup(accessToken: string): Promise<boolean> {
    try {
        const fileId = await findBackupFile(accessToken);
        if (!fileId) return false;

        const res = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) throw new Error('Download failed');
        
        const backupData = await res.json();
        for (const [key, value] of Object.entries(backupData)) {
            if (key.startsWith('axion_') || key.startsWith('pcbm_')) {
                localStorage.setItem(key, value as string);
            }
        }
        return true;
    } catch (e) {
        console.error("Drive download error", e);
        return false;
    }
}

export function enforceCacheEviction() {
    let lsTotal = 0;
    for (let x in localStorage) {
        if (!localStorage.hasOwnProperty(x)) continue;
        lsTotal += ((localStorage[x].length + x.length) * 2);
    }
    
    // If over ~4.5MB (Browser limit is usually 5MB)
    if (lsTotal > 4.5 * 1024 * 1024) {
        console.warn("Storage near 5MB limit. Evicting old cache...");
        
        // Find all daily logs
        const logKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('axion_logs_') || key.startsWith('pcbm_log_'))) {
                const dateStr = key.replace('axion_logs_', '').replace('pcbm_log_', '');
                logKeys.push({ key, date: new Date(dateStr).getTime() });
            }
        }
        
        // Sort by oldest first
        logKeys.sort((a, b) => a.date - b.date);
        
        // Remove oldest 30% of keys
        const toRemove = Math.max(1, Math.floor(logKeys.length * 0.3));
        for (let i = 0; i < toRemove; i++) {
            localStorage.removeItem(logKeys[i].key);
        }
    }
}

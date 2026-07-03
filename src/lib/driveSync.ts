export const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
export const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';
export const ARCHIVE_FOLDER_NAME = 'Axion Archive';

async function getOrCreateFolder(accessToken: string): Promise<string> {
    const q = encodeURIComponent(`name='${ARCHIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const res = await fetch(`${DRIVE_API_URL}/files?q=${q}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();
    if (data.files && data.files.length > 0) {
        return data.files[0].id;
    }
    const createRes = await fetch(`${DRIVE_API_URL}/files`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: ARCHIVE_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder'
        })
    });
    const createData = await createRes.json();
    return createData.id;
}

export async function syncArchive(accessToken: string): Promise<boolean> {
    try {
        const folderId = await getOrCreateFolder(accessToken);
        
        // Group all axion/pcbm local storage keys by Month (YYYY-MM)
        const monthlyData: Record<string, Record<string, string>> = {};
        let canvasData = "";
        let settingsData = "";

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            
            if (key === 'axion_canvas_state') {
                canvasData = localStorage.getItem(key) || '';
                continue;
            }
            if (key === 'pcbm_settings' || key === 'axion_settings') {
                settingsData = localStorage.getItem(key) || '';
                continue;
            }

            if (key.startsWith('axion_') || key.startsWith('pcbm_')) {
                // Try to extract date
                const dateMatch = key.match(/\d{4}-\d{2}-\d{2}/);
                let monthKey = 'unknown';
                if (dateMatch) {
                    monthKey = dateMatch[0].substring(0, 7); // YYYY-MM
                } else {
                    monthKey = 'general';
                }
                
                if (!monthlyData[monthKey]) monthlyData[monthKey] = {};
                monthlyData[monthKey][key] = localStorage.getItem(key) || '';
            }
        }

        // Add canvas and settings to general
        if (!monthlyData['general']) monthlyData['general'] = {};
        if (canvasData) monthlyData['general']['axion_canvas_state'] = canvasData;
        if (settingsData) monthlyData['general']['pcbm_settings'] = settingsData;

        // Fetch existing files in folder
        const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
        const filesRes = await fetch(`${DRIVE_API_URL}/files?q=${q}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const filesData = await filesRes.json();
        const existingFiles = filesData.files || [];

        // Upload each month's data
        for (const [month, dataObj] of Object.entries(monthlyData)) {
            const filename = `axion_data_${month}.json`;
            const existingFile = existingFiles.find((f: any) => f.name === filename);
            const fileContent = JSON.stringify(dataObj);
            
            // For monthly files, if they exist on drive, we should merge.
            let mergedData = { ...dataObj };
            
            if (existingFile) {
                 const downloadRes = await fetch(`${DRIVE_API_URL}/files/${existingFile.id}?alt=media`, {
                     headers: { Authorization: `Bearer ${accessToken}` }
                 });
                 if (downloadRes.ok) {
                     try {
                         const remoteData = await downloadRes.json();
                         // Local takes precedence
                         mergedData = { ...remoteData, ...mergedData };
                     } catch(e) {}
                 }
            }

            const metadata = { name: filename, parents: [folderId] };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', new Blob([JSON.stringify(mergedData)], { type: 'application/json' }));
            
            const url = existingFile 
                ? `${UPLOAD_API_URL}/files/${existingFile.id}?uploadType=multipart`
                : `${UPLOAD_API_URL}/files?uploadType=multipart`;
                
            const method = existingFile ? 'PATCH' : 'POST';
            await fetch(url, {
                method,
                headers: { Authorization: `Bearer ${accessToken}` },
                body: form
            });
        }

        localStorage.setItem('last_auto_sync', new Date().toLocaleString());
        return true;
    } catch (e) {
        console.error("Drive sync error", e);
        return false;
    }
}

export async function downloadLatestArchive(accessToken: string): Promise<boolean> {
    try {
        const folderId = await getOrCreateFolder(accessToken);
        const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
        const filesRes = await fetch(`${DRIVE_API_URL}/files?q=${q}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const filesData = await filesRes.json();
        const existingFiles = filesData.files || [];

        // Sort files to get the latest 2 months and general
        const sortedFiles = existingFiles.sort((a: any, b: any) => b.name.localeCompare(a.name));
        
        let count = 0;
        for (const file of sortedFiles) {
            // Download general and up to 2 latest month files
            if (file.name.includes('general') || count < 2) {
                const downloadRes = await fetch(`${DRIVE_API_URL}/files/${file.id}?alt=media`, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                if (downloadRes.ok) {
                    const data = await downloadRes.json();
                    for (const [key, value] of Object.entries(data)) {
                        // Don't overwrite today's active data if we are actively using it? 
                        // Actually, it's fine. It's a restore.
                        localStorage.setItem(key, value as string);
                    }
                }
                if (!file.name.includes('general')) count++;
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
        
        const logKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('axion_logs_') || key.startsWith('pcbm_log_'))) {
                const dateStr = key.replace('axion_logs_', '').replace('pcbm_log_', '');
                logKeys.push({ key, date: new Date(dateStr).getTime() });
            }
        }
        
        logKeys.sort((a, b) => a.date - b.date);
        
        const toRemove = Math.max(1, Math.floor(logKeys.length * 0.3));
        for (let i = 0; i < toRemove; i++) {
            localStorage.removeItem(logKeys[i].key);
        }
    }
}

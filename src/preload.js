const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('winsdom', {
    // Controle de Menu e Exportação
    onExportPDF: (callback) => ipcRenderer.on('export-pdf', () => callback()),
    onMenuAction: (callback) => ipcRenderer.on('menu-action', (_event, action) => callback(action)),
    
    // Persistência Assíncrona via IPC Invoke (Moderna e Tipada)
    storageWrite: (filename, payload) => ipcRenderer.invoke('storage:write', { filename, payload }),
    storageRead: (filename) => ipcRenderer.invoke('storage:read', filename),
    
    // Fallback legado
    triggerSave: (data) => ipcRenderer.send('save-data', data)
});

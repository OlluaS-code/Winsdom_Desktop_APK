const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('winsdom', {
    onExportPDF: (callback) => ipcRenderer.on('export-pdf', () => callback()),
    onMenuAction: (callback) => ipcRenderer.on('menu-action', (_event, action) => callback(action)),
    triggerSave: (data) => ipcRenderer.send('save-data', data)
});

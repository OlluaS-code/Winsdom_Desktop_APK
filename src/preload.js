const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('winsdom', {
    // Controle de Menu e Exportação
    onExportPDF: (callback) => ipcRenderer.on('export-pdf', () => callback()),
    onMenuAction: (callback) => ipcRenderer.on('menu-action', (_event, action) => callback(action)),
    
    // Persistência Assíncrona via IPC Invoke
    storageWrite: (filename, payload) => ipcRenderer.invoke('storage:write', { filename, payload }),
    storageRead: (filename) => ipcRenderer.invoke('storage:read', filename),
    storageDelete: (filename) => ipcRenderer.invoke('storage:delete', filename),
    
    // Navegação entre Módulos (Hub)
    openModule: (moduleName) => ipcRenderer.invoke('open-module', moduleName),
    
    // Abertura Segura de Links Externos (Redes, Portfólio e Email)
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    
    // Fallback legado
    triggerSave: (data) => ipcRenderer.send('save-data', data)
});

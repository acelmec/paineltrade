const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('isElectron', true);
contextBridge.exposeInMainWorld('electronAPI', {
  setClosable: (closable) => ipcRenderer.send('set-closable', closable),
  closeApp: () => ipcRenderer.send('close-app')
});

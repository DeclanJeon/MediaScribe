const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mediaScribe', {
  isDesktopApp: true,
  getAppState: () => ipcRenderer.invoke('app:get-state'),
  pickFiles: () => ipcRenderer.invoke('dialog:pick-files'),
  chooseOutputDirectory: (currentPath) => ipcRenderer.invoke('dialog:choose-output-directory', currentPath),
  startTranscription: (payload) => ipcRenderer.invoke('transcription:start', payload),
  saveLogs: (payload) => ipcRenderer.invoke('logs:save', payload),
  repairEngine: () => ipcRenderer.invoke('engine:repair'),
  openFolder: (targetPath) => ipcRenderer.invoke('shell:open-folder', targetPath),
  onTranscriptionProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('transcription:progress', listener);
    return () => ipcRenderer.removeListener('transcription:progress', listener);
  },
});

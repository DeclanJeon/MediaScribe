const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mediaScribe', {
  isDesktopApp: true,
  getAppState: () => ipcRenderer.invoke('app:get-state'),
  pickFiles: () => ipcRenderer.invoke('dialog:pick-files'),
  chooseOutputDirectory: (currentPath) => ipcRenderer.invoke('dialog:choose-output-directory', currentPath),
  startTranscription: (payload) => ipcRenderer.invoke('transcription:start', payload),
  stopTranscription: () => ipcRenderer.invoke('transcription:stop'),
  saveLogs: (payload) => ipcRenderer.invoke('logs:save', payload),
  repairEngine: () => ipcRenderer.invoke('engine:repair'),
  purgeInstallation: () => ipcRenderer.invoke('engine:purge'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  openFolder: (targetPath) => ipcRenderer.invoke('shell:open-folder', targetPath),
  onTranscriptionProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('transcription:progress', listener);
    return () => ipcRenderer.removeListener('transcription:progress', listener);
  },
});

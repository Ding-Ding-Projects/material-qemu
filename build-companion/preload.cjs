'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('builder', {
  snapshot: () => ipcRenderer.invoke('build:snapshot'),
  log: () => ipcRenderer.invoke('build:log'),
  run: (action) => ipcRenderer.invoke('build:run', action),
  stop: () => ipcRenderer.invoke('build:stop'),
  openSource: () => ipcRenderer.invoke('build:open-source'),
  openInstaller: () => ipcRenderer.invoke('build:open-installer'),
  onState: (fn) => ipcRenderer.on('build:state', (_e, s) => fn(s)),
  onLog: (fn) => ipcRenderer.on('build:log', (_e, l) => fn(l)),
});

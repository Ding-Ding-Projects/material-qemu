'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('host', {
  snapshot: () => ipcRenderer.invoke('host:snapshot'),
  log: () => ipcRenderer.invoke('host:log'),
  start: () => ipcRenderer.invoke('host:start'),
  stop: () => ipcRenderer.invoke('host:stop'),
  open: () => ipcRenderer.invoke('host:open'),
  copy: () => ipcRenderer.invoke('host:copy'),
  openData: () => ipcRenderer.invoke('host:open-data'),
  installQemu: () => ipcRenderer.invoke('host:install-qemu'),
  setLogin: (on) => ipcRenderer.invoke('host:login', on),
  onState: (fn) => ipcRenderer.on('host:state', (_e, s) => fn(s)),
  onLog: (fn) => ipcRenderer.on('host:log', (_e, l) => fn(l)),
});

'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deployApi', {
  info: () => ipcRenderer.invoke('app:info'),
  notice: () => ipcRenderer.invoke('app:notice'),
  hypervisors: () => ipcRenderer.invoke('hv:list'),
  adapters: (id) => ipcRenderer.invoke('hv:adapters', id),
  latestRelease: () => ipcRenderer.invoke('release:latest'),
  pickOva: () => ipcRenderer.invoke('file:pickOva'),
  deploy: (req) => ipcRenderer.invoke('deploy:start', req),
  cancel: () => ipcRenderer.invoke('deploy:cancel'),
  onEvent: (fn) => { const h = (_e, m) => fn(m); ipcRenderer.on('deploy:event', h); return () => ipcRenderer.off('deploy:event', h); },
  instances: () => ipcRenderer.invoke('instances:list'),
  action: (id, action) => ipcRenderer.invoke('instances:action', { id, action }),
  remove: (id, gate) => ipcRenderer.invoke('instances:remove', { id, gate }),
  open: (url) => ipcRenderer.invoke('shell:open', url),
  openFolder: () => ipcRenderer.invoke('shell:openFolder'),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
});

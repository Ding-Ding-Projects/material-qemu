'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const hv = require('./lib/hypervisors.cjs');
const appliance = require('./lib/appliance.cjs');
const { Registry, deploy, status } = require('./lib/instances.cjs');

let win = null;
let registry = null;
let deployAbort = null;
const dataDir = () => path.join(app.getPath('userData'));
const vmRoot = () => path.join(app.getPath('documents'), 'Material QEMU VMs');

async function hypervisors() { return hv.describe(); }

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 720, minHeight: 560, backgroundColor: '#0f0e0e', title: 'Material QEMU Deploy',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

const send = (msg) => win?.webContents.send('deploy:event', msg);

function safeUrl(u) {
  try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : null; } catch { return null; }
}

ipcMain.handle('app:info', () => ({ version: app.getVersion(), vmRoot: vmRoot(), repo: appliance.REPO }));
ipcMain.handle('hv:list', async () => hypervisors());
ipcMain.handle('hv:adapters', async (_e, id) => {
  const list = await hypervisors();
  const h = list.find((x) => x.id === id);
  if (!h) return [];
  if (h.id === 'virtualbox') return hv.virtualBoxAdapters(h);
  return ['Automatic (VMware bridged)'];
});
ipcMain.handle('release:latest', async () => appliance.latestRelease());
ipcMain.handle('file:pickOva', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose a Material QEMU appliance', filters: [{ name: 'Appliance', extensions: ['ova'] }], properties: ['openFile'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('deploy:start', async (_e, req) => {
  if (deployAbort) throw new Error('A deployment is already running.');
  deployAbort = new AbortController();
  const startedAt = Date.now();
  try {
    const list = await hypervisors();
    const h = list.find((x) => x.id === req.hypervisor);
    if (!h || !h.ready) throw new Error('The chosen hypervisor is not available on this computer.');
    let ovaFile = req.localOva;
    let version = 'local file';
    if (!ovaFile) {
      send({ type: 'step', id: 'appliance', state: 'active', detail: 'reading the latest release' });
      const rel = await appliance.latestRelease();
      if (!rel.ova) throw new Error(rel.reason);
      version = rel.tag;
      const got = await appliance.downloadVerified(rel, path.join(dataDir(), 'cache'), { signal: deployAbort.signal, onProgress: (p) => send({ type: 'progress', ...p }) });
      ovaFile = got.file;
    } else if (!fs.existsSync(ovaFile)) throw new Error('The chosen appliance file no longer exists.');
    const adapter = h.id === 'virtualbox' ? req.adapter : null;
    const result = await deploy({ registry, hypervisor: h, ovaFile, version, name: req.name, cpus: req.cpus, memoryMb: req.memoryMb, adapter, nested: req.nested, vmRoot: vmRoot(), emit: send, signal: deployAbort.signal });
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, message: err.message, command: err.command || null, exitCode: err.exitCode ?? null, output: err.output || '', seconds: Math.round((Date.now() - startedAt) / 1000), failedAt: new Date().toISOString() };
  } finally {
    deployAbort = null;
  }
});
ipcMain.handle('deploy:cancel', () => { deployAbort?.abort(); return true; });

ipcMain.handle('instances:list', async () => status({ registry, hypervisors: await hypervisors() }));
ipcMain.handle('instances:action', async (_e, { id, action }) => {
  const item = registry.get(id);
  if (!item) throw new Error('That instance is not managed by this app.');
  const h = (await hypervisors()).find((x) => x.id === item.hypervisor);
  if (!h) throw new Error('Its hypervisor is not available on this computer.');
  const d = hv.drivers[h.id];
  try {
    if (action === 'start') { fs.rmSync(item.serialPath, { force: true }); await d.start(h, item); }
    else if (action === 'stop') await d.stop(h, item);
    else if (action === 'restart') { await d.stop(h, item); fs.rmSync(item.serialPath, { force: true }); await d.start(h, item); }
    else throw new Error('Unknown action.');
    if (action !== 'stop') {
      appliance.waitForReport(item.serialPath, { timeoutMs: 15 * 60 * 1000 }).then((r) => { if (r.kind === 'ready') registry.update(id, { lastUrl: r.url, setupCode: r.setup }); });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message, command: err.command || null, exitCode: err.exitCode ?? null, output: err.output || '' };
  }
});
ipcMain.handle('instances:remove', async (_e, { id, gate }) => {
  const item = registry.get(id);
  if (!item) throw new Error('That instance is not managed by this app.');
  if (!gate || gate.keys !== 2 || gate.slider !== 100) return { ok: false, message: 'Removal needs both keys and the full slider.' };
  const h = (await hypervisors()).find((x) => x.id === item.hypervisor);
  try {
    if (h && (await hv.drivers[h.id].exists(h, item))) await hv.drivers[h.id].remove(h, item);
    fs.rmSync(item.serialPath, { force: true });
    await registry.remove(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message, command: err.command || null, exitCode: err.exitCode ?? null, output: err.output || '' };
  }
});
ipcMain.handle('shell:open', (_e, url) => { const u = safeUrl(url); if (u) shell.openExternal(u); return Boolean(u); });
ipcMain.handle('shell:openFolder', () => shell.openPath(vmRoot()));
ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text).slice(0, 4096)); return true; });

app.whenReady().then(async () => {
  registry = await new Registry(path.join(dataDir(), 'instances.json')).load();
  createWindow();
});
app.on('window-all-closed', () => app.quit());

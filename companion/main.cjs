'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const hv = require('./lib/hypervisors.cjs');
const appliance = require('./lib/appliance.cjs');
const net = require('node:net');
const flashLib = require('./lib/flash.cjs');
const { Registry, deploy, deployDocker, status } = require('./lib/instances.cjs');

let win = null;
let registry = null;
let deployAbort = null;
const dataDir = () => path.join(app.getPath('userData'));
const vmRoot = () => path.join(app.getPath('documents'), 'Material QEMU VMs');
// Downloads live beside the VMs, not in AppData: hypervisor services (VBoxSVC,
// VMware) run as separate processes and cannot see files a packaged or
// sandboxed parent wrote into AppData.
const cacheDir = () => path.join(vmRoot(), 'cache');

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

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '0.0.0.0', () => s.close(() => resolve(true)));
  });
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
ipcMain.handle('net:lan', () => hv.lanAddresses());
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
    if (h.id === 'docker') {
      const rel = await appliance.latestRelease();
      if (!rel.tag) throw new Error(rel.reason);
      const image = `ghcr.io/ding-ding-projects/material-qemu:${rel.tag.replace(/^v/, '')}`;
      const result = await deployDocker({ registry, hypervisor: h, image, version: rel.tag, name: req.name, ip: req.ip, port: req.port, emit: send, signal: deployAbort.signal, portFree });
      return { ok: true, ...result };
    }
    let ovaFile = req.localOva;
    let verified = false;
    let version = 'local file';
    if (!ovaFile) {
      send({ type: 'step', id: 'appliance', state: 'active', detail: 'reading the latest release' });
      const rel = await appliance.latestRelease();
      if (!rel.ova) throw new Error(rel.reason);
      version = rel.tag;
      const got = await appliance.downloadVerified(rel, cacheDir(), { signal: deployAbort.signal, onProgress: (p) => send({ type: 'progress', ...p }) });
      ovaFile = got.file;
      verified = true;
    } else if (!fs.existsSync(ovaFile)) throw new Error('The chosen appliance file no longer exists.');
    const adapter = h.id === 'virtualbox' ? req.adapter : null;
    const result = await deploy({ registry, hypervisor: h, ovaFile, verified, version, name: req.name, cpus: req.cpus, memoryMb: req.memoryMb, adapter, nested: req.nested, vmRoot: vmRoot(), emit: send, signal: deployAbort.signal });
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
    const clearSerial = () => { if (item.serialPath) fs.rmSync(item.serialPath, { force: true }); };
    if (action === 'start') { clearSerial(); await d.start(h, item); }
    else if (action === 'stop') await d.stop(h, item);
    else if (action === 'restart') { await d.stop(h, item); clearSerial(); await d.start(h, item); }
    else throw new Error('Unknown action.');
    if (action !== 'stop' && item.serialPath) {
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
    if (item.serialPath) fs.rmSync(item.serialPath, { force: true });
    await registry.remove(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message, command: err.command || null, exitCode: err.exitCode ?? null, output: err.output || '' };
  }
});
let flashing = false;
ipcMain.handle('flash:disks', async () => flashLib.listRemovableDisks());
ipcMain.handle('flash:start', async (_e, { kind, diskNumber, gate }) => {
  if (flashing) return { ok: false, message: 'A flash is already running.' };
  if (!gate || gate.keys !== 2 || gate.slider !== 100) return { ok: false, message: 'Flashing needs both keys and the full slider.' };
  if (kind !== 'usb' && kind !== 'installer') return { ok: false, message: 'Unknown image.' };
  flashing = true;
  const startedAt = Date.now();
  const progress = (p) => win?.webContents.send('flash:event', p);
  try {
    const disks = await flashLib.listRemovableDisks();
    const disk = disks.find((d) => d.number === diskNumber);
    if (!disk) throw new Error('That disk is no longer attached or is not a removable USB or SD disk. Nothing was written.');
    const rel = await appliance.latestRelease();
    const asset = rel[kind];
    if (!asset) throw new Error('The latest release has no image of this kind.');
    const meta = await appliance.readMeta(asset);
    if (disk.size < meta.rawBytes) throw new Error('That disk is smaller than the image. Nothing was written.');
    progress({ phase: 'downloading', done: 0, total: asset.size });
    const got = await appliance.downloadAsset(asset, cacheDir(), { onProgress: (p) => progress({ phase: 'downloading', done: p.done, total: p.total }) });
    progress({ phase: 'approval', done: 0, total: meta.rawBytes });
    const writer = flashLib.writerPath(process.resourcesPath);
    if (!writer) throw new Error('The disk writer is missing from this app.');
    const r = await flashLib.flash({ image: got.file, meta, disk, writer, onProgress: progress });
    return { ...r, disk, tag: rel.tag, seconds: Math.round((Date.now() - startedAt) / 1000), failedAt: r.ok ? null : new Date().toISOString() };
  } catch (err) {
    return { ok: false, message: err.message, seconds: Math.round((Date.now() - startedAt) / 1000), failedAt: new Date().toISOString() };
  } finally { flashing = false; }
});
ipcMain.handle('shell:open', (_e, url) => { const u = safeUrl(url); if (u) shell.openExternal(u); return Boolean(u); });
ipcMain.handle('shell:openFolder', () => shell.openPath(vmRoot()));
ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text).slice(0, 4096)); return true; });

let startupNotice = null;
ipcMain.handle('app:notice', () => startupNotice);

app.whenReady().then(async () => {
  try {
    registry = await new Registry(path.join(dataDir(), 'instances.json')).load();
    if (registry.recovered) startupNotice = `The saved instance list could not be read (${registry.recovered.reason}). It was kept as ${registry.recovered.kept} and a new empty list was started. Your virtual machines were not changed.`;
  } catch (err) {
    registry = new Registry(path.join(dataDir(), 'instances.json'));
    startupNotice = `The saved instance list could not be opened (${err.message}). Instances are not shown until this is fixed; your virtual machines were not changed.`;
  }
  createWindow();
});
app.on('window-all-closed', () => app.quit());

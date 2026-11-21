'use strict';
// Material QEMU Build: a portable window over the repository's own build.bat
// and build-installer.bat. The complete source of its commit ships inside the
// file (resources/source.zip), so it builds with no checkout present.
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, execFile } = require('node:child_process');

if (!app.requestSingleInstanceLock()) { app.quit(); return; }

const resources = app.isPackaged ? process.resourcesPath : path.join(__dirname, 'build');
const info = (() => { try { return JSON.parse(fs.readFileSync(path.join(resources, 'source.json'), 'utf8')); } catch { return { commit: 'unknown', version: app.getVersion() }; } })();
const workRoot = path.join(app.getPath('documents'), 'Material QEMU Build');
const sourceDir = path.join(workRoot, String(info.commit).slice(0, 12));
const ACTIONS = {
  build: { file: 'build.bat', args: [] },
  run: { file: 'build.bat', args: ['/run'] },
  installer: { file: 'build-installer.bat', args: [] },
};
let win = null;
let job = null;
const log = [];

function send(channel, value) { win?.webContents.send(channel, value); }
function addLog(text) {
  for (const line of String(text).split(/\r?\n/)) if (line.trim()) log.push(line.slice(0, 600));
  log.splice(0, Math.max(0, log.length - 400));
  send('build:log', log.slice(-400));
}
function snapshot() {
  return { commit: info.commit, version: info.version, sourceDir, ready: fs.existsSync(path.join(sourceDir, 'build.bat')), job: job ? { action: job.action, startedAt: job.startedAt } : null, last: lastResult };
}
let lastResult = null;

// Unpacks the embedded source once per commit with PowerShell's Expand-Archive.
function ensureSource() {
  if (fs.existsSync(path.join(sourceDir, 'build.bat'))) return Promise.resolve();
  const zip = path.join(resources, 'source.zip');
  if (!fs.existsSync(zip)) return Promise.reject(new Error('The embedded source is missing from this file.'));
  fs.mkdirSync(sourceDir, { recursive: true });
  addLog(`Unpacking the source of ${info.commit} into ${sourceDir}…`);
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${sourceDir.replace(/'/g, "''")}' -Force`], { windowsHide: true }, (error) => {
      if (error || !fs.existsSync(path.join(sourceDir, 'build.bat'))) reject(new Error('The source could not be unpacked.'));
      else { addLog('Source ready.'); resolve(); }
    });
  });
}

async function runAction(action) {
  if (job) return snapshot();
  const spec = ACTIONS[action];
  if (!spec) throw new Error('Unknown action.');
  try { await ensureSource(); } catch (error) { lastResult = { action, ok: false, message: error.message, at: new Date().toISOString() }; send('build:state', snapshot()); return snapshot(); }
  const startedAt = Date.now();
  addLog(`> ${spec.file} ${spec.args.join(' ')}`.trim());
  // The script is called by its full path: Windows can be set not to run
  // programs from the current folder by name (NoDefaultCurrentDirectoryInExePath).
  const child = spawn('cmd.exe', ['/d', '/c', path.join(sourceDir, spec.file), ...spec.args], { cwd: sourceDir, windowsHide: true, env: { ...process.env, RUN_AFTER_BUILD: '', SOURCE_REVISION: info.commit } });
  job = { action, child, startedAt: new Date(startedAt).toISOString() };
  send('build:state', snapshot());
  child.stdout.on('data', addLog);
  child.stderr.on('data', addLog);
  child.on('exit', (code) => {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    const stopped = job?.stopped;
    lastResult = { action, ok: code === 0 && !stopped, code, stopped: Boolean(stopped), seconds, at: new Date().toISOString() };
    addLog(stopped ? `Stopped after ${seconds} s.` : `Finished with exit code ${code} after ${seconds} s.`);
    job = null;
    send('build:state', snapshot());
  });
  return snapshot();
}

function stopAction() {
  if (!job) return snapshot();
  job.stopped = true;
  execFile('taskkill', ['/PID', String(job.child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  return snapshot();
}

ipcMain.handle('build:snapshot', () => snapshot());
ipcMain.handle('build:log', () => log.slice(-400));
ipcMain.handle('build:run', (_e, action) => runAction(action));
ipcMain.handle('build:stop', () => stopAction());
ipcMain.handle('build:open-source', async () => { await ensureSource().catch(() => {}); return shell.openPath(sourceDir); });
ipcMain.handle('build:open-installer', () => {
  const dir = path.join(sourceDir, 'host-app', 'dist', 'squirrel-windows');
  return shell.openPath(fs.existsSync(dir) ? dir : sourceDir);
});

function createWindow() {
  win = new BrowserWindow({
    width: 760, height: 680, minWidth: 420, minHeight: 500, title: 'Material QEMU Build', backgroundColor: '#151110', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => { win = null; });
}
app.on('second-instance', () => { win?.show(); win?.focus(); });
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { stopAction(); app.quit(); });

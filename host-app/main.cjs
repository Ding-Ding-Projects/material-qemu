'use strict';
// Material QEMU Host: runs the Material QEMU web service on this Windows
// computer for the local network and shows its address, state and log.
// Installed with Squirrel.Windows; the web service ships in resources/payload.
const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, execFile } = require('node:child_process');
const { pickLanAddress, findQemu, nextFreePort } = require('./lib/host.cjs');

// Squirrel.Windows lifecycle: create or remove shortcuts, then exit.
function handleSquirrel() {
  const cmd = process.argv[1];
  if (process.platform !== 'win32' || !cmd || !cmd.startsWith('--squirrel-')) return false;
  const update = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  const exe = path.basename(process.execPath);
  const run = (args) => { try { spawn(update, args, { detached: true }).on('close', () => app.quit()); } catch { app.quit(); } };
  if (cmd === '--squirrel-install' || cmd === '--squirrel-updated') { run(['--createShortcut', exe]); return true; }
  if (cmd === '--squirrel-uninstall') { app.setLoginItemSettings({ openAtLogin: false }); run(['--removeShortcut', exe]); return true; }
  if (cmd === '--squirrel-obsolete') { app.quit(); return true; }
  return false;
}
if (handleSquirrel()) return;
if (!app.requestSingleInstanceLock()) { app.quit(); return; }

const payload = app.isPackaged ? path.join(process.resourcesPath, 'payload') : path.join(__dirname, '..');
const dataDir = path.join(app.getPath('documents'), 'Material QEMU VMs', 'host');
const settingsFile = path.join(app.getPath('userData'), 'host-settings.json');
const log = [];
let win = null;
let child = null;
let state = { status: 'stopped', url: null, port: null, error: null, startedAt: null };

function readSettings() {
  try { return { port: 8090, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) }; } catch { return { port: 8090 }; }
}
function addLog(text) {
  for (const line of String(text).split(/\r?\n/)) if (line.trim()) log.push(line.slice(0, 500));
  log.splice(0, Math.max(0, log.length - 200));
  win?.webContents.send('host:log', log.slice(-200));
}
function publish() { win?.webContents.send('host:state', snapshot()); }
function snapshot() {
  const qemu = findQemu();
  return { ...state, dataDir, qemu: qemu ? qemu.dir : null, openAtLogin: app.getLoginItemSettings().openAtLogin, version: app.getVersion() };
}

async function health(url) {
  try { const r = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(3000) }); return r.ok; } catch { return false; }
}

async function startService() {
  if (child) return snapshot();
  const qemu = findQemu();
  const ip = pickLanAddress();
  if (!ip) { state = { ...state, status: 'error', error: 'No network address was found. Connect to a network first.' }; publish(); return snapshot(); }
  const wanted = readSettings().port;
  const port = await nextFreePort(wanted);
  if (!port) { state = { ...state, status: 'error', error: `Ports ${wanted} to ${wanted + 19} are all in use.` }; publish(); return snapshot(); }
  if (port !== wanted) addLog(`Port ${wanted} is in use, so ${port} is used instead.`);
  fs.mkdirSync(dataDir, { recursive: true });
  const url = `http://${ip}:${port}/`;
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    PORT: String(port),
    BIND_ADDRESS: '0.0.0.0',
    PUBLIC_ORIGIN: url.replace(/\/$/, ''),
    DATA_DIR: dataDir,
    PATH: [qemu?.dir, process.env.PATH].filter(Boolean).join(path.delimiter),
  };
  state = { status: 'starting', url, port, error: null, startedAt: new Date().toISOString() };
  publish();
  child = spawn(process.execPath, [path.join(payload, 'server', 'index.mjs')], { cwd: payload, env, windowsHide: true });
  child.stdout.on('data', addLog);
  child.stderr.on('data', addLog);
  child.on('exit', (code) => {
    addLog(`The web service stopped (exit code ${code}).`);
    child = null;
    state = { ...state, status: state.status === 'stopping' ? 'stopped' : 'error', error: state.status === 'stopping' ? null : `The web service stopped unexpectedly (exit code ${code}).` };
    publish();
  });
  for (let i = 0; i < 60 && child; i++) {
    if (await health(url)) { state = { ...state, status: 'running' }; publish(); return snapshot(); }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (child && state.status === 'starting') { state = { ...state, status: 'error', error: 'The web service did not answer within a minute. See the log.' }; publish(); }
  return snapshot();
}

function stopService() {
  if (!child) return Promise.resolve(snapshot());
  state = { ...state, status: 'stopping' };
  publish();
  return new Promise((resolve) => {
    const proc = child;
    proc.once('exit', () => resolve(snapshot()));
    // taskkill /T also stops the QEMU guests the service started.
    execFile('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => {});
  });
}

// Installs QEMU with Chocolatey (installing Chocolatey first if needed) in an
// elevated PowerShell. Windows asks the person to approve; declining changes nothing.
function installQemu() {
  const script = [
    "$ErrorActionPreference='Stop'",
    "if (-not (Get-Command choco -ErrorAction SilentlyContinue)) { Set-ExecutionPolicy Bypass -Scope Process -Force; [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1')) }",
    "$env:Path += ';' + [Environment]::GetEnvironmentVariable('Path','Machine')",
    'choco install qemu -y --no-progress',
  ].join('; ');
  return new Promise((resolve) => {
    const launcher = `$p = Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Normal -ArgumentList @('-NoProfile','-Command',"${script.replace(/"/g, '`"')}"); exit $p.ExitCode`;
    execFile('powershell.exe', ['-NoProfile', '-Command', launcher], { windowsHide: true }, (error) => {
      const found = findQemu({ ...process.env, PATH: `${process.env.PATH};C:\\Program Files\\qemu` });
      addLog(found ? `QEMU is installed at ${found.dir}.` : `QEMU was not installed${error ? ` (${error.message.split(/\r?\n/)[0]})` : ''}. Nothing else was changed.`);
      publish();
      resolve(snapshot());
    });
  });
}

ipcMain.handle('host:snapshot', () => snapshot());
ipcMain.handle('host:log', () => log.slice(-200));
ipcMain.handle('host:start', () => startService());
ipcMain.handle('host:stop', () => stopService());
ipcMain.handle('host:open', () => { if (state.url) shell.openExternal(state.url); return true; });
ipcMain.handle('host:copy', () => { if (state.url) clipboard.writeText(state.url); return Boolean(state.url); });
ipcMain.handle('host:open-data', () => shell.openPath(dataDir));
ipcMain.handle('host:install-qemu', () => installQemu());
ipcMain.handle('host:login', (_e, on) => { app.setLoginItemSettings({ openAtLogin: Boolean(on), args: ['--background'] }); return snapshot(); });

function createWindow() {
  win = new BrowserWindow({
    width: 760,
    height: 720,
    minWidth: 420,
    minHeight: 520,
    title: 'Material QEMU Host',
    backgroundColor: '#151110',
    autoHideMenuBar: true,
    show: !process.argv.includes('--background'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => { win = null; });
}

app.on('second-instance', () => { if (win) { win.show(); win.focus(); } else createWindow(); });
app.whenReady().then(() => { createWindow(); startService(); });
app.on('window-all-closed', async () => { await stopService(); app.quit(); });
app.on('before-quit', () => { if (child) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {}); });

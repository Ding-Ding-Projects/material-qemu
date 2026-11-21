'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const vm = require('node:vm');
const { filterDisks } = require('../lib/flash.cjs');
const hv = require('../lib/hypervisors.cjs');

test('only removable disks that do not hold the system are offered', () => {
  const disks = filterDisks([
    { Number: 0, FriendlyName: 'NVMe system', Size: 1e12, BusType: 'NVMe', IsBoot: true, IsSystem: true },
    { Number: 1, FriendlyName: 'SATA data', Size: 2e12, BusType: 'SATA', IsBoot: false, IsSystem: false },
    { Number: 2, FriendlyName: 'SanDisk Ultra', Size: 32e9, BusType: 'USB', IsBoot: false, IsSystem: false },
    { Number: 3, FriendlyName: 'USB boot stick', Size: 16e9, BusType: 'USB', IsBoot: true, IsSystem: false },
    { Number: 4, FriendlyName: 'SD reader', Size: 64e9, BusType: 'SD', IsBoot: false, IsSystem: false },
  ]);
  assert.deepEqual(disks.map((d) => d.number), [2, 4]);
});

test('Docker container names and ports are validated', () => {
  assert.equal(hv.containerName('lab'), 'material-qemu-lab');
  assert.throws(() => hv.containerName('a b'));
  assert.throws(() => hv.validatePort(80));
  assert.equal(hv.validatePort(8081), 8081);
  assert.throws(() => hv.validateIpv4('999.1.1.1'));
  assert.equal(hv.validateIpv4('192.168.1.20'), '192.168.1.20');
});

test('Docker remove refuses containers this app did not name', async () => {
  await assert.rejects(hv.drivers.docker.remove({ docker: 'docker.exe' }, { vmRef: 'postgres' }, async () => ({ code: 0, stdout: '', stderr: '' })), /did not name/);
});

test('LAN address list prefers physical adapters and skips loopback', () => {
  const list = hv.lanAddresses({
    'vEthernet (WSL)': [{ family: 'IPv4', address: '172.20.0.1', internal: false }],
    Ethernet: [{ family: 'IPv4', address: '192.168.50.10', internal: false }],
    Loopback: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  });
  assert.deepEqual(list.map((a) => a.address), ['192.168.50.10', '172.20.0.1']);
});

const pwsh = process.platform === 'win32' && spawnSync('powershell.exe', ['-NoProfile', '-Command', '1'], { encoding: 'utf8' }).status === 0;

test('the disk writer writes, hashes and reads back an image (file target)', { skip: !pwsh && 'needs Windows PowerShell' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqf-'));
  const raw = crypto.randomBytes(512 * 2048 + 512 * 7);
  const img = path.join(dir, 'img.gz'); fs.writeFileSync(img, zlib.gzipSync(raw));
  const target = path.join(dir, 'disk.bin'); const status = path.join(dir, 's.json');
  const sha = crypto.createHash('sha256').update(raw).digest('hex');
  const writer = path.join(__dirname, '..', 'scripts', 'flash-writer.ps1');
  const run = (expected) => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', writer, '-ImagePath', img, '-ExpectedSha256', expected, '-ExpectedBytes', String(raw.length), '-StatusPath', status, '-TargetFile', target], { encoding: 'utf8' });
  const ok = run(sha);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(JSON.parse(fs.readFileSync(status, 'utf8')).ok, true);
  assert.deepEqual(fs.readFileSync(target), raw);
  const bad = run('0'.repeat(64));
  assert.equal(bad.status, 1);
  const st = JSON.parse(fs.readFileSync(status, 'utf8'));
  assert.equal(st.ok, false);
  assert.match(st.message, /does not match/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('every interface string has a Cantonese translation', () => {
  const ctx = { window: {}, localStorage: { getItem: () => 'en', setItem() {} }, navigator: { language: 'en' }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'renderer', 'i18n.js'), 'utf8'), ctx);
  const known = new Set(ctx.window.I18N.keys());
  const used = new Set();
  for (const f of ['app.js', 'flash.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', f), 'utf8');
    for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)+)'/g)) used.add(m[1].replace(/\\'/g, "'"));
  }
  const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
  for (const m of html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)) used.add(m[1]);
  for (const k of ['Get the appliance', 'Import or create', 'Configure network and reporting', 'Start', 'Wait for the address report', 'Check health at the LAN address',
    'Healthy', 'Running, not answering yet', 'Stopped', 'Virtual machine missing', 'Hypervisor unavailable', 'Oracle VirtualBox', 'Docker on this computer']) used.add(k);
  const missing = [...used].filter((k) => !known.has(k) && !/^(Oracle VirtualBox|VMware Workstation( Player)?)$/.test(k));
  assert.deepEqual(missing, []);
});

'use strict';
// Removable-disk listing and the elevated image writer. Only USB or SD disks
// that do not hold the running system are ever offered.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { defaultRun } = require('./hypervisors.cjs');

const REMOVABLE = new Set(['USB', 'SD', 'MMC']);

function filterDisks(list) {
  return (Array.isArray(list) ? list : [list]).filter(Boolean)
    .map((d) => ({ number: d.Number, name: String(d.FriendlyName || 'Unnamed disk'), size: Number(d.Size), bus: String(d.BusType), boot: Boolean(d.IsBoot), system: Boolean(d.IsSystem) }))
    .filter((d) => Number.isInteger(d.number) && d.size > 0 && REMOVABLE.has(d.bus) && !d.boot && !d.system);
}

const BUS_NAMES = { 1: 'SCSI', 2: 'ATAPI', 3: 'ATA', 4: '1394', 5: 'SSA', 6: 'Fibre Channel', 7: 'USB', 8: 'RAID', 9: 'iSCSI', 10: 'SAS', 11: 'SATA', 12: 'SD', 13: 'MMC', 17: 'NVMe' };

async function listRemovableDisks(run = defaultRun) {
  const script = 'Get-Disk | Select-Object Number,FriendlyName,Size,@{n="BusType";e={"$($_.BusType)"}},IsBoot,IsSystem | ConvertTo-Json -Compress';
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeoutMs: 60000 });
  if (r.code !== 0) throw new Error(`The disk list could not be read: ${r.stderr.trim() || r.error || r.code}`);
  const text = r.stdout.trim();
  if (!text) return [];
  const raw = JSON.parse(text);
  const list = (Array.isArray(raw) ? raw : [raw]).map((d) => ({ ...d, BusType: BUS_NAMES[d.BusType] || d.BusType }));
  return filterDisks(list);
}

function writerPath(resourcesPath) {
  const candidates = [path.join(resourcesPath || '', 'flash-writer.ps1'), path.join(__dirname, '..', 'scripts', 'flash-writer.ps1')];
  return candidates.find((p) => fs.existsSync(p));
}

function psQuote(s) { return `'${String(s).replace(/'/g, "''")}'`; }
// Windows PowerShell may prefix UTF-8 files with a byte-order mark.
const readJson = async (file) => JSON.parse((await fsp.readFile(file, 'utf8')).replace(/^﻿/, ''));

// Starts the writer elevated (the native administrator prompt appears) and
// polls its status file. Resolves with the final status.
async function flash({ image, meta, disk, writer, onProgress, run = defaultRun }) {
  const status = path.join(os.tmpdir(), `mq-flash-${process.pid}-${Date.now()}.json`);
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', writer, '-ImagePath', image, '-ExpectedSha256', meta.rawSha256,
    '-ExpectedBytes', String(meta.rawBytes), '-StatusPath', status, '-DiskNumber', String(disk.number), '-DiskFriendlyName', disk.name, '-DiskSize', String(disk.size)];
  const launcher = `$p = Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @(${args.map(psQuote).join(',')}); exit $p.ExitCode`;
  let finished = false;
  const poll = (async () => {
    while (!finished) {
      try { onProgress?.(await readJson(status)); } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }
  })();
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', launcher], { timeoutMs: 4 * 60 * 60 * 1000 });
  finished = true; await poll;
  let final = null;
  try { final = await readJson(status); } catch {}
  await fsp.rm(status, { force: true });
  if (!final) {
    const declined = /cancel/i.test(r.stderr);
    return { ok: false, message: declined ? 'Administrator approval was declined. Nothing was written.' : `The writer did not start (exit code ${r.code}). Nothing was written.`, exitCode: r.code, output: r.stderr.trim() };
  }
  return final.ok ? { ok: true, sha256: final.sha256 } : { ok: false, message: final.message, exitCode: r.code, output: '' };
}

module.exports = { filterDisks, listRemovableDisks, writerPath, flash };

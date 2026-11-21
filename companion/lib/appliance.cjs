'use strict';
// Reading the appliance's serial report, checking health, and fetching the
// verified appliance from the project's latest release.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const REPO = 'Ding-Ding-Projects/material-qemu';

function parseSerial(text) {
  const lines = String(text).split(/\r?\n/);
  let report = null;
  for (const line of lines) {
    const m = line.match(/MQ-(READY|FAILED|BOOT)\s+(.*)$/);
    if (!m) continue;
    const fields = {};
    for (const pair of m[2].trim().split(/\s+/)) {
      const i = pair.indexOf('=');
      if (i > 0) fields[pair.slice(0, i)] = pair.slice(i + 1);
    }
    report = { kind: m[1].toLowerCase(), ...fields };
  }
  if (report && report.kind === 'ready') {
    let url;
    try { url = new URL(report.url); } catch { return { kind: 'failed', reason: 'invalid-url' }; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'failed', reason: 'invalid-url' };
    report.url = url.href;
    report.setup = report.setup && report.setup !== 'none' && /^[A-Za-z0-9_-]{8,128}$/.test(report.setup) ? report.setup : null;
  }
  return report;
}

async function readSerial(serialPath) {
  try { return parseSerial(await fsp.readFile(serialPath, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

function checkHealth(urlText, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL('/health', urlText); } catch { return resolve({ ok: false, detail: 'Invalid address' }); }
    const req = http.get(url, { timeout: timeoutMs, headers: { Host: url.host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { if (body.length < 4096) body += d; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch {}
        resolve({ ok: res.statusCode === 200 && parsed?.status === 'healthy', status: res.statusCode, version: parsed?.version ?? null, checkedAt: new Date().toISOString() });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, detail: 'Timed out', checkedAt: new Date().toISOString() }); });
    req.on('error', (e) => resolve({ ok: false, detail: e.code || e.message, checkedAt: new Date().toISOString() }));
  });
}

async function waitForReport(serialPath, { timeoutMs = 25 * 60 * 1000, signal, onTick } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('Cancelled while waiting for the appliance.');
    const report = await readSerial(serialPath);
    if (report?.kind === 'ready' || report?.kind === 'failed') return report;
    onTick?.(report);
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { kind: 'failed', reason: 'report-timeout' };
}

async function latestRelease(fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'material-qemu-deploy' } });
  if (res.status === 404) return { tag: null, ova: null, reason: 'No release has been published yet. Use a local .ova file.' };
  if (!res.ok) return { tag: null, ova: null, reason: `The release list could not be read (HTTP ${res.status}). Use a local .ova file.` };
  const rel = await res.json();
  const ova = rel.assets.find((a) => /^material-qemu-appliance-.*\.ova$/.test(a.name));
  const sum = ova && rel.assets.find((a) => a.name === `${ova.name}.sha256`);
  if (!ova || !sum) return { tag: rel.tag_name, ova: null, reason: 'The latest release has no appliance OVA with a checksum.' };
  return { tag: rel.tag_name, ova: { name: ova.name, size: ova.size, url: ova.browser_download_url }, sumUrl: sum.browser_download_url };
}

async function sha256File(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function downloadVerified(release, cacheDir, { onProgress, signal, fetchImpl = fetch } = {}) {
  await fsp.mkdir(cacheDir, { recursive: true });
  const sumRes = await fetchImpl(release.sumUrl, { signal });
  if (!sumRes.ok) throw new Error(`The checksum could not be downloaded (HTTP ${sumRes.status}).`);
  const expected = (await sumRes.text()).trim().split(/\s+/)[0].toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error('The published checksum is not a SHA-256 value.');
  const target = path.join(cacheDir, release.ova.name);
  if (fs.existsSync(target) && (await sha256File(target)) === expected) { onProgress?.({ phase: 'cached', done: release.ova.size, total: release.ova.size }); return { file: target, sha256: expected, cached: true }; }
  const partial = `${target}.partial`;
  const res = await fetchImpl(release.ova.url, { signal });
  if (!res.ok || !res.body) throw new Error(`The appliance could not be downloaded (HTTP ${res.status}).`);
  const out = fs.createWriteStream(partial);
  const hash = crypto.createHash('sha256');
  let done = 0;
  try {
    for await (const chunk of res.body) {
      hash.update(chunk);
      done += chunk.length;
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      onProgress?.({ phase: 'download', done, total: release.ova.size });
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  const actual = hash.digest('hex');
  if (actual !== expected) { await fsp.rm(partial, { force: true }); throw new Error(`The download's SHA-256 (${actual}) does not match the release (${expected}). Nothing was imported.`); }
  await fsp.rename(partial, target);
  return { file: target, sha256: actual, cached: false };
}

module.exports = { REPO, parseSerial, readSerial, checkHealth, waitForReport, latestRelease, downloadVerified, sha256File };

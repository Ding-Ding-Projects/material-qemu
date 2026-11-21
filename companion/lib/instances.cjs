'use strict';
// The deploy assistant's own record of the virtual machines it created, and
// the deploy pipeline. Nothing outside this registry is ever listed, stopped
// or removed.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { drivers, validateName, validateResources, defaultRun } = require('./hypervisors.cjs');
const { waitForReport, checkHealth } = require('./appliance.cjs');

class Registry {
  constructor(file) { this.file = file; this.items = []; }
  async load() {
    this.recovered = null;
    let text;
    try { text = await fsp.readFile(this.file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; this.items = []; return this; }
    try {
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.instances)) throw new Error('missing instances list');
      this.items = parsed.instances.filter((i) => i && typeof i.id === 'string' && typeof i.name === 'string');
    } catch (e) {
      // Keep the unreadable file for recovery instead of overwriting or crashing.
      const kept = `${this.file}.unreadable-${Date.now()}`;
      await fsp.rename(this.file, kept);
      this.items = [];
      this.recovered = { kept, reason: e.message };
    }
    return this;
  }
  async save() {
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify({ version: 1, instances: this.items }, null, 2));
    await fsp.rename(tmp, this.file);
  }
  get(id) { return this.items.find((i) => i.id === id) || null; }
  byName(name) { return this.items.find((i) => i.name.toLowerCase() === name.toLowerCase()) || null; }
  async add(item) { this.items.push(item); await this.save(); return item; }
  async update(id, patch) { const i = this.get(id); if (!i) return null; Object.assign(i, patch); await this.save(); return i; }
  async remove(id) { this.items = this.items.filter((i) => i.id !== id); await this.save(); }
}

const STEPS = ['appliance', 'import', 'configure', 'start', 'report', 'health'];

async function deploy({ registry, hypervisor, ovaFile, version, name, cpus, memoryMb, adapter, nested, vmRoot, emit = () => {}, run = defaultRun, signal }) {
  validateName(name); validateResources({ cpus, memoryMb });
  if (registry.byName(name)) throw new Error(`An instance named ${name} already exists. Pick another name.`);
  const driver = drivers[hypervisor.id];
  if (!driver) throw new Error('Unsupported hypervisor.');
  const folder = path.join(vmRoot, hypervisor.id);
  const serialPath = path.join(vmRoot, 'serial', `${name}.log`);
  await fsp.mkdir(path.dirname(serialPath), { recursive: true });
  const started = Date.now();
  const step = (id, state, detail = '') => emit({ type: 'step', id, state, detail });
  step('appliance', 'done', path.basename(ovaFile));

  step('import', 'active');
  const { vmRef } = await driver.import(hypervisor, { ova: ovaFile, name, folder, cpus, memoryMb }, run, (text) => emit({ type: 'output', text }));
  const record = await registry.add({ id: crypto.randomUUID(), name, hypervisor: hypervisor.id, vmRef, folder, serialPath, version, cpus, memoryMb, adapter: adapter || null, createdAt: new Date().toISOString(), lastUrl: null, setupCode: null });
  step('import', 'done');

  step('configure', 'active');
  await driver.configure(hypervisor, { vmRef, adapter, serialPath, nested, cpus, memoryMb }, run);
  step('configure', 'done', adapter || 'bridged');

  if (signal?.aborted) throw new Error('Cancelled before the virtual machine started. The imported machine is listed under Instances.');
  step('start', 'active');
  await fsp.rm(serialPath, { force: true });
  await driver.start(hypervisor, { vmRef }, run);
  step('start', 'done');

  step('report', 'active', 'the first boot loads the container image and can take several minutes');
  const report = await waitForReport(serialPath, { signal });
  if (report.kind !== 'ready') {
    const err = new Error(report.reason === 'report-timeout' ? 'The appliance did not report an address within 25 minutes.' : `The appliance reported a failure: ${report.reason || 'unknown'}.`);
    err.output = fs.existsSync(serialPath) ? fs.readFileSync(serialPath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-12).join('\n') : '';
    throw err;
  }
  step('report', 'done', report.url);

  step('health', 'active');
  const health = await checkHealth(report.url);
  await registry.update(record.id, { lastUrl: report.url, setupCode: report.setup, lastHealth: health });
  if (!health.ok) {
    const err = new Error(`The appliance reported ${report.url} but this computer could not reach it (${health.detail || health.status}). Check that the bridged adapter is on the same network.`);
    throw err;
  }
  step('health', 'done', `healthy ${health.checkedAt}`);
  return { instance: registry.get(record.id), url: report.url, setup: report.setup, seconds: Math.round((Date.now() - started) / 1000) };
}

async function deployDocker({ registry, hypervisor, image, version, name, ip, port, emit = () => {}, run = defaultRun, signal, portFree = async () => true }) {
  const { validatePort, validateIpv4, containerName } = require('./hypervisors.cjs');
  validateName(name); validatePort(port); validateIpv4(ip);
  if (registry.byName(name)) throw new Error(`An instance named ${name} already exists. Pick another name.`);
  if (registry.items.some((i) => i.hypervisor === 'docker' && i.port === port)) throw new Error(`Port ${port} is already used by another instance. Pick another port.`);
  if (!(await portFree(port))) throw new Error(`Port ${port} is already in use on this computer. Pick another port.`);
  const d = drivers.docker;
  const started = Date.now();
  const step = (id, state, detail = '') => emit({ type: 'step', id, state, detail });
  step('appliance', 'active', image);
  await d.pull(hypervisor, { image }, run, (text) => emit({ type: 'output', text }));
  step('appliance', 'done', image);
  if (signal?.aborted) throw new Error('Cancelled before the container was created.');
  step('import', 'active');
  const id = crypto.randomUUID();
  const url = `http://${ip}:${port}/`;
  const { vmRef } = await d.create(hypervisor, { name, image, ip, port, instanceId: id }, run);
  await registry.add({ id, name, hypervisor: 'docker', vmRef, port, ip, version, createdAt: new Date().toISOString(), lastUrl: url, setupCode: null, serialPath: null });
  step('import', 'done', containerName(name));
  step('configure', 'done', `port ${port}, ${ip}`);
  step('start', 'active');
  await d.start(hypervisor, { vmRef }, run);
  step('start', 'done');
  step('report', 'active', 'waiting for the service to answer');
  let health = { ok: false };
  for (let i = 0; i < 120 && !health.ok; i++) {
    if (signal?.aborted) throw new Error('Cancelled while waiting for the service. The container is listed under Instances.');
    health = await checkHealth(url, 3000);
    if (!health.ok) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!health.ok) throw new Error(`The container started but ${url} did not answer within 4 minutes (${health.detail || health.status}).`);
  step('report', 'done', url);
  step('health', 'active');
  await registry.update(id, { lastHealth: health });
  step('health', 'done', `healthy ${health.checkedAt}`);
  return { instance: registry.get(id), url, seconds: Math.round((Date.now() - started) / 1000) };
}

async function status({ registry, hypervisors, run = defaultRun }) {
  const out = [];
  for (const item of registry.items) {
    const hv = hypervisors.find((h) => h.id === item.hypervisor);
    if (!hv) { out.push({ ...item, state: 'unavailable', detail: 'Hypervisor not found on this computer.' }); continue; }
    const driver = drivers[hv.id];
    const exists = await driver.exists(hv, item, run);
    if (!exists) { out.push({ ...item, state: 'missing', detail: 'The virtual machine no longer exists.' }); continue; }
    const running = await driver.running(hv, item, run);
    let health = null;
    if (running && item.lastUrl) health = await checkHealth(item.lastUrl, 3000);
    out.push({ ...item, state: running ? (health?.ok ? 'healthy' : 'starting') : 'stopped', health });
  }
  return out;
}

module.exports = { Registry, STEPS, deploy, deployDocker, status };

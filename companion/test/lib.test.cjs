'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const hv = require('../lib/hypervisors.cjs');
const { parseSerial } = require('../lib/appliance.cjs');
const { Registry, deploy } = require('../lib/instances.cjs');

test('instance names reject shell metacharacters and paths', () => {
  assert.equal(hv.validateName('material-qemu-1'), 'material-qemu-1');
  for (const bad of ['', '-x', 'a b', 'a;b', '..\\x', 'a/b', 'x'.repeat(49), 'a"b']) assert.throws(() => hv.validateName(bad));
});

test('resource limits are enforced', () => {
  assert.doesNotThrow(() => hv.validateResources({ cpus: 4, memoryMb: 8192 }));
  assert.throws(() => hv.validateResources({ cpus: 0, memoryMb: 8192 }));
  assert.throws(() => hv.validateResources({ cpus: 2, memoryMb: 512 }));
});

test('serial report parsing takes the last report and validates fields', () => {
  const text = 'noise\r\nMQ-BOOT version=v1 ip=10.0.0.5\r\nMQ-READY version=v1 url=http://192.168.1.20:8080/ setup=abcdEFGH_1234-xyz\r\n';
  const r = parseSerial(text);
  assert.equal(r.kind, 'ready');
  assert.equal(r.url, 'http://192.168.1.20:8080/');
  assert.equal(r.setup, 'abcdEFGH_1234-xyz');
  assert.equal(parseSerial('MQ-READY url=http://1.2.3.4:8080/ setup=none').setup, null);
  assert.equal(parseSerial('MQ-READY url=javascript:alert(1)').kind, 'failed');
  assert.equal(parseSerial('MQ-FAILED version=v1 reason=health-timeout').reason, 'health-timeout');
  assert.equal(parseSerial('nothing here'), null);
});

test('bridged adapter list parsing', () => {
  const out = 'Name:            Intel(R) Ethernet Connection\nGUID: x\n\nName:            Wi-Fi\nGUID: y\n';
  assert.deepEqual(hv.parseBridgedAdapters(out), ['Intel(R) Ethernet Connection', 'Wi-Fi']);
});

test('vmx editing replaces keys case-insensitively and keeps others', () => {
  const text = 'displayName = "x"\r\nEthernet0.ConnectionType = "nat"\r\nmemsize = "4096"\r\n';
  const out = hv.setVmxKeys(text, { 'ethernet0.connectionType': 'bridged', memsize: '8192' });
  assert.match(out, /displayName = "x"/);
  assert.match(out, /ethernet0\.connectionType = "bridged"/);
  assert.doesNotMatch(out, /"nat"/);
  assert.equal((out.match(/memsize/g) || []).length, 1);
});

test('VirtualBox import and configure pass argument arrays without a shell', async () => {
  const calls = [];
  const run = async (file, args) => { calls.push([file, args]); return { code: 0, stdout: '', stderr: '' }; };
  const h = { id: 'virtualbox', vboxmanage: 'VBoxManage.exe' };
  await hv.drivers.virtualbox.import(h, { ova: 'a.ova', name: 'mq1', folder: 'C:\\vms', cpus: 2, memoryMb: 4096 }, run);
  await hv.drivers.virtualbox.configure(h, { vmRef: 'mq1', adapter: 'Wi-Fi', serialPath: 'C:\\s.log', nested: true }, run);
  assert.deepEqual(calls[0][1].slice(0, 6), ['import', 'a.ova', '--vsys', '0', '--vmname', 'mq1']);
  const cfg = calls[1][1];
  assert.equal(cfg[cfg.indexOf('--bridgeadapter1') + 1], 'Wi-Fi');
  assert.equal(cfg[cfg.indexOf('--uartmode1') + 2], 'C:\\s.log');
  assert.equal(cfg[cfg.indexOf('--nested-hw-virt') + 1], 'on');
});

test('a failing command surfaces its command line, exit code and output', async () => {
  const run = async () => ({ code: 1, stdout: '0%...\n', stderr: 'VBoxManage: error: already exists\n' });
  await assert.rejects(hv.drivers.virtualbox.import({ vboxmanage: 'VBoxManage.exe' }, { ova: 'a.ova', name: 'mq1', folder: 'C:\\v', cpus: 2, memoryMb: 4096 }, run),
    (e) => e.exitCode === 1 && /^VBoxManage\.exe import/.test(e.command) && /already exists/.test(e.output));
});

test('deploy refuses a duplicate name before touching the hypervisor', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqd-'));
  const reg = await new Registry(path.join(dir, 'i.json')).load();
  await reg.add({ id: '1', name: 'mq1' });
  let called = false;
  const run = async () => { called = true; return { code: 0, stdout: '', stderr: '' }; };
  await assert.rejects(deploy({ registry: reg, hypervisor: { id: 'virtualbox', vboxmanage: 'x' }, ovaFile: 'a.ova', version: 'v', name: 'MQ1', cpus: 2, memoryMb: 4096, adapter: 'Wi-Fi', vmRoot: dir, run }), /already exists/);
  assert.equal(called, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('registry persists atomically', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqr-'));
  const file = path.join(dir, 'i.json');
  const reg = await new Registry(file).load();
  await reg.add({ id: 'a', name: 'one' });
  await reg.update('a', { lastUrl: 'http://x/' });
  const again = await new Registry(file).load();
  assert.equal(again.get('a').lastUrl, 'http://x/');
  await again.remove('a');
  assert.equal((await new Registry(file).load()).items.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an unreadable registry is kept aside and replaced by an empty list', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqc-'));
  const file = path.join(dir, 'i.json');
  fs.writeFileSync(file, '{"version":1,"instances":[{not json');
  const reg = await new Registry(file).load();
  assert.equal(reg.items.length, 0);
  assert.ok(reg.recovered && fs.existsSync(reg.recovered.kept));
  assert.equal(fs.existsSync(file), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('serial reports survive the carriage returns a real guest terminal adds', () => {
  // Captured shape from a real VirtualBox boot: each line ends "\r\r\n" and the
  // report shares a line with the login prompt.
  const text = 'Debian GNU/Linux 13 material-qemu ttyS0\n'
    + 'material-qemu login: MQ-BOOT version=v0.1.0-build.8 ip=192.168.50.139 root=63G\r\r\n'
    + '[   35.18] docker0: port 1 entered forwarding state\n'
    + 'MQ-READY version=v0.1.0-build.8 url=http://192.168.50.139:8080/\r\r\n';
  const r = parseSerial(text);
  assert.equal(r.kind, 'ready');
  assert.equal(r.url, 'http://192.168.50.139:8080/');
  assert.equal(r.version, 'v0.1.0-build.8');
  assert.equal(parseSerial('MQ-BOOT version=v1 ip=10.0.0.5\r').ip, '10.0.0.5');
});

test('VMware import skips the manifest check only for a release-verified OVA', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mqv-'));
  const calls = [];
  const run = async (file, args) => {
    calls.push(args);
    const target = path.join(args[args.length - 1], 'vm1');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'vm1.vmx'), '');
    return { code: 0, stdout: '', stderr: '' };
  };
  const h = { id: 'vmware', ovftool: 'ovftool.exe', vmrun: 'vmrun.exe', hostType: 'ws' };
  await hv.drivers.vmware.import(h, { ova: 'a.ova', name: 'vm1', folder: dir, cpus: 2, memoryMb: 4096, verified: true }, run);
  await hv.drivers.vmware.import(h, { ova: 'a.ova', name: 'vm1', folder: dir, cpus: 2, memoryMb: 4096 }, run);
  assert.ok(calls[0].includes('--skipManifestCheck'));
  assert.ok(!calls[1].includes('--skipManifestCheck'));
  fs.rmSync(dir, { recursive: true, force: true });
});

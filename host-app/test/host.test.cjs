'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickLanAddress, findQemu, nextFreePort } = require('../lib/host.cjs');

test('the published address skips virtual, VPN and link-local adapters', () => {
  const ifs = {
    'vEthernet (WSL)': [{ family: 'IPv4', address: '172.20.0.1', internal: false }],
    'VirtualBox Host-Only Network': [{ family: 'IPv4', address: '192.168.56.1', internal: false }],
    'Wi-Fi': [{ family: 'IPv4', address: '192.168.1.40', internal: false }],
    Ethernet: [{ family: 'IPv4', address: '192.168.50.183', internal: false }, { family: 'IPv6', address: 'fe80::1', internal: false }],
    'Loopback Pseudo-Interface 1': [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  };
  assert.equal(pickLanAddress(ifs), '192.168.50.183');
  delete ifs.Ethernet;
  assert.equal(pickLanAddress(ifs), '192.168.1.40');
  assert.equal(pickLanAddress({ x: [{ family: 'IPv4', address: '169.254.3.4', internal: false }] }), null);
});

test('QEMU is found in Program Files or on PATH', () => {
  const at = (p) => p === 'D:\\tools\\qemu\\qemu-system-x86_64.exe';
  assert.deepEqual(findQemu({ PATH: 'C:\\Windows;D:\\tools\\qemu' }, at), { dir: 'D:\\tools\\qemu', exe: 'D:\\tools\\qemu\\qemu-system-x86_64.exe' });
  assert.equal(findQemu({ PATH: 'C:\\Windows' }, () => false), null);
});

test('a busy port moves to the next free one', async () => {
  const busy = new Set([8090, 8091]);
  assert.equal(await nextFreePort(8090, async (p) => !busy.has(p)), 8092);
  assert.equal(await nextFreePort(8090, async () => false, 3), null);
});

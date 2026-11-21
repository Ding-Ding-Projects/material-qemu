'use strict';
// Helpers for the Windows host app: which LAN address to publish, where QEMU
// is, and which port is free. Pure where possible so they can be tested.
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

// Virtual and VPN adapters are skipped so the published address is the one
// other devices on the network can reach.
const VIRTUAL = /vethernet|virtualbox|vmware|vmnet|hyper-v|wsl|docker|loopback|tailscale|zerotier|vpn|bluetooth/i;

function pickLanAddress(interfaces = os.networkInterfaces()) {
  const candidates = [];
  for (const [name, list] of Object.entries(interfaces || {})) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal || a.address.startsWith('169.254.')) continue;
      candidates.push({ name, address: a.address, virtual: VIRTUAL.test(name) });
    }
  }
  const physical = candidates.filter((c) => !c.virtual);
  const prefer = (list) => list.find((c) => /ethernet|^eth|^en/i.test(c.name)) || list.find((c) => /wi-?fi|wlan|wireless/i.test(c.name)) || list[0];
  return (prefer(physical) || prefer(candidates) || null)?.address ?? null;
}

function findQemu(env = process.env, exists = fs.existsSync) {
  const dirs = [
    env.ProgramFiles && path.join(env.ProgramFiles, 'qemu'),
    'C:\\Program Files\\qemu',
    ...(env.PATH || env.Path || '').split(path.delimiter),
  ].filter(Boolean);
  for (const dir of dirs) {
    const exe = path.join(dir, 'qemu-system-x86_64.exe');
    if (exists(exe)) return { dir, exe };
  }
  return null;
}

function portFree(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

async function nextFreePort(start = 8090, check = portFree, tries = 20) {
  for (let p = start; p < start + tries; p++) if (await check(p)) return p;
  return null;
}

module.exports = { pickLanAddress, findQemu, nextFreePort, portFree, VIRTUAL };

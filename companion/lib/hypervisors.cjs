'use strict';
// VirtualBox and VMware Workstation operations. Every command is run with an
// argument array (never a shell string), and every name passed to a
// hypervisor is validated first.
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/;

function validateName(name) {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    throw new Error('Instance names use 1 to 48 letters, digits, dots, dashes or underscores and start with a letter or digit.');
  }
  return name;
}

function validateResources({ cpus, memoryMb }) {
  if (!Number.isInteger(cpus) || cpus < 1 || cpus > 64) throw new Error('CPUs must be a whole number from 1 to 64.');
  if (!Number.isInteger(memoryMb) || memoryMb < 1024 || memoryMb > 262144) throw new Error('Memory must be a whole number of MB from 1024 to 262144.');
}

function defaultRun(file, args, { timeoutMs = 30 * 60 * 1000, onOutput } = {}) {
  return new Promise((resolve) => {
    const child = execFile(file, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: String(stdout), stderr: String(stderr), error: error && typeof error.code !== 'number' ? error.message : null });
    });
    if (onOutput) {
      child.stdout?.on('data', (d) => onOutput(String(d)));
      child.stderr?.on('data', (d) => onOutput(String(d)));
    }
  });
}

class CommandError extends Error {
  constructor(file, args, result) {
    const tail = `${result.stdout}\n${result.stderr}`.trim().split(/\r?\n/).slice(-12).join('\n');
    super(`${path.basename(file)} exited with code ${result.code}`);
    this.command = [path.basename(file), ...args].join(' ');
    this.exitCode = result.code;
    this.output = tail || result.error || '';
  }
}

async function must(run, file, args, options) {
  const result = await run(file, args, options);
  if (result.code !== 0) throw new CommandError(file, args, result);
  return result;
}

function firstExisting(candidates) {
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function programFiles(env = process.env) {
  return [env.ProgramFiles, env['ProgramFiles(x86)'], 'C:\\Program Files', 'C:\\Program Files (x86)'].filter(Boolean);
}

function detectVirtualBox(env = process.env) {
  const roots = [env.VBOX_MSI_INSTALL_PATH, env.VBOX_INSTALL_PATH, ...programFiles(env).map((p) => path.join(p, 'Oracle', 'VirtualBox'))];
  const vboxmanage = firstExisting(roots.filter(Boolean).map((r) => path.join(r, 'VBoxManage.exe')));
  return vboxmanage ? { id: 'virtualbox', name: 'Oracle VirtualBox', vboxmanage } : null;
}

function detectVmware(env = process.env) {
  const roots = programFiles(env).map((p) => path.join(p, 'VMware', 'VMware Workstation'));
  const vmrun = firstExisting(roots.map((r) => path.join(r, 'vmrun.exe')));
  const ovftool = firstExisting(roots.map((r) => path.join(r, 'OVFTool', 'ovftool.exe')));
  if (!vmrun) return null;
  const player = !firstExisting(roots.map((r) => path.join(r, 'vmware.exe')));
  return { id: 'vmware', name: player ? 'VMware Workstation Player' : 'VMware Workstation', vmrun, ovftool, hostType: player ? 'player' : 'ws' };
}

async function describe(run = defaultRun, env = process.env) {
  const out = [];
  const vbox = detectVirtualBox(env);
  if (vbox) {
    const v = await run(vbox.vboxmanage, ['--version'], { timeoutMs: 20000 });
    out.push({ ...vbox, version: v.code === 0 ? v.stdout.trim() : null, ready: v.code === 0, problem: v.code === 0 ? null : 'VBoxManage did not answer.' });
  }
  const vmw = detectVmware(env);
  if (vmw) {
    const problem = vmw.ovftool ? null : 'OVF Tool was not found next to VMware Workstation, so the appliance cannot be imported.';
    out.push({ ...vmw, version: null, ready: !problem, problem });
  }
  const dk = detectDocker(env);
  if (dk) {
    const v = await run(dk.docker, ['version', '--format', '{{.Server.Version}}'], { timeoutMs: 30000 });
    const version = v.code === 0 ? v.stdout.trim() : null;
    out.push({ ...dk, version, ready: Boolean(version), problem: version ? null : 'Docker is installed but its engine is not running. Start Docker Desktop, then refresh.' });
  }
  return out;
}

// ----- VirtualBox -----

function parseBridgedAdapters(text) {
  return text.split(/\r?\n/).filter((l) => /^Name:\s+/.test(l)).map((l) => l.replace(/^Name:\s+/, '').trim()).filter(Boolean);
}

async function virtualBoxAdapters(hv, run = defaultRun) {
  const r = await must(run, hv.vboxmanage, ['list', 'bridgedifs'], { timeoutMs: 30000 });
  return parseBridgedAdapters(r.stdout);
}

function randomMac() {
  const bytes = require('node:crypto').randomBytes(5);
  return '080027' + bytes.subarray(0, 3).toString('hex').toUpperCase();
}

const virtualbox = {
  async import(hv, { ova, name, folder, cpus, memoryMb }, run = defaultRun, onOutput) {
    validateName(name); validateResources({ cpus, memoryMb });
    await must(run, hv.vboxmanage, ['import', ova, '--vsys', '0', '--vmname', name, '--basefolder', folder, '--cpus', String(cpus), '--memory', String(memoryMb)], { onOutput });
    return { vmRef: name };
  },
  async configure(hv, { vmRef, adapter, serialPath, nested }, run = defaultRun) {
    if (!adapter) throw new Error('Choose a network adapter to bridge.');
    const args = ['modifyvm', vmRef, '--nic1', 'bridged', '--bridgeadapter1', adapter, '--macaddress1', randomMac(),
      '--uart1', '0x3F8', '4', '--uartmode1', 'file', serialPath, '--nested-hw-virt', nested ? 'on' : 'off'];
    await must(run, hv.vboxmanage, args, { timeoutMs: 60000 });
  },
  async start(hv, { vmRef }, run = defaultRun) { await must(run, hv.vboxmanage, ['startvm', vmRef, '--type', 'headless'], { timeoutMs: 120000 }); },
  async stop(hv, { vmRef }, run = defaultRun) {
    await must(run, hv.vboxmanage, ['controlvm', vmRef, 'acpipowerbutton'], { timeoutMs: 60000 });
    for (let i = 0; i < 60; i++) {
      if (!(await this.running(hv, { vmRef }, run))) return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    await must(run, hv.vboxmanage, ['controlvm', vmRef, 'poweroff'], { timeoutMs: 60000 });
  },
  async running(hv, { vmRef }, run = defaultRun) {
    const r = await run(hv.vboxmanage, ['showvminfo', vmRef, '--machinereadable'], { timeoutMs: 30000 });
    if (r.code !== 0) return false;
    return /^VMState="running"/m.test(r.stdout);
  },
  async exists(hv, { vmRef }, run = defaultRun) {
    return (await run(hv.vboxmanage, ['showvminfo', vmRef, '--machinereadable'], { timeoutMs: 30000 })).code === 0;
  },
  async remove(hv, { vmRef }, run = defaultRun) {
    if (await this.running(hv, { vmRef }, run)) await must(run, hv.vboxmanage, ['controlvm', vmRef, 'poweroff'], { timeoutMs: 60000 });
    await must(run, hv.vboxmanage, ['unregistervm', vmRef, '--delete'], { timeoutMs: 300000 });
  },
};

// ----- VMware Workstation -----

function setVmxKeys(text, values) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const keys = Object.keys(values).map((k) => k.toLowerCase());
  const kept = lines.filter((l) => !keys.includes(l.split('=')[0].trim().toLowerCase()));
  for (const [k, v] of Object.entries(values)) kept.push(`${k} = "${String(v).replace(/"/g, '')}"`);
  return kept.join('\r\n') + '\r\n';
}

const vmware = {
  async import(hv, { ova, name, folder, cpus, memoryMb }, run = defaultRun, onOutput) {
    validateName(name); validateResources({ cpus, memoryMb });
    if (!hv.ovftool) throw new Error('OVF Tool is required to import the appliance into VMware.');
    await fsp.mkdir(folder, { recursive: true });
    await must(run, hv.ovftool, ['--acceptAllEulas', '--allowExtraConfig', '--noSSLVerify', `--name=${name}`, ova, folder], { onOutput });
    const vmx = path.join(folder, name, `${name}.vmx`);
    if (!fs.existsSync(vmx)) throw new Error(`OVF Tool finished but ${vmx} was not created.`);
    return { vmRef: vmx };
  },
  async configure(hv, { vmRef, serialPath, nested, cpus, memoryMb }) {
    const text = await fsp.readFile(vmRef, 'utf8');
    const updated = setVmxKeys(text, {
      'ethernet0.present': 'TRUE', 'ethernet0.connectionType': 'bridged', 'ethernet0.virtualDev': 'e1000', 'ethernet0.addressType': 'generated',
      'serial0.present': 'TRUE', 'serial0.fileType': 'file', 'serial0.fileName': serialPath, 'serial0.tryNoRxLoss': 'FALSE',
      'vhv.enable': nested ? 'TRUE' : 'FALSE', 'numvcpus': String(cpus), 'memsize': String(memoryMb),
      'tools.syncTime': 'TRUE', 'uuid.action': 'create',
    });
    await fsp.writeFile(vmRef, updated);
  },
  async start(hv, { vmRef }, run = defaultRun) { await must(run, hv.vmrun, ['-T', hv.hostType, 'start', vmRef, 'nogui'], { timeoutMs: 180000 }); },
  async stop(hv, { vmRef }, run = defaultRun) {
    const soft = await run(hv.vmrun, ['-T', hv.hostType, 'stop', vmRef, 'soft'], { timeoutMs: 180000 });
    if (soft.code !== 0) await must(run, hv.vmrun, ['-T', hv.hostType, 'stop', vmRef, 'hard'], { timeoutMs: 120000 });
  },
  async running(hv, { vmRef }, run = defaultRun) {
    const r = await run(hv.vmrun, ['-T', hv.hostType, 'list'], { timeoutMs: 30000 });
    if (r.code !== 0) return false;
    const want = path.resolve(vmRef).toLowerCase();
    return r.stdout.split(/\r?\n/).some((l) => l.trim() && path.resolve(l.trim()).toLowerCase() === want);
  },
  async exists(hv, { vmRef }) { return fs.existsSync(vmRef); },
  async remove(hv, { vmRef }, run = defaultRun) {
    if (await this.running(hv, { vmRef }, run)) await must(run, hv.vmrun, ['-T', hv.hostType, 'stop', vmRef, 'hard'], { timeoutMs: 120000 });
    await must(run, hv.vmrun, ['-T', hv.hostType, 'deleteVM', vmRef], { timeoutMs: 300000 });
  },
};

// ----- Docker on this computer -----

function detectDocker(env = process.env) {
  const pathDirs = String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  const candidates = [...pathDirs.map((d) => path.join(d, 'docker.exe')), ...programFiles(env).map((p) => path.join(p, 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'))];
  if (env.LOCALAPPDATA) candidates.push(path.join(env.LOCALAPPDATA, 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'));
  const docker = firstExisting(candidates);
  return docker ? { id: 'docker', name: 'Docker on this computer', docker } : null;
}

const CONTAINER_PREFIX = 'material-qemu-';
const containerName = (name) => `${CONTAINER_PREFIX}${validateName(name)}`;

function validatePort(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('The port must be a whole number from 1024 to 65535.');
  return port;
}

function validateIpv4(ip) {
  if (typeof ip !== 'string' || !/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(ip)) throw new Error('Choose this computer\'s LAN address.');
  return ip;
}

const docker = {
  async pull(hv, { image }, run = defaultRun, onOutput) {
    if (!/^ghcr\.io\/[a-z0-9-]+\/material-qemu:[A-Za-z0-9._-]+$/.test(image)) throw new Error('Unexpected image reference.');
    await must(run, hv.docker, ['pull', image], { onOutput });
  },
  async create(hv, { name, image, ip, port, instanceId }, run = defaultRun) {
    const cname = containerName(name); validateIpv4(ip); validatePort(port);
    await must(run, hv.docker, ['create', '--name', cname, '--label', `io.github.material-qemu.deploy=${instanceId}`,
      '-p', `${port}:8080`, '-e', `PUBLIC_ORIGIN=http://${ip}:${port}`, '-v', `${cname}-data:/data`,
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--restart', 'unless-stopped', '--stop-timeout', '30', image], { timeoutMs: 120000 });
    return { vmRef: cname };
  },
  async start(hv, { vmRef }, run = defaultRun) { await must(run, hv.docker, ['start', vmRef], { timeoutMs: 120000 }); },
  async stop(hv, { vmRef }, run = defaultRun) { await must(run, hv.docker, ['stop', '-t', '30', vmRef], { timeoutMs: 120000 }); },
  async running(hv, { vmRef }, run = defaultRun) {
    const r = await run(hv.docker, ['container', 'inspect', '-f', '{{.State.Running}}', vmRef], { timeoutMs: 30000 });
    return r.code === 0 && r.stdout.trim() === 'true';
  },
  async exists(hv, { vmRef }, run = defaultRun) { return (await run(hv.docker, ['container', 'inspect', vmRef], { timeoutMs: 30000 })).code === 0; },
  async setupCode(hv, { vmRef }, run = defaultRun) {
    const r = await run(hv.docker, ['exec', vmRef, 'cat', '/data/setup-code'], { timeoutMs: 30000 });
    const code = r.code === 0 ? r.stdout.trim() : '';
    return /^[A-Za-z0-9_-]{8,128}$/.test(code) ? code : null;
  },
  async remove(hv, { vmRef }, run = defaultRun) {
    if (!vmRef.startsWith(CONTAINER_PREFIX)) throw new Error('Refusing to remove a container this app did not name.');
    await must(run, hv.docker, ['rm', '-f', vmRef], { timeoutMs: 120000 });
    const v = await run(hv.docker, ['volume', 'rm', `${vmRef}-data`], { timeoutMs: 120000 });
    if (v.code !== 0 && !/no such volume/i.test(v.stderr)) throw new CommandError(hv.docker, ['volume', 'rm', `${vmRef}-data`], v);
  },
};

const drivers = { virtualbox, vmware, docker };

function lanAddresses(interfaces = require('node:os').networkInterfaces()) {
  const virtual = /vEthernet|WSL|VirtualBox|VMware|Hyper-V|Loopback|Docker|Tailscale|ZeroTier|vpn/i;
  const out = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal || a.address.startsWith('169.254.')) continue;
      out.push({ name, address: a.address, preferred: !virtual.test(name) });
    }
  }
  return out.sort((x, y) => Number(y.preferred) - Number(x.preferred));
}

module.exports = {
  NAME_PATTERN, validateName, validateResources, validatePort, validateIpv4, defaultRun, CommandError, describe,
  detectVirtualBox, detectVmware, detectDocker, parseBridgedAdapters, virtualBoxAdapters, setVmxKeys, lanAddresses, containerName, drivers,
};

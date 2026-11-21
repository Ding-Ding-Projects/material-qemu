// Measures each running machine's QEMU process: CPU time and resident memory.
// Linux (the container and the appliance) reads /proc; Windows asks PowerShell
// for the QEMU processes. CPU is reported as a share of the machine's own vCPUs,
// so 100% means every vCPU busy. Other platforms report nothing, never a guess.
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";

const CLOCK_TICKS = 100;
const PAGE = 4096;

// /proc/<pid>/stat: fields after the ")" of the command name; utime and stime
// are the 12th and 13th of those (14th and 15th overall).
export function parseProcStat(text) {
  const rest = String(text).slice(String(text).lastIndexOf(")") + 2).split(" ");
  const utime = Number(rest[11]), stime = Number(rest[12]);
  return Number.isFinite(utime) && Number.isFinite(stime) ? (utime + stime) / CLOCK_TICKS : null;
}
export function parseProcStatm(text) {
  const resident = Number(String(text).trim().split(/\s+/)[1]);
  return Number.isFinite(resident) ? resident * PAGE : null;
}
// PowerShell Get-Process output: one object or an array of { Id, cpu, WorkingSet64 }.
export function parseProcessJson(text) {
  const out = new Map();
  let data;
  try { data = JSON.parse(String(text).trim() || "[]"); } catch { return out; }
  for (const p of Array.isArray(data) ? data : [data]) {
    const pid = Number(p?.Id), cpu = Number(p?.cpu), memory = Number(p?.WorkingSet64);
    if (Number.isInteger(pid) && Number.isFinite(cpu) && Number.isFinite(memory)) out.set(pid, { cpuSeconds: cpu, memoryBytes: memory });
  }
  return out;
}

async function readLinux(pids) {
  const out = new Map();
  for (const pid of pids) {
    try {
      const [stat, statm] = await Promise.all([readFile(`/proc/${pid}/stat`, "utf8"), readFile(`/proc/${pid}/statm`, "utf8")]);
      const cpuSeconds = parseProcStat(stat), memoryBytes = parseProcStatm(statm);
      if (cpuSeconds !== null && memoryBytes !== null) out.set(pid, { cpuSeconds, memoryBytes });
    } catch { /* process ended between listing and reading */ }
  }
  return out;
}
// One Get-Process query for the QEMU processes (tasklist /V is far too slow:
// it looks up every window title).
const PS_QUERY = "Get-Process -Name 'qemu-system*' -ErrorAction SilentlyContinue | Select-Object Id, @{n='cpu';e={$_.TotalProcessorTime.TotalSeconds}}, WorkingSet64 | ConvertTo-Json -Compress";
function readWindows(pids) {
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PS_QUERY], { windowsHide: true, timeout: 8000 }, (error, stdout) => {
      if (error) return resolve(new Map());
      const all = parseProcessJson(stdout);
      resolve(new Map([...all].filter(([pid]) => pids.includes(pid))));
    });
  });
}

export function cpuPercent(previous, current, vcpus) {
  if (!previous || !current) return null;
  const wall = (current.at - previous.at) / 1000;
  const used = current.cpuSeconds - previous.cpuSeconds;
  if (wall <= 0 || used < 0) return null;
  return Math.max(0, Math.min(100, (100 * used) / wall / Math.max(1, vcpus)));
}

export class GuestUsage {
  constructor({ platform = process.platform, read } = {}) {
    this.supported = platform === "linux" || platform === "win32";
    this.read = read || (platform === "linux" ? readLinux : platform === "win32" ? readWindows : async () => new Map());
    this.last = new Map();
    this.usage = new Map();
    this.history = new Map();
  }
  // running: [{ id, pid, cpus }]
  async sample(running, now = Date.now()) {
    if (!this.supported) return;
    const live = running.filter((m) => Number.isInteger(m.pid));
    const readings = live.length ? await this.read(live.map((m) => m.pid)) : new Map();
    const seen = new Set();
    for (const m of live) {
      const r = readings.get(m.pid);
      if (!r) continue;
      seen.add(m.id);
      const current = { ...r, at: now, pid: m.pid };
      const previous = this.last.get(m.id);
      const cpu = previous?.pid === m.pid ? cpuPercent(previous, current, m.cpus) : null;
      this.last.set(m.id, current);
      const value = { cpuPercent: cpu === null ? null : Math.round(cpu * 10) / 10, memoryBytes: r.memoryBytes, at: new Date(now).toISOString() };
      this.usage.set(m.id, value);
      if (value.cpuPercent !== null) this.history.set(m.id, [...(this.history.get(m.id) || []), value.cpuPercent].slice(-30));
    }
    for (const id of [...this.usage.keys()]) if (!seen.has(id)) { this.usage.delete(id); this.last.delete(id); this.history.delete(id); }
  }
  get(id) {
    const u = this.usage.get(id);
    return u ? { ...u, cpuHistory: this.history.get(id) || [] } : null;
  }
}

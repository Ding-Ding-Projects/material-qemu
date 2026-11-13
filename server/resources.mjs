import os from "node:os";
import { readFile } from "node:fs/promises";
export class MetricSampler {
  constructor(read = hostMetrics, limit = 90) {
    this.read = read;
    this.limit = limit;
    this.history = [];
    this.active = false;
    this.error = null;
  }
  async sample() {
    if (this.active) return;
    this.active = true;
    try {
      const value = await this.read();
      this.history.push(value);
      this.history = this.history.slice(-this.limit);
      this.error = null;
      return value;
    } catch (error) {
      this.error = "Host sampling is temporarily unavailable.";
    } finally {
      this.active = false;
    }
  }
  async start() {
    await this.sample();
    this.timer = setInterval(() => this.sample(), 2000);
    this.timer.unref();
    return this;
  }
  stop() {
    clearInterval(this.timer);
  }
  get latest() {
    return (
      this.history.at(-1) || {
        cpuPercent: null,
        cpuCount: null,
        memoryTotal: null,
        memoryUsed: null,
        uptime: 0,
        platform: "unavailable",
        arch: "unavailable",
        sampledAt: null,
        diskIO: null,
        networkIO: null,
      }
    );
  }
}
let previousCpu;
export async function memoryLimit() {
  let limit = os.totalmem();
  for (const file of [
    "/sys/fs/cgroup/memory.max",
    "/sys/fs/cgroup/memory/memory.limit_in_bytes",
  ]) {
    try {
      const value = Number((await readFile(file, "utf8")).trim());
      if (Number.isFinite(value) && value > 0) limit = Math.min(limit, value);
    } catch {}
  }
  return limit;
}
export async function hostMetrics() {
  const cpus = os.cpus();
  const total = cpus.reduce(
    (sum, c) => sum + Object.values(c.times).reduce((a, b) => a + b, 0),
    0,
  );
  const idle = cpus.reduce((sum, c) => sum + c.times.idle, 0);
  const cpuPercent =
    previousCpu && total > previousCpu.total
      ? Math.round(
          100 * (1 - (idle - previousCpu.idle) / (total - previousCpu.total)),
        )
      : null;
  previousCpu = { total, idle };
  const memoryTotal = await memoryLimit();
  let memoryUsed = os.totalmem() - os.freemem();
  let memoryScope = "host";
  try {
    memoryUsed = Number(
      (await readFile("/sys/fs/cgroup/memory.current", "utf8")).trim(),
    );
    memoryScope = "container";
  } catch {}
  return {
    cpuPercent,
    cpuCount: cpus.length,
    memoryTotal,
    memoryUsed: Math.min(memoryTotal, memoryUsed),
    memoryScope,
    cpuScope: "host-visible logical CPU counters",
    uptime: os.uptime(),
    platform: os.platform(),
    arch: os.arch(),
    sampledAt: new Date().toISOString(),
    diskIO: null,
    networkIO: null,
  };
}

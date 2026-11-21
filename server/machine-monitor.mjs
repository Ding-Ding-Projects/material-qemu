// Read-only views into a machine: a fixed list of QEMU monitor queries and the
// tail of its logs. The browser picks a query by name from this list; it never
// sends a monitor command, so nothing here can change the machine.
import { open, stat } from "node:fs/promises";
import path from "node:path";

export const MONITOR_QUERIES = Object.freeze({
  status: "query-status",
  version: "query-version",
  cpus: "query-cpus-fast",
  memory: "query-memory-size-summary",
  balloon: "query-balloon",
  block: "query-block",
  blockstats: "query-blockstats",
  chardev: "query-chardev",
  vnc: "query-vnc",
  mice: "query-mice",
  kvm: "query-kvm",
  iothreads: "query-iothreads",
});

export async function runMonitorQuery(qemu, machine, name) {
  if (!Object.hasOwn(MONITOR_QUERIES, name)) throw new Error("Choose a listed monitor query.");
  if (!qemu.running.has(machine.id)) throw new Error("Machine is not running.");
  return qemu.command(machine.id, MONITOR_QUERIES[name], undefined, 3000);
}

export const LOG_TAIL_BYTES = 64 * 1024;

async function tail(file, bytes = LOG_TAIL_BYTES) {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return null;
  const start = Math.max(0, info.size - bytes);
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(info.size - start);
    await handle.read(buffer, 0, buffer.length, start);
    return { text: buffer.toString("utf8"), size: info.size, cut: start > 0, modified: info.mtime.toISOString() };
  } finally {
    await handle.close();
  }
}

// QEMU's own error output (kept in memory, last 3,000 characters) and the
// serial console log when the machine has serial logging on.
export async function machineLog(qemu, machine) {
  const running = qemu.running.get(machine.id);
  const qemuOutput = running?.error || qemu.lastErrors.get(machine.id) || "";
  const serial = machine.serial ? await tail(path.join(qemu.runtimeDirectory(machine.id), "serial.log")) : null;
  return { running: Boolean(running), qemuOutput, serialEnabled: Boolean(machine.serial), serial };
}

// Save a running machine's whole state (memory, devices, CPU) to a file and
// resume it later exactly where it left off. QEMU streams the state over a
// local TCP socket in both directions, which works on Windows as well as
// Linux (QEMU's file: transport does not work on Windows).
//
// While a saved state exists the machine's disks must not change, or the
// restored memory would no longer match them: a normal start, a disk resize
// and a snapshot restore are refused until the state is resumed or discarded.
// The state also records a fingerprint of the hardware, and resuming after
// the hardware changed is refused.
import net from "node:net";
import path from "node:path";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, rename, rm, stat } from "node:fs/promises";
import { launchPlan } from "./launch-plan.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const stateFiles = (qemu, id) => {
  const dir = qemu.runtimeDirectory(id);
  return { data: path.join(dir, "saved-state.bin"), meta: path.join(dir, "saved-state.json"), partial: path.join(dir, "saved-state.partial") };
};

// A fingerprint of what QEMU is started with (placeholders for paths and
// ports), so a change to the hardware is noticed before a resume.
export function hardwareFingerprint(machine) {
  const keep = { ...machine, name: "", notes: "", tags: [], folder: "", favourite: false, autostart: false };
  // Disk sizes are not in QEMU's arguments, so they are added on their own.
  const sizes = (machine.disks || []).map((d) => [d.id ?? d.name, Number(d.sizeGiB)]);
  return createHash("sha256").update(JSON.stringify([launchPlan(keep).args, sizes])).digest("hex");
}

export async function savedState(qemu, id) {
  try {
    const meta = JSON.parse(await readFile(stateFiles(qemu, id).meta, "utf8"));
    await stat(stateFiles(qemu, id).data);
    return meta;
  } catch {
    return null;
  }
}

export async function refuseWhileSaved(qemu, id, what) {
  if (await savedState(qemu, id)) throw new Error(`This machine has a saved state. Resume or discard it before ${what}.`);
}

async function waitForMigration(qemu, id, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const m = await qemu.command(id, "query-migrate");
    if (m.status === "completed") return m;
    if (["failed", "cancelled"].includes(m.status)) throw new Error(`QEMU could not transfer the state: ${m["error-desc"] || m.status}.`);
    await sleep(250);
  }
  throw new Error("Transferring the state took longer than allowed.");
}

export async function saveState(qemu, machine, { timeoutMs = 30 * 60 * 1000 } = {}) {
  if (!qemu.running.has(machine.id)) throw new Error("Machine is not running.");
  const files = stateFiles(qemu, machine.id);
  const status = await qemu.command(machine.id, "query-status");
  const wasRunning = Boolean(status.running);
  if (wasRunning) await qemu.command(machine.id, "stop");
  await rm(files.partial, { force: true });
  let server;
  const received = new Promise((resolve, reject) => {
    server = net.createServer((socket) => {
      server.close();
      const out = createWriteStream(files.partial, { mode: 0o600 });
      out.on("error", reject);
      socket.on("data", (chunk) => out.write(chunk));
      socket.on("error", () => {});
      socket.on("close", () => out.end(resolve));
    });
    server.on("error", reject);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await qemu.command(machine.id, "migrate", { uri: `tcp:127.0.0.1:${server.address().port}` });
    await waitForMigration(qemu, machine.id, timeoutMs);
  } catch (error) {
    server.close();
    await rm(files.partial, { force: true });
    if (wasRunning) await qemu.command(machine.id, "cont").catch(() => {});
    throw error;
  }
  // "completed" means QEMU has sent every byte, but it keeps the socket open
  // until it exits, so the machine is stopped before the file is closed.
  await qemu.action(machine.id, "stop");
  try {
    await Promise.race([received, sleep(30000).then(() => { throw new Error("The saved state did not finish writing."); })]);
  } catch (error) {
    await rm(files.partial, { force: true });
    throw error;
  }
  const { size } = await stat(files.partial);
  await rename(files.partial, files.data);
  const meta = { savedAt: new Date().toISOString(), bytes: size, wasRunning, hardware: hardwareFingerprint(machine) };
  await writeFile(files.meta, JSON.stringify(meta, null, 2), { mode: 0o600 });
  return meta;
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
  });

export async function resumeState(qemu, machine, { timeoutMs = 30 * 60 * 1000 } = {}) {
  const meta = await savedState(qemu, machine.id);
  if (!meta) throw new Error("This machine has no saved state.");
  if (meta.hardware !== hardwareFingerprint(machine)) throw new Error("The hardware changed since the state was saved. Discard the saved state to start normally.");
  const files = stateFiles(qemu, machine.id);
  const incomingPort = await freePort();
  await qemu.start(machine, { incomingPort });
  try {
    await new Promise((resolve, reject) => {
      const socket = net.connect(incomingPort, "127.0.0.1");
      socket.on("error", () => {});
      socket.on("connect", () => {
        const input = createReadStream(files.data);
        input.on("error", reject);
        input.pipe(socket);
        socket.on("finish", resolve);
      });
      setTimeout(() => reject(new Error("QEMU did not accept the saved state.")), 15000);
    });
    await waitForMigration(qemu, machine.id, timeoutMs);
    if (meta.wasRunning) await qemu.command(machine.id, "cont");
  } catch (error) {
    await qemu.action(machine.id, "stop").catch(() => {});
    throw error;
  }
  await discardState(qemu, machine.id);
  return { resumed: true, wasRunning: meta.wasRunning };
}

export async function discardState(qemu, id) {
  const files = stateFiles(qemu, id);
  await Promise.all([files.data, files.meta, files.partial].map((f) => rm(f, { force: true })));
  return { discarded: true };
}

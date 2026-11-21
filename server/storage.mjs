import path from "node:path";
import { randomUUID } from "node:crypto";
import { readdir, rename, stat, statfs, unlink } from "node:fs/promises";
import { containedFile } from "./qemu.mjs";
import {
  ISO_NAME,
  MAX_DISK_GIB,
  MAX_DISKS,
  diskFileName,
  generateMac,
  migrateMachine,
  validateMachine,
} from "./machine-config.mjs";
import { imageInfo, qemuImg, snapshotsFromInfo } from "./disk-tools.mjs";
import { event } from "./store.mjs";
import { requireFolder } from "./organization.mjs";

const GIB = 1024 ** 3;
const disksDirectory = (qemu) => path.join(qemu.directory, "disks");
const upgrade = (machine) => Object.assign(machine, validateMachine(machine));
const quiet = (file) => unlink(file).catch(() => {});

export async function storageReport(store, qemu) {
  const entries = [];
  for (const raw of store.state.machines) {
    const machine = migrateMachine(raw);
    for (const disk of machine.disks)
      entries.push({ machine: raw, disk });
  }
  const disks = [];
  for (let i = 0; i < entries.length; i += 8)
    disks.push(
      ...(await Promise.all(
        entries.slice(i, i + 8).map(async ({ machine, disk }) => {
          const file = path.join(
            disksDirectory(qemu),
            diskFileName(machine.id, disk),
          );
          const row = {
            machineId: machine.id,
            machineName: machine.name,
            disk,
            actualBytes: null,
            virtualBytes: null,
            snapshots: 0,
          };
          try {
            const info = await imageInfo(file, { forceShare: true });
            row.actualBytes = info["actual-size"] ?? null;
            row.virtualBytes = info["virtual-size"] ?? null;
            row.snapshots = snapshotsFromInfo(info).length;
          } catch {
            /* A missing or unreadable file is reported with null sizes. */
          }
          return row;
        }),
      )),
    );
  const media = path.join(qemu.directory, "media");
  const isos = [];
  for (const name of await readdir(media)) {
    if (!ISO_NAME.test(name)) continue;
    const info = await stat(path.join(media, name)).catch(() => null);
    if (!info?.isFile()) continue;
    isos.push({
      name,
      bytes: info.size,
      attachedTo: [...store.state.machines, ...(store.state.removedMachines || [])]
        .filter((m) => migrateMachine(m).cdroms.includes(name))
        .map((m) => m.id),
    });
  }
  let free = null,
    total = null;
  try {
    const fs = await statfs(qemu.directory);
    free = fs.bavail * fs.bsize;
    total = fs.blocks * fs.bsize;
  } catch {
    /* Free space is unavailable on this platform. */
  }
  return { disks, isos, free, total };
}
export async function resizeDisk(store, qemu, { machineId, diskId, sizeGiB }) {
  const machine = store.state.machines.find((m) => m.id === machineId);
  if (!machine) throw new Error("Machine not found.");
  if (qemu.status(machineId).state !== "stopped")
    throw new Error("Stop the machine before resizing a disk.");
  const size = Number(sizeGiB);
  if (!Number.isInteger(size) || size < 1 || size > MAX_DISK_GIB)
    throw new Error(`Disk capacity must be 1–${MAX_DISK_GIB} GiB.`);
  const disk = migrateMachine(machine).disks.find((d) => d.id === diskId);
  if (!disk) throw new Error("Disk not found.");
  const file = await containedFile(
    disksDirectory(qemu),
    diskFileName(machineId, disk),
  );
  const info = await imageInfo(file);
  if (size * GIB <= info["virtual-size"])
    throw new Error("Disks can only grow. Choose a larger capacity.");
  await qemuImg(["resize", "-f", disk.format, file, `${size}G`]);
  await store.transaction((s) => {
    const target = s.machines.find((m) => m.id === machineId);
    upgrade(target);
    target.disks.find((d) => d.id === diskId).sizeGiB = size;
    target.diskGiB = target.disks[0].sizeGiB;
    event(s, `${target.name}: disk ${disk.name} grown to ${size} GiB.`);
  });
  return { resized: true, machineId, diskId, sizeGiB: size };
}
// Full copy with `qemu-img convert`; the clone never depends on the original.
export async function cloneMachine(store, qemu, machine, name) {
  if (qemu.status(machine.id).state !== "stopped")
    throw new Error("Stop the machine before cloning it.");
  if (store.state.machines.length >= 100)
    throw new Error("Machine limit reached.");
  const source = migrateMachine(machine);
  const id = randomUUID();
  const disks = source.disks.map((d) => ({ ...d, format: "qcow2" }));
  const candidate = {
    ...source,
    id,
    name,
    disks,
    network: { ...source.network, mac: generateMac() },
    favourite: false,
    autostart: false,
  };
  const config = validateMachine(candidate);
  const written = [];
  try {
    for (const [i, disk] of source.disks.entries()) {
      const from = await containedFile(
        disksDirectory(qemu),
        diskFileName(machine.id, disk),
      );
      const to = path.join(
        disksDirectory(qemu),
        diskFileName(id, config.disks[i]),
      );
      written.push(to);
      await qemuImg(
        ["convert", "-f", disk.format, "-O", "qcow2", from, to],
        3600000,
      );
    }
    const clone = { ...config, id, createdAt: new Date().toISOString() };
    await store.transaction((s) => {
      requireFolder(s, clone.folder);
      s.machines.push(clone);
      event(s, `Cloned ${machine.name} as ${clone.name}.`);
    });
    return clone;
  } catch (error) {
    await Promise.all(written.map(quiet));
    throw error;
  }
}
export async function deleteIso(store, qemu, name) {
  if (typeof name !== "string" || !ISO_NAME.test(name))
    throw new Error("Select an ISO from the managed media directory.");
  const file = await containedFile(path.join(qemu.directory, "media"), name);
  const holders = [
    ...store.state.machines,
    ...(store.state.removedMachines || []),
  ].filter((m) => migrateMachine(m).cdroms.includes(name));
  if (holders.length)
    throw new Error(
      `This ISO is attached to ${holders.map((m) => m.name).join(", ")}. Detach it first.`,
    );
  await unlink(file);
  await store.transaction((s) => event(s, `Deleted installation media ${name}.`));
  return { deleted: true, name };
}
// Reject images whose metadata points at other host files.
export function assertSelfContained(info, file) {
  if (info["backing-filename"] || info["full-backing-filename"])
    throw new Error("Images with a backing file cannot be imported.");
  const data = info["format-specific"]?.data || {};
  if (data["data-file"])
    throw new Error("Images with an external data file cannot be imported.");
  for (const extent of data.extents || [])
    if (path.resolve(extent.filename) !== path.resolve(file))
      throw new Error("Images that reference other files cannot be imported.");
}
// Detect the real format (never the extension), then place a qcow2 disk.
export async function convertImported(temporary, destination, formats) {
  const probed = await imageInfo(temporary);
  if (!formats.includes(probed.format))
    throw new Error(`The ${probed.format} format cannot be imported.`);
  const info = await imageInfo(temporary, { format: probed.format });
  assertSelfContained(info, temporary);
  const sizeGiB = Math.max(1, Math.ceil(info["virtual-size"] / GIB));
  if (sizeGiB > MAX_DISK_GIB)
    throw new Error(`Imported disks are limited to ${MAX_DISK_GIB} GiB.`);
  if (probed.format === "qcow2") await rename(temporary, destination);
  else {
    await qemuImg(
      ["convert", "-f", probed.format, "-O", "qcow2", temporary, destination],
      3600000,
    );
    await quiet(temporary);
  }
  return { sourceFormat: probed.format, sizeGiB };
}
export async function nextDiskId(machine) {
  const used = new Set(migrateMachine(machine).disks.map((d) => d.id));
  if (used.size >= MAX_DISKS)
    throw new Error(`A machine can have at most ${MAX_DISKS} disks.`);
  let n = 0;
  while (used.has(`disk${n}`)) n++;
  return `disk${n}`;
}

import path from "node:path";
import { randomUUID } from "node:crypto";
import { open, statfs, unlink } from "node:fs/promises";
import { IMPORT_FORMATS } from "./disk-tools.mjs";
import {
  diskFileName,
  migrateMachine,
  validateMachine,
} from "./machine-config.mjs";
import { convertImported, nextDiskId } from "./storage.mjs";
import { event } from "./store.mjs";
import { requireFolder } from "./organization.mjs";

export const MAX_IMPORT_BYTES = 64 * 1024 ** 3;
// Stream an upload to a private temporary file with a hard size limit.
export async function receiveToFile(request, temporary, maxBytes) {
  const declared = request.headers["content-length"];
  if (
    declared !== undefined &&
    (!/^[0-9]+$/.test(declared) ||
      Number(declared) < 1 ||
      Number(declared) > maxBytes)
  )
    throw new Error(`Disk import must contain 1–${maxBytes} bytes.`);
  const file = await open(temporary, "wx", 0o600);
  let size = 0;
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maxBytes)
        throw new Error(`Disk image exceeds the ${maxBytes}-byte limit.`);
      let offset = 0;
      while (offset < chunk.length) {
        const result = await file.write(chunk, offset, chunk.length - offset);
        offset += result.bytesWritten;
      }
    }
    if (!size || (declared !== undefined && Number(declared) !== size))
      throw new Error("Upload length does not match the received file.");
    await file.sync();
    return size;
  } finally {
    await file.close().catch(() => {});
  }
}
// Import an uploaded disk image into a new stopped machine or as an extra
// disk on a stopped machine. Parameters come from the query string.
export async function importDisk({ request, params, store, qemu }) {
  const mode = params.get("mode") || "machine";
  if (!["machine", "disk"].includes(mode))
    throw new Error("Import as a new machine or as an extra disk.");
  const name = String(params.get("name") || "").trim();
  let target = null;
  if (mode === "disk") {
    target = store.state.machines.find((m) => m.id === params.get("machineId"));
    if (!target) throw new Error("Machine not found.");
    if (qemu.status(target.id).state !== "stopped")
      throw new Error("Stop the machine before adding a disk.");
    await nextDiskId(target);
  } else {
    const arch = params.get("arch") || "x86_64";
    if (!qemu.capabilities[arch]?.available)
      throw new Error("This architecture is unavailable on this host.");
    if (store.state.machines.length >= 100)
      throw new Error("Machine limit reached.");
    if (!name) throw new Error("Name the new machine.");
  }
  const declared = Number(request.headers["content-length"] || 0);
  try {
    const fs = await statfs(qemu.directory);
    if (declared && declared * 2 > fs.bavail * fs.bsize)
      throw new Error("There is not enough free storage for this import.");
  } catch (error) {
    if (/free storage/.test(error.message)) throw error;
  }
  const temporary = path.join(qemu.directory, "imports", `.upload-${randomUUID()}.part`);
  const diskDirectory = path.join(qemu.directory, "disks");
  let destination = "";
  try {
    await receiveToFile(request, temporary, MAX_IMPORT_BYTES);
    const id = mode === "machine" ? randomUUID() : target.id;
    const diskId = mode === "machine" ? "disk0" : await nextDiskId(target);
    const disk = {
      id: diskId,
      name: String(params.get("diskName") || name || "Imported disk").slice(0, 80),
      sizeGiB: 1,
      bus: params.get("bus") || "virtio",
      format: "qcow2",
      cache: "writeback",
      discard: false,
    };
    destination = path.join(diskDirectory, diskFileName(id, disk));
    const result = await convertImported(temporary, destination, IMPORT_FORMATS);
    disk.sizeGiB = result.sizeGiB;
    if (mode === "machine") {
      const config = validateMachine(
        {
          name,
          arch: params.get("arch") || "x86_64",
          memory: Number(params.get("memory") || 2048),
          cpus: Number(params.get("cpus") || 2),
          disks: [disk],
          cdroms: [],
          network: { mode: "user" },
        },
        qemu.capabilities,
        qemu.host,
      );
      const machine = { ...config, id, createdAt: new Date().toISOString() };
      await store.transaction((s) => {
        requireFolder(s, machine.folder);
        s.machines.push(machine);
        event(s, `Imported ${name} from a ${result.sourceFormat} image.`);
      });
      return { ...result, machine };
    }
    await store.transaction((s) => {
      const m = s.machines.find((value) => value.id === id);
      Object.assign(m, validateMachine({ ...migrateMachine(m), disks: [...migrateMachine(m).disks, disk] }));
      event(s, `${m.name}: imported disk ${disk.name} (${result.sourceFormat}).`);
    });
    return { ...result, machineId: id, disk };
  } catch (error) {
    if (destination) await unlink(destination).catch(() => {});
    throw error;
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

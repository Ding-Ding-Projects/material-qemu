import path from "node:path";
import { containedFile } from "./qemu.mjs";
import { diskFileName } from "./machine-config.mjs";
import {
  checkSnapshotName,
  imageInfo,
  parseHmpSnapshots,
  qemuImg,
  snapshotsFromInfo,
} from "./disk-tools.mjs";

const HMP_FAILURE =
  /error|fail|cannot|can't|not found|unable|invalid|does not|doesn't|no such/i;
async function qcow2Files(qemu, machine) {
  if (machine.disks.some((d) => d.format !== "qcow2"))
    throw new Error(
      "Snapshots need every disk of the machine to be qcow2. Raw disks do not support snapshots.",
    );
  const directory = path.join(qemu.directory, "disks");
  return Promise.all(
    machine.disks.map((d) =>
      containedFile(directory, diskFileName(machine.id, d)),
    ),
  );
}
async function monitor(qemu, machine, line) {
  const text = await qemu.command(
    machine.id,
    "human-monitor-command",
    { "command-line": line },
    120000,
  );
  if (typeof text === "string" && text.trim() && HMP_FAILURE.test(text))
    throw new Error(text.trim().slice(0, 400));
  return text;
}
const running = (qemu, machine) => qemu.status(machine.id).state !== "stopped";

export async function listSnapshots(qemu, machine) {
  const files = await qcow2Files(qemu, machine);
  if (running(qemu, machine)) {
    const text = await qemu.command(
      machine.id,
      "human-monitor-command",
      { "command-line": "info snapshots" },
      15000,
    );
    return { live: true, snapshots: parseHmpSnapshots(text) };
  }
  // `qemu-img info` reports the internal snapshots of an image as JSON.
  const info = await imageInfo(files[0]);
  return { live: false, snapshots: snapshotsFromInfo(info) };
}
export async function createSnapshot(qemu, machine, name) {
  checkSnapshotName(name);
  const files = await qcow2Files(qemu, machine);
  if (running(qemu, machine)) return void (await monitor(qemu, machine, `savevm ${name}`));
  const done = [];
  try {
    for (const file of files) {
      await qemuImg(["snapshot", "-c", name, file]);
      done.push(file);
    }
  } catch (error) {
    for (const file of done)
      await qemuImg(["snapshot", "-d", name, file]).catch(() => {});
    throw error;
  }
}
export async function restoreSnapshot(qemu, machine, name) {
  checkSnapshotName(name);
  const files = await qcow2Files(qemu, machine);
  if (running(qemu, machine)) return void (await monitor(qemu, machine, `loadvm ${name}`));
  for (const file of files) await qemuImg(["snapshot", "-a", name, file]);
}
export async function deleteSnapshot(qemu, machine, name) {
  checkSnapshotName(name);
  const files = await qcow2Files(qemu, machine);
  if (running(qemu, machine)) return void (await monitor(qemu, machine, `delvm ${name}`));
  for (const file of files) await qemuImg(["snapshot", "-d", name, file]);
}

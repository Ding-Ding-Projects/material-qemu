import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { Qemu, validateMachine } from "../server/qemu.mjs";
import { Store } from "../server/store.mjs";
import { checkSnapshotName, parseHmpSnapshots, snapshotsFromInfo } from "../server/disk-tools.mjs";
import { checkLiveAction, performLiveAction, KEY_SEQUENCES } from "../server/live-actions.mjs";
import {
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  restoreSnapshot,
} from "../server/snapshots.mjs";
import {
  cloneMachine,
  deleteIso,
  resizeDisk,
  storageReport,
} from "../server/storage.mjs";
import { importDisk } from "../server/disk-import.mjs";
import { diskFileName } from "../server/machine-config.mjs";

const exec = promisify(execFile);
const hasQemuImg = await exec("qemu-img", ["--version"]).then(() => true, () => false);

test("snapshot names are validated against an allow-list", () => {
  for (const ok of ["a", "snap-1", "Before.upgrade_2", "9lives", "x".repeat(64)])
    assert.equal(checkSnapshotName(ok), ok);
  for (const bad of ["", " ", "-lead", ".hidden", "a b", "a;b", "a,b", "../x", "x".repeat(65), "naïve", undefined, 5])
    assert.throws(() => checkSnapshotName(bad), undefined, String(bad));
});
test("monitor and image snapshot listings parse", () => {
  const text = [
    "List of snapshots present on all disks:",
    "ID        TAG               VM SIZE                DATE     VM CLOCK     ICOUNT",
    "--        first            1.2 MiB 2026-11-20 12:00:00 00:00:05.123        --",
    "",
  ].join("\n");
  assert.deepEqual(parseHmpSnapshots(text), [
    { id: "--", name: "first", vmSize: "1.2 MiB", date: "2026-11-20 12:00:00", vmClock: "00:00:05.123" },
  ]);
  assert.deepEqual(parseHmpSnapshots("There is no snapshot available.\n"), []);
  const [row] = snapshotsFromInfo({
    snapshots: [{ id: "1", name: "s", "vm-state-size": 0, "date-sec": 1000, "date-nsec": 0, "vm-clock-sec": 2, "vm-clock-nsec": 500000000 }],
  });
  assert.equal(row.name, "s");
  assert.equal(row.vmClockSeconds, 2.5);
});
test("live actions use an allow-list of actions and key sequences", () => {
  for (const action of ["pause", "resume", "reset", "powerdown", "poweroff", "cd-eject", "screenshot"])
    assert.equal(checkLiveAction({ action }), action);
  for (const bad of [undefined, {}, { action: "quit" }, { action: "start" }, { action: "human-monitor-command" }, { action: "send-keys" }, { action: "send-keys", keys: "rm -rf" }, { action: "cd-change" }, { action: "cd-change", iso: "../x.iso" }, { action: "cd-change", iso: "a.txt" }])
    assert.throws(() => checkLiveAction(bad), undefined, JSON.stringify(bad));
  assert.equal(checkLiveAction({ action: "send-keys", keys: "ctrl-alt-delete" }), "send-keys");
  assert.equal(checkLiveAction({ action: "cd-change", iso: "ok.iso" }), "cd-change");
  assert.ok(KEY_SEQUENCES["ctrl-alt-f7"] && KEY_SEQUENCES.print);
  assert.equal(Object.keys(KEY_SEQUENCES).filter((k) => /^ctrl-alt-f\d$/.test(k)).length, 7);
});

async function workspace(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-hw-"));
  const qemu = await new Qemu(dir).open();
  const store = await new Store(dir).open();
  t.after(async () => {
    await qemu.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { dir, qemu, store };
}
async function addMachine({ qemu, store }, overrides = {}) {
  const id = randomUUID();
  const config = validateMachine(
    {
      name: "Fixture",
      arch: "x86_64",
      memory: 128,
      cpus: 1,
      disks: [{ id: "disk0", sizeGiB: 1 }],
      network: { mode: "none" },
      ...overrides,
    },
    qemu.capabilities,
    qemu.host,
  );
  const machine = { ...config, id, createdAt: new Date().toISOString() };
  for (const disk of machine.disks) await qemu.createDisk(id, disk);
  await store.transaction((s) => s.machines.push(machine));
  return store.state.machines.find((m) => m.id === id);
}
async function uploadFile(file) {
  const { size } = await stat(file);
  return Object.assign(createReadStream(file), {
    headers: { "content-length": String(size) },
  });
}
const upload = (buffer) =>
  Object.assign(Readable.from([buffer]), {
    headers: { "content-length": String(buffer.length) },
  });

test("storage resize, clone, report and ISO deletion use real qemu-img", async (t) => {
  if (!hasQemuImg) return t.skip("qemu-img is not on PATH.");
  const w = await workspace(t);
  if (!w.qemu.capabilities.x86_64?.available) return t.skip("QEMU x86_64 unavailable.");
  const machine = await addMachine(w, { cdroms: ["boot.iso"] });
  await writeFile(path.join(w.dir, "media", "boot.iso"), Buffer.alloc(4096));
  await writeFile(path.join(w.dir, "media", "spare.iso"), Buffer.alloc(2048));
  const report = await storageReport(w.store, w.qemu);
  assert.equal(report.disks.length, 1);
  assert.equal(report.disks[0].virtualBytes, 1024 ** 3);
  assert.ok(report.disks[0].actualBytes > 0);
  assert.deepEqual(report.isos.map((i) => [i.name, i.attachedTo.length]).sort(), [["boot.iso", 1], ["spare.iso", 0]]);
  assert.ok(report.total > report.free && report.free > 0);
  await assert.rejects(deleteIso(w.store, w.qemu, "boot.iso"), /attached/);
  assert.deepEqual(await deleteIso(w.store, w.qemu, "spare.iso"), { deleted: true, name: "spare.iso" });
  await assert.rejects(deleteIso(w.store, w.qemu, "../x.iso"));
  // Grow only.
  await assert.rejects(resizeDisk(w.store, w.qemu, { machineId: machine.id, diskId: "disk0", sizeGiB: 1 }), /only grow/);
  await assert.rejects(resizeDisk(w.store, w.qemu, { machineId: machine.id, diskId: "disk0", sizeGiB: 5000 }));
  await assert.rejects(resizeDisk(w.store, w.qemu, { machineId: machine.id, diskId: "nope", sizeGiB: 4 }), /not found/);
  await resizeDisk(w.store, w.qemu, { machineId: machine.id, diskId: "disk0", sizeGiB: 3 });
  assert.equal(w.store.state.machines[0].disks[0].sizeGiB, 3);
  assert.equal((await storageReport(w.store, w.qemu)).disks[0].virtualBytes, 3 * 1024 ** 3);
  // Full-copy clone.
  const clone = await cloneMachine(w.store, w.qemu, machine, "Fixture copy");
  assert.notEqual(clone.id, machine.id);
  assert.notEqual(clone.network.mac, machine.network.mac);
  assert.equal(w.store.state.machines.length, 2);
  const cloneFile = path.join(w.dir, "disks", diskFileName(clone.id, clone.disks[0]));
  const info = JSON.parse((await exec("qemu-img", ["info", "--output=json", cloneFile])).stdout);
  assert.equal(info["virtual-size"], 3 * 1024 ** 3);
  assert.equal(info["backing-filename"], undefined);
  assert.equal(info["full-backing-filename"], undefined);
  assert.ok((await stat(cloneFile)).isFile());
});
test("disk import detects the real format and rejects unsafe images", async (t) => {
  if (!hasQemuImg) return t.skip("qemu-img is not on PATH.");
  const w = await workspace(t);
  if (!w.qemu.capabilities.x86_64?.available) return t.skip("QEMU x86_64 unavailable.");
  const scratch = await mkdtemp(path.join(os.tmpdir(), "mq-img-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  for (const format of ["vmdk", "vdi", "vhdx", "qcow2", "raw"]) {
    const file = path.join(scratch, `source.disk`);
    await exec("qemu-img", ["create", "-f", format, file, "1G"]);
    // A misleading extension must not influence detection.
    const result = await importDisk({
      request: await uploadFile(file),
      params: new URLSearchParams({ name: `Imported ${format}`, mode: "machine", arch: "x86_64" }),
      store: w.store,
      qemu: w.qemu,
    });
    assert.equal(result.sourceFormat, format);
    assert.equal(result.sizeGiB, 1);
    const stored = path.join(w.dir, "disks", diskFileName(result.machine.id, result.machine.disks[0]));
    const info = JSON.parse((await exec("qemu-img", ["info", "--output=json", stored])).stdout);
    assert.equal(info.format, "qcow2");
    assert.equal(info["virtual-size"], 1024 ** 3);
  }
  assert.equal(w.store.state.machines.length, 5);
  assert.deepEqual((await readdir(path.join(w.dir, "imports"))).filter((n) => n.startsWith(".upload")), []);
  // Extra disk on an existing machine.
  const machine = w.store.state.machines[0];
  const extra = await exec("qemu-img", ["create", "-f", "vdi", path.join(scratch, "extra.vdi"), "1G"]).then(() => readFile(path.join(scratch, "extra.vdi")));
  const added = await importDisk({
    request: upload(extra),
    params: new URLSearchParams({ mode: "disk", machineId: machine.id, diskName: "Data", bus: "sata" }),
    store: w.store,
    qemu: w.qemu,
  });
  assert.equal(added.disk.id, "disk1");
  assert.equal(w.store.state.machines[0].disks.length, 2);
  assert.equal(w.store.state.machines[0].disks[1].bus, "sata");
  // Rejections: garbage-free bad parameters and backing files.
  await exec("qemu-img", ["create", "-f", "qcow2", "-b", path.join(scratch, "source.disk"), "-F", "raw", path.join(scratch, "backed.qcow2")]);
  await assert.rejects(
    importDisk({
      request: await uploadFile(path.join(scratch, "backed.qcow2")),
      params: new URLSearchParams({ name: "Backed", mode: "machine" }),
      store: w.store,
      qemu: w.qemu,
    }),
    /backing/,
  );
  await assert.rejects(importDisk({ request: upload(Buffer.from("x")), params: new URLSearchParams({ mode: "machine" }), store: w.store, qemu: w.qemu }), /Name/);
  await assert.rejects(importDisk({ request: upload(Buffer.from("x")), params: new URLSearchParams({ mode: "weird", name: "n" }), store: w.store, qemu: w.qemu }));
  await assert.rejects(importDisk({ request: upload(Buffer.from("x")), params: new URLSearchParams({ mode: "disk", machineId: randomUUID() }), store: w.store, qemu: w.qemu }), /not found/);
  // A VMDK descriptor that points at another host file is refused.
  const hostile = Buffer.from(
    '# Disk DescriptorFile\nversion=1\nCID=fffffffe\nparentCID=ffffffff\ncreateType="monolithicFlat"\n\nRW 2048 FLAT "' +
      path.join(scratch, "source.disk").replaceAll("\\", "/") +
      '" 0\n',
  );
  await assert.rejects(
    importDisk({
      request: upload(hostile),
      params: new URLSearchParams({ name: "Hostile", mode: "machine" }),
      store: w.store,
      qemu: w.qemu,
    }),
  );
  assert.equal(w.store.state.machines.length, 5);
});
test("running machine: UEFI boot, live actions, screenshot and snapshots", async (t) => {
  if (!hasQemuImg) return t.skip("qemu-img is not on PATH.");
  const w = await workspace(t);
  const uefi = w.qemu.host.firmware.x86_64.uefi;
  if (!w.qemu.capabilities.x86_64?.available) return t.skip("QEMU x86_64 unavailable.");
  if (!uefi) t.diagnostic("No UEFI firmware found; booting with BIOS instead.");
  await writeFile(path.join(w.dir, "media", "empty.iso"), Buffer.alloc(65536));
  await writeFile(path.join(w.dir, "media", "other.iso"), Buffer.alloc(65536));
  const record = await addMachine(w, {
    firmware: uefi ? "uefi" : "bios",
    cdroms: ["empty.iso"],
    serial: true,
    rng: true,
    sound: "hda",
    usb: { tablet: true, keyboard: true },
    network: { mode: "user", forwards: [{ proto: "tcp", hostPort: 28022, guestPort: 22 }] },
  });
  await w.qemu.start(record);
  assert.equal(w.qemu.status(record.id).state, "running");
  const view = w.store.state.machines.find((m) => m.id === record.id);
  // Pause, resume, key injection.
  assert.equal((await performLiveAction(w.qemu, view, { action: "pause" })).state, "paused");
  assert.equal((await performLiveAction(w.qemu, view, { action: "resume" })).state, "running");
  await performLiveAction(w.qemu, view, { action: "send-keys", keys: "ctrl-alt-f2" });
  // Screenshot is a real PNG.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const shot = await performLiveAction(w.qemu, view, { action: "screenshot" });
  assert.ok(shot.bytes > 100);
  const png = await readFile(path.join(w.qemu.runtimeDirectory(record.id), "screenshot.png"));
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // CD-ROM change and eject.
  await performLiveAction(w.qemu, view, { action: "cd-change", iso: "other.iso" });
  await performLiveAction(w.qemu, view, { action: "cd-eject" });
  await assert.rejects(performLiveAction(w.qemu, view, { action: "cd-eject", cdrom: 3 }), /no CD-ROM/);
  // Running snapshots through the monitor.
  assert.deepEqual((await listSnapshots(w.qemu, view)), { live: true, snapshots: [] });
  await createSnapshot(w.qemu, view, "live-one");
  const listed = await listSnapshots(w.qemu, view);
  assert.deepEqual(listed.snapshots.map((s) => s.name), ["live-one"]);
  await restoreSnapshot(w.qemu, view, "live-one");
  assert.equal(w.qemu.status(record.id).state !== "stopped", true);
  await deleteSnapshot(w.qemu, view, "live-one");
  assert.deepEqual((await listSnapshots(w.qemu, view)).snapshots, []);
  await assert.rejects(restoreSnapshot(w.qemu, view, "missing"));
  await performLiveAction(w.qemu, view, { action: "reset" });
  // Serial log and UEFI variable store exist in the private runtime directory.
  const runtime = await readdir(w.qemu.runtimeDirectory(record.id));
  assert.ok(runtime.includes("serial.log"));
  if (uefi) assert.ok(runtime.includes("OVMF_VARS.qcow2"));
  await performLiveAction(w.qemu, view, { action: "poweroff" });
  assert.equal(w.qemu.status(record.id).state, "stopped");
  // Stopped snapshots through qemu-img.
  assert.deepEqual((await listSnapshots(w.qemu, view)), { live: false, snapshots: [] });
  await createSnapshot(w.qemu, view, "cold");
  assert.deepEqual((await listSnapshots(w.qemu, view)).snapshots.map((s) => s.name), ["cold"]);
  await restoreSnapshot(w.qemu, view, "cold");
  await assert.rejects(createSnapshot(w.qemu, view, "cold"));
  await deleteSnapshot(w.qemu, view, "cold");
  assert.deepEqual((await listSnapshots(w.qemu, view)).snapshots, []);
  // Raw disks cannot be snapshotted.
  const raw = await addMachine(w, { disks: [{ id: "disk0", sizeGiB: 1, format: "raw" }] });
  await assert.rejects(createSnapshot(w.qemu, raw, "nope"), /qcow2/);
});
test("Secure Boot and extra devices launch on discovered firmware", async (t) => {
  const w = await workspace(t);
  const fw = w.qemu.host.firmware.x86_64;
  if (!w.qemu.capabilities.x86_64?.available || !fw.secureBoot) return t.skip("No Secure Boot capable firmware on this host.");
  const record = await addMachine(w, { firmware: "uefi", secureBoot: true, machineType: "q35", display: { adapter: "virtio" }, sound: "ac97", balloon: true, bootMenu: true, bootOrder: ["disk", "cdrom", "net"], network: { mode: "user", model: "e1000e" }, disks: [{ id: "disk0", sizeGiB: 1, bus: "sata" }, { id: "disk1", sizeGiB: 1, bus: "nvme" }, { id: "disk2", sizeGiB: 1, bus: "scsi" }] });
  await w.qemu.start(record);
  assert.equal(w.qemu.status(record.id).state, "running");
  await w.qemu.action(record.id, "stop");
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { hardwareFingerprint, savedState, refuseWhileSaved, discardState, stateFiles, resumeState } from "../server/saved-state.mjs";

const machine = { id: "11111111-1111-1111-1111-111111111111", name: "a", arch: "x86_64", machineType: "q35", accelerator: "tcg", firmware: "bios", cpus: 1, sockets: 1, cores: 1, threads: 1, memory: 256, disks: [{ id: "system", name: "system", sizeGiB: 4, bus: "virtio", format: "qcow2" }], cdroms: [], network: { mode: "none" }, display: { adapter: "std" }, usb: {}, bootOrder: ["disk"] };

test("the hardware fingerprint ignores names and notes but notices hardware changes", () => {
  const base = hardwareFingerprint(machine);
  assert.equal(hardwareFingerprint({ ...machine, name: "renamed", notes: "x", tags: ["t"], folder: "f", favourite: true }), base);
  assert.notEqual(hardwareFingerprint({ ...machine, memory: 512 }), base);
  assert.notEqual(hardwareFingerprint({ ...machine, disks: [{ ...machine.disks[0], sizeGiB: 8 }] }), base);
});

test("a saved state is found, blocks other changes, refuses a resume after hardware changed, and is discarded", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-state-"));
  const qemu = { runtimeDirectory: (id) => path.join(dir, id), start: async () => { throw new Error("must not start"); } };
  try {
    assert.equal(await savedState(qemu, machine.id), null);
    await refuseWhileSaved(qemu, machine.id, "resizing its disks");
    await mkdir(path.join(dir, machine.id), { recursive: true });
    const files = stateFiles(qemu, machine.id);
    await writeFile(files.data, "state");
    await writeFile(files.meta, JSON.stringify({ savedAt: "2026-11-21T00:00:00Z", bytes: 5, wasRunning: true, hardware: hardwareFingerprint(machine) }));
    assert.equal((await savedState(qemu, machine.id)).bytes, 5);
    await assert.rejects(refuseWhileSaved(qemu, machine.id, "resizing its disks"), /Resume or discard it before resizing its disks/);
    await assert.rejects(resumeState(qemu, { ...machine, memory: 512 }), /hardware changed/);
    assert.deepEqual(await discardState(qemu, machine.id), { discarded: true });
    assert.equal(await savedState(qemu, machine.id), null);
    await assert.rejects(resumeState(qemu, machine), /no saved state/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

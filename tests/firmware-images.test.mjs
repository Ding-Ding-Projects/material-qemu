import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import os from "node:os";
import { receiveFirmware, listFirmware, deleteFirmware, firmwareImagePath, checkFirmwareName } from "../server/firmware-images.mjs";
import { launchPlan } from "../server/launch-plan.mjs";

const upload = (bytes, length = bytes.length) => Object.assign(Readable.from([Buffer.from(bytes)]), { headers: { "content-length": String(length) } });

test("firmware names are limited to plain .fd, .bin and .rom files", () => {
  for (const good of ["OVMF_CODE.fd", "bios-256k.bin", "ipxe.rom"]) assert.equal(checkFirmwareName(good), good);
  for (const bad of ["../x.fd", "a/b.fd", ".hidden.fd", "x.exe", "x.fd;rm", ""]) assert.throws(() => checkFirmwareName(bad), /named like/);
});

test("uploads are stored once, never overwritten, listed with their users and protected while used", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-fw-"));
  try {
    assert.deepEqual(await receiveFirmware(upload("firmware-bytes"), dir, "custom.bin"), { name: "custom.bin", bytes: 14 });
    await assert.rejects(receiveFirmware(upload("other"), dir, "custom.bin"), /never overwritten/);
    assert.equal(await readFile(path.join(dir, "firmware", "custom.bin"), "utf8"), "firmware-bytes");
    await assert.rejects(receiveFirmware(upload("short", 10), dir, "bad.bin"), /length does not match/);
    const machines = [{ id: "m1", name: "web", firmwareImage: "custom.bin" }];
    assert.deepEqual(await listFirmware(dir, machines), [{ name: "custom.bin", bytes: 14, usedBy: ["m1"] }]);
    await assert.rejects(deleteFirmware(dir, machines, "custom.bin"), /used by web/);
    assert.equal(await firmwareImagePath(dir, ""), null);
    assert.match(await firmwareImagePath(dir, "custom.bin"), /custom\.bin$/);
    await assert.rejects(firmwareImagePath(dir, "missing.fd"), /not in managed storage/);
    assert.deepEqual(await deleteFirmware(dir, [], "custom.bin"), { deleted: true, name: "custom.bin" });
    assert.deepEqual(await listFirmware(dir, []), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a custom BIOS image becomes the -bios argument", () => {
  const machine = { id: "11111111-1111-1111-1111-111111111111", name: "fw", arch: "x86_64", machineType: "q35", accelerator: "tcg", firmware: "bios", cpus: 1, sockets: 1, cores: 1, threads: 1, memory: 256, disks: [], cdroms: [], network: { mode: "none" }, display: { adapter: "std" }, usb: {}, bootOrder: ["disk"] };
  const { args } = launchPlan(machine, { biosImage: "/data/firmware/custom.bin" });
  const at = args.indexOf("-bios");
  assert.equal(args[at + 1], "/data/firmware/custom.bin");
  assert.equal(launchPlan(machine, {}).args.includes("-bios"), false);
});

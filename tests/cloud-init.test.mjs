import test from "node:test";
import assert from "node:assert/strict";
import { buildSeedIso } from "../server/seed-iso.mjs";
import { validateCloudInit, seedFiles, seedHostname, buildCloudInitSeed } from "../server/cloud-init.mjs";
import { launchPlan } from "../server/launch-plan.mjs";

// Reads the volume label and the Joliet root directory back out of the image.
function readIso(iso) {
  const pvd = iso.subarray(16 * 2048, 17 * 2048), svd = iso.subarray(17 * 2048, 18 * 2048);
  const label = pvd.toString("ascii", 40, 72).trim();
  const jolietLabel = Buffer.from(svd.subarray(40, 72)).swap16().toString("utf16le").trim();
  const rootLba = svd.readUInt32LE(156 + 2);
  const dir = iso.subarray(rootLba * 2048, rootLba * 2048 + 2048);
  const files = {};
  for (let at = 0; dir[at]; at += dir[at]) {
    const nameLength = dir[at + 32];
    if (nameLength === 1 && dir[at + 33] <= 1) continue;
    const name = Buffer.from(dir.subarray(at + 33, at + 33 + nameLength)).swap16().toString("utf16le");
    const lba = dir.readUInt32LE(at + 2), size = dir.readUInt32LE(at + 10);
    files[name] = iso.toString("utf8", lba * 2048, lba * 2048 + size);
  }
  return { label, jolietLabel, escape: svd.toString("ascii", 88, 91), size: pvd.readUInt32LE(80) * 2048, files };
}

test("the seed image carries the cidata label, Joliet names and exact contents", () => {
  const iso = buildSeedIso([{ name: "user-data", data: "#cloud-config\nhostname: a\n" }, { name: "meta-data", data: "instance-id: x\n" }]);
  const read = readIso(iso);
  assert.equal(read.label, "cidata");
  assert.equal(read.jolietLabel, "cidata");
  assert.equal(read.escape, "%/E");
  assert.equal(read.size, iso.length);
  assert.deepEqual(read.files, { "meta-data": "instance-id: x\n", "user-data": "#cloud-config\nhostname: a\n" });
  assert.throws(() => buildSeedIso([{ name: "../x", data: "" }]), /letters, digits/);
  assert.throws(() => buildSeedIso([]), /1–16 files/);
});

test("cloud-init settings are validated and the seed names the machine", () => {
  assert.deepEqual(validateCloudInit(undefined), { enabled: false, userData: "", networkConfig: "" });
  assert.throws(() => validateCloudInit({ enabled: true, userData: "  " }), /Write the cloud-init user-data/);
  assert.throws(() => validateCloudInit({ enabled: true, userData: "x".repeat(33 * 1024) }), /at most 32 KiB/);
  assert.throws(() => validateCloudInit({ enabled: true, userData: "a\0b" }), /plain text/);
  const cloudInit = validateCloudInit({ enabled: true, userData: "#cloud-config\n", networkConfig: "" });
  assert.equal(seedHostname("Web Server #2"), "web-server-2");
  const machine = { id: "1234", name: "Web Server #2", cloudInit };
  assert.deepEqual(seedFiles(machine).map((f) => f.name), ["meta-data", "user-data"]);
  assert.equal(seedFiles(machine)[0].data, "instance-id: 1234\nlocal-hostname: web-server-2\n");
  const read = readIso(buildCloudInitSeed({ ...machine, cloudInit: { ...cloudInit, networkConfig: "version: 2\n" } }));
  assert.deepEqual(Object.keys(read.files).sort(), ["meta-data", "network-config", "user-data"]);
});

test("the seed is attached read-only on the media bus and never as a boot device", () => {
  const machine = { id: "11111111-1111-1111-1111-111111111111", name: "ci", arch: "x86_64", machineType: "q35", accelerator: "tcg", firmware: "bios", cpus: 1, sockets: 1, cores: 1, threads: 1, memory: 256, disks: [], cdroms: [], network: { mode: "none" }, display: { adapter: "std" }, usb: {}, bootOrder: ["disk"], cloudInit: { enabled: true, userData: "#cloud-config\n", networkConfig: "" } };
  const args = launchPlan(machine, { seedIso: "/runtime/seed.iso" }).args.join(" ");
  assert.match(args, /virtio-scsi-pci,id=media-scsi/);
  assert.match(args, /file=\/runtime\/seed\.iso,format=raw,if=none,media=cdrom,readonly=on,id=cloud-init-seed/);
  assert.match(args, /scsi-cd,drive=cloud-init-seed,bus=media-scsi\.0,id=cd-cloud-init(?! *,bootindex)/);
  assert.doesNotMatch(args, /cd-cloud-init,bootindex/);
  assert.doesNotMatch(launchPlan({ ...machine, cloudInit: { enabled: false } }).args.join(" "), /cloud-init/);
});

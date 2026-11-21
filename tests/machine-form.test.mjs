import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultConfig,
  applyPreset,
  normalizeMachine,
  toV2Payload,
  toLegacyPayload,
  setPath,
  coerce,
  addForward,
  moveBoot,
  totalCpus,
  validateConfig,
} from "../public/machine-form.js";

test("v2 payload carries every hardware field and the legacy totals", () => {
  const cfg = defaultConfig("x86_64", "q35");
  cfg.name = " dev ";
  Object.assign(cfg, { sockets: 1, cores: 4, threads: 2, firmware: "uefi", secureBoot: true, tpm: true });
  addForward(cfg);
  setPath(cfg, "network.forwards.0.hostPort", coerce("2222", "number"));
  setPath(cfg, "network.forwards.0.guestPort", coerce("22", "number"));
  setPath(cfg, "disks.0.bus", "nvme");
  const payload = toV2Payload(cfg);
  assert.equal(payload.name, "dev");
  assert.equal(payload.cpus, 8);
  assert.equal(payload.secureBoot, true);
  assert.deepEqual(payload.network.forwards, [{ proto: "tcp", hostPort: 2222, guestPort: 22 }]);
  assert.equal(payload.disks[0].bus, "nvme");
  assert.deepEqual(payload.bootOrder, ["cdrom", "disk", "net"]);
  assert.equal(payload.display.adapter, "virtio");
});
test("secure boot is dropped when firmware is BIOS", () => {
  const cfg = defaultConfig();
  cfg.name = "x";
  cfg.secureBoot = true;
  assert.equal(toV2Payload(cfg).secureBoot, false);
});
test("old records are read into the v2 shape and legacy payload round trips", () => {
  const cfg = normalizeMachine({
    id: "a", name: "old", arch: "aarch64", machineType: "virt",
    cpus: 3, memory: 1024, diskGiB: 12, network: "user", iso: "a.iso",
  });
  assert.equal(totalCpus(cfg), 3);
  assert.equal(cfg.disks[0].sizeGiB, 12);
  assert.deepEqual(cfg.cdroms, ["a.iso"]);
  assert.equal(cfg.network.mode, "user");
  const legacy = toLegacyPayload(cfg);
  assert.equal(legacy.network, "user");
  assert.equal(legacy.iso, "a.iso");
  assert.equal(legacy.diskGiB, 12);
});
test("presets reset hardware then apply their values", () => {
  let cfg = defaultConfig();
  cfg = applyPreset(cfg, "windows");
  assert.equal(cfg.firmware, "uefi");
  assert.equal(cfg.tpm, true);
  assert.equal(cfg.disks[0].sizeGiB, 64);
  assert.equal(cfg.network.model, "e1000e");
  cfg = applyPreset(cfg, "server");
  assert.equal(cfg.tpm, false);
  assert.equal(cfg.firmware, "bios");
  assert.equal(cfg.memory, 2048);
});
test("setPath cannot pollute prototypes or create missing containers", () => {
  const cfg = defaultConfig();
  setPath(cfg, "__proto__", { polluted: true });
  setPath(cfg, "nothing.deep", 1);
  assert.equal({}.polluted, undefined);
  assert.equal(cfg.nothing, undefined);
});
test("boot order moves within bounds and duplicate forwards are reported", () => {
  const cfg = defaultConfig();
  moveBoot(cfg, "disk", -1);
  assert.deepEqual(cfg.bootOrder, ["disk", "cdrom", "net"]);
  moveBoot(cfg, "disk", -1);
  assert.deepEqual(cfg.bootOrder, ["disk", "cdrom", "net"]);
  cfg.name = "n";
  cfg.network.forwards.push({ proto: "tcp", hostPort: 80, guestPort: 80 }, { proto: "tcp", hostPort: 80, guestPort: 81 });
  assert.deepEqual(validateConfig(cfg), ["forward"]);
});

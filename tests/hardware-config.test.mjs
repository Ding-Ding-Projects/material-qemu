import test from "node:test";
import assert from "node:assert/strict";
import {
  validateMachine,
  migrateMachine,
  mergeMachineUpdate,
  diskFileName,
} from "../server/machine-config.mjs";
import { launchPlan, hostCache } from "../server/launch-plan.mjs";
import {
  findFirmware,
  parseCpuModels,
  firmwareCandidates,
} from "../server/host.mjs";

const base = {
  name: "Hardware fixture",
  arch: "x86_64",
  memory: 1024,
  cpus: 2,
};
const host = {
  firmware: {
    x86_64: {
      uefi: true,
      secureBoot: true,
      code: "/fw/code.fd",
      secureCode: "/fw/secure.fd",
      vars: "/fw/vars.fd",
    },
  },
  swtpm: "/usr/bin/swtpm",
  cpuModels: { x86_64: ["max", "qemu64", "Skylake-Client", "EPYC"] },
};
const flag = (args, name) => {
  const values = [];
  args.forEach((value, i) => value === name && values.push(args[i + 1]));
  return values;
};

test("old single-disk records migrate on read and on validate", () => {
  const legacy = {
    ...base,
    diskGiB: 8,
    network: "user",
    iso: "install.iso",
  };
  const migrated = migrateMachine(legacy);
  assert.equal(migrated.disks.length, 1);
  assert.equal(migrated.disks[0].id, "disk0");
  assert.equal(migrated.disks[0].sizeGiB, 8);
  assert.deepEqual(migrated.cdroms, ["install.iso"]);
  assert.equal(migrated.network.mode, "user");
  const valid = validateMachine(legacy);
  assert.equal(valid.diskGiB, 8);
  assert.equal(valid.iso, "install.iso");
  assert.match(valid.network.mac, /^52:54:00:[0-9a-f:]{8}$/);
  // The historical network was restricted; migration keeps that behaviour.
  assert.equal(valid.network.restrict, true);
  assert.equal(
    diskFileName("11111111-1111-4111-8111-111111111111", valid.disks[0]),
    "11111111-1111-4111-8111-111111111111.qcow2",
  );
  assert.equal(validateMachine({ ...legacy, network: "none" }).network.mode, "none");
  assert.throws(() => validateMachine({ ...legacy, network: "bridge" }));
});
test("validation enforces every hardware bound", () => {
  const ok = { ...base, diskGiB: 4 };
  const bad = [
    { memory: 64 },
    { memory: 262145 },
    { cpus: 65 },
    { cpus: 4, sockets: 1, cores: 2, threads: 1 },
    { sockets: 9, cores: 9, threads: 1 },
    { disks: [] },
    { disks: Array.from({ length: 9 }, () => ({ sizeGiB: 1 })) },
    { disks: [{ sizeGiB: 4097 }] },
    { disks: [{ sizeGiB: 1, bus: "floppy" }] },
    { disks: [{ sizeGiB: 1, format: "vmdk" }] },
    { disks: [{ sizeGiB: 1, cache: "unsafe" }] },
    { disks: [{ id: "a", sizeGiB: 1 }, { id: "a", sizeGiB: 1 }] },
    { disks: [{ id: "../x", sizeGiB: 1 }] },
    { cdroms: ["a.iso", "b.iso", "c.iso", "d.iso", "e.iso"] },
    { cdroms: ["../x.iso"] },
    { network: { mode: "bridge" } },
    { network: { mode: "user", mac: "00:11:22:33:44:55" } },
    { network: { mode: "user", model: "ne2k" } },
    { network: { mode: "none", forwards: [{ proto: "tcp", hostPort: 2222, guestPort: 22 }] } },
    { network: { mode: "user", forwards: [{ proto: "tcp", hostPort: 80, guestPort: 80 }] } },
    { network: { mode: "user", forwards: [{ proto: "icmp", hostPort: 2222, guestPort: 22 }] } },
    {
      network: {
        mode: "user",
        forwards: [
          { proto: "tcp", hostPort: 2222, guestPort: 22 },
          { proto: "tcp", hostPort: 2222, guestPort: 23 },
        ],
      },
    },
    {
      network: {
        mode: "user",
        forwards: Array.from({ length: 17 }, (_, i) => ({
          proto: "tcp",
          hostPort: 3000 + i,
          guestPort: 22,
        })),
      },
    },
    { firmware: "coreboot" },
    { secureBoot: true },
    { secureBoot: true, firmware: "uefi", machineType: "pc" },
    { cpuModel: "host" },
    { cpuModel: "pentium; rm" },
    { display: { adapter: "vga-passthrough" } },
    { sound: "sb16" },
    { bootOrder: ["floppy"] },
    { bootOrder: ["disk", "disk"] },
  ];
  assert.ok(validateMachine(ok, undefined, host));
  for (const change of bad)
    assert.throws(() => validateMachine({ ...ok, ...change }, undefined, host), undefined, JSON.stringify(change));
  assert.throws(
    () => validateMachine({ ...ok, tpm: true }, undefined, { ...host, swtpm: null }),
    /swtpm/,
  );
  assert.throws(
    () => validateMachine({ ...ok, firmware: "uefi" }, undefined, { ...host, firmware: { x86_64: { uefi: false } } }),
    /UEFI/,
  );
  assert.throws(
    () => validateMachine({ ...ok, cpuModel: "EPYC" }, undefined, { ...host, cpuModels: { x86_64: ["max", "qemu64"] } }),
    /does not provide/,
  );
  const topology = validateMachine({ ...ok, cpus: undefined, sockets: 2, cores: 4, threads: 2 });
  assert.equal(topology.cpus, 16);
  assert.equal(validateMachine({ ...ok, cpus: 4 }).cores, 4);
  assert.equal(validateMachine({ ...ok, accelerator: "kvm", cpuModel: "host" }).cpuModel, "host");
});
test("update merging translates legacy fields and protects disk identity", () => {
  const stored = validateMachine({ ...base, diskGiB: 4, network: "user" });
  assert.deepEqual(mergeMachineUpdate(stored, { iso: "x.iso" }).cdroms, ["x.iso"]);
  assert.equal(mergeMachineUpdate(stored, { network: "none" }).network.mode, "none");
  assert.equal(
    mergeMachineUpdate(stored, { network: { model: "e1000e" } }).network.mac,
    stored.network.mac,
  );
  assert.throws(() => mergeMachineUpdate(stored, { diskGiB: 9 }), /resize/);
  assert.throws(() => mergeMachineUpdate(stored, { disks: [{ id: "disk0", sizeGiB: 9 }] }), /resize/);
  assert.throws(() => mergeMachineUpdate(stored, { disks: [{ id: "disk0", format: "raw" }] }), /format/);
  const merged = mergeMachineUpdate(stored, {
    disks: [{ id: "disk0", bus: "nvme" }, { sizeGiB: 2 }],
  });
  assert.equal(validateMachine(merged).disks[0].bus, "nvme");
  assert.equal(validateMachine(merged).disks[1].id, "disk1");
});
test("launch plan covers every hardware option", () => {
  const machine = validateMachine(
    {
      ...base,
      machineType: "q35",
      firmware: "uefi",
      secureBoot: true,
      tpm: true,
      cpuModel: "Skylake-Client",
      sockets: 1,
      cores: 2,
      threads: 1,
      balloon: true,
      disks: [
        { id: "disk0", sizeGiB: 4, bus: "virtio", format: "qcow2", cache: "none", discard: true },
        { id: "disk1", sizeGiB: 2, bus: "sata", format: "raw" },
        { id: "disk2", sizeGiB: 2, bus: "nvme" },
        { id: "disk3", sizeGiB: 2, bus: "scsi" },
        { id: "disk4", sizeGiB: 2, bus: "ide" },
      ],
      cdroms: ["a.iso", "b.iso"],
      network: {
        mode: "user",
        model: "e1000e",
        mac: "52:54:00:AA:BB:CC",
        forwards: [
          { proto: "tcp", hostPort: 2222, guestPort: 22 },
          { proto: "udp", hostPort: 5353, guestPort: 53 },
        ],
      },
      display: { adapter: "qxl" },
      sound: "hda",
      usb: { tablet: true, keyboard: true },
      serial: true,
      rng: true,
      bootMenu: true,
      bootOrder: ["net", "cdrom", "disk"],
    },
    undefined,
    host,
  );
  const { args } = launchPlan(machine, {
    firmware: host.firmware.x86_64,
    vars: "/run/vars.fd",
    tpmSocket: "/run/tpm.sock",
    serialLog: "/run/serial.log",
    disks: { disk0: "/d/0.qcow2", disk1: "/d/1.raw" },
    platform: "linux",
  });
  const joined = args.join(" ");
  assert.equal(flag(args, "-machine")[0], "q35,smm=on");
  assert.equal(flag(args, "-cpu")[0], "Skylake-Client");
  assert.equal(flag(args, "-smp")[0], "2,sockets=1,cores=2,threads=1");
  assert.ok(joined.includes("if=pflash,format=raw,unit=0,readonly=on,file=/fw/secure.fd"));
  assert.ok(joined.includes("if=pflash,format=raw,unit=1,file=/run/vars.fd"));
  assert.ok(joined.includes("driver=cfi.pflash01,property=secure,value=on"));
  assert.ok(joined.includes("file=/d/0.qcow2,format=qcow2,if=none,id=drive-disk0,cache=none,discard=unmap"));
  assert.ok(joined.includes("file=/d/1.raw,format=raw,if=none,id=drive-disk1,cache=writeback,discard=ignore"));
  assert.ok(joined.includes("<managed disk disk2>"));
  assert.ok(joined.includes("ide-hd,drive=drive-disk1,bus=ahci-disk1.0"));
  assert.ok(joined.includes("nvme,drive=drive-disk2,serial=disk2"));
  assert.ok(joined.includes("scsi-hd,drive=drive-disk3,bus=scsi-disk3.0"));
  assert.ok(joined.includes("ide-hd,drive=drive-disk4,bus=ide.0"));
  assert.ok(joined.includes("virtio-blk-pci,drive=drive-disk0,bootindex=4"));
  assert.ok(joined.includes("scsi-cd,drive=installation-media,bus=media-scsi.0,bootindex=2,id=cd-0"));
  assert.ok(joined.includes("scsi-cd,drive=installation-media-1,bus=media-scsi.0,bootindex=3,id=cd-1"));
  assert.ok(
    joined.includes(
      "user,id=net0,hostfwd=tcp::2222-:22,hostfwd=udp::5353-:53",
    ),
  );
  assert.ok(!joined.includes("restrict=on"));
  assert.ok(joined.includes("e1000e,netdev=net0,mac=52:54:00:aa:bb:cc,bootindex=1"));
  assert.deepEqual(flag(args, "-vga"), ["qxl"]);
  assert.ok(joined.includes("-audiodev none,id=snd0 -device intel-hda -device hda-duplex,audiodev=snd0"));
  assert.ok(joined.includes("qemu-xhci -device usb-kbd -device usb-tablet"));
  assert.ok(joined.includes("virtio-rng-pci"));
  assert.ok(joined.includes("virtio-balloon-pci"));
  assert.ok(joined.includes("file,id=serial0,path=/run/serial.log -serial chardev:serial0"));
  assert.ok(
    joined.includes(
      "socket,id=chrtpm,path=/run/tpm.sock -tpmdev emulator,id=tpm0,chardev=chrtpm -device tpm-tis,tpmdev=tpm0",
    ),
  );
  assert.deepEqual(flag(args, "-boot"), ["menu=on"]);
  // Preview stays pure and never exposes private paths.
  const preview = launchPlan(machine).args.join(" ");
  assert.ok(preview.includes("<UEFI firmware>"));
  assert.ok(preview.includes("<private TPM socket>"));
  assert.ok(!preview.includes("/run/"));
});
test("launch plan defaults and alternative adapters", () => {
  const plain = validateMachine({ ...base, diskGiB: 1 });
  const { args } = launchPlan(plain);
  assert.deepEqual(flag(args, "-machine"), ["q35"]);
  assert.deepEqual(flag(args, "-vga"), ["std"]);
  assert.ok(!args.includes("-audiodev"));
  assert.ok(!args.some((v) => String(v).startsWith("if=pflash")));
  assert.ok(args.includes("qemu-xhci"));
  assert.ok(!args.includes("usb-kbd"));
  assert.ok(
    flag(launchPlan({ ...plain, display: { adapter: "none" } }).args, "-vga").includes("none"),
  );
  const ramfb = launchPlan({ ...plain, display: { adapter: "ramfb" } }).args;
  assert.ok(ramfb.includes("ramfb") && ramfb.includes("none"));
  const ac97 = launchPlan({ ...plain, sound: "ac97" }).args.join(" ");
  assert.ok(ac97.includes("AC97,audiodev=snd0"));
  const arm = launchPlan(validateMachine({ ...base, diskGiB: 1, arch: "aarch64", machineType: "virt", tpm: true })).args.join(" ");
  assert.ok(arm.includes("tpm-tis-device"));
  assert.ok(arm.includes("virtio-gpu-pci"));
  assert.ok(arm.includes("usb-kbd"));
  assert.ok(!arm.includes("-vga"));
  const none = launchPlan(validateMachine({ ...base, diskGiB: 1, network: "none" })).args;
  assert.ok(none.includes("-nic") && none.includes("none"));
  const restricted = launchPlan(validateMachine({ ...base, diskGiB: 1, network: "user" })).args.join(" ");
  assert.ok(restricted.includes("user,id=net0,restrict=on"));
  assert.throws(() => launchPlan({ ...plain, arch: "unknown" }));
  assert.throws(() => launchPlan({ ...plain, disks: [{ ...plain.disks[0], id: "x,y" }] }));
});
test("firmware and CPU model discovery", async () => {
  const present = new Set(["/usr/share/OVMF/OVMF_CODE_4M.fd", "/usr/share/OVMF/OVMF_VARS_4M.fd"]);
  const found = await findFirmware("x86_64", [], async (f) => present.has(f));
  assert.equal(found.uefi, true);
  assert.equal(found.secureBoot, false);
  present.add("/usr/share/OVMF/OVMF_CODE_4M.secboot.fd");
  assert.equal((await findFirmware("x86_64", [], async (f) => present.has(f))).secureBoot, true);
  const windows = await findFirmware("x86_64", ["C:\\qemu"], async (f) => /edk2-/.test(f));
  assert.equal(windows.uefi, true);
  assert.equal((await findFirmware("x86_64", [], async () => false)).uefi, false);
  assert.ok(firmwareCandidates("x86_64").length >= 3);
  assert.deepEqual(
    parseCpuModels("Available CPUs:\n  qemu64   QEMU\n  max  all\nx86 Opteron_G1  AMD\n"),
    ["qemu64", "max", "Opteron_G1"],
  );
});

test("Windows hosts open cache=none disks with writethrough instead of O_DIRECT", () => {
  assert.equal(hostCache("none", "win32"), "writethrough");
  assert.equal(hostCache("none", "linux"), "none");
  assert.equal(hostCache("writeback", "win32"), "writeback");
});

test("each machine gives its guest a stable SMBIOS UUID, which can be set", async () => {
  const { validateMachine } = await import("../server/machine-config.mjs");
  const plain = launchPlan({ id: "11111111-2222-3333-4444-555555555555", name: "u", arch: "x86_64", accelerator: "tcg", cpus: 1, memory: 512, disks: [], cdroms: [], network: { mode: "none" }, display: { adapter: "std" } }, { platform: "linux", disks: {} });
  const at = plain.args.indexOf("-uuid");
  assert.equal(plain.args[at + 1], "11111111-2222-3333-4444-555555555555");
  const custom = launchPlan({ id: "11111111-2222-3333-4444-555555555555", uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "u", arch: "x86_64", accelerator: "tcg", cpus: 1, memory: 512, disks: [], cdroms: [], network: { mode: "none" }, display: { adapter: "std" } }, { platform: "linux", disks: {} });
  assert.equal(custom.args[custom.args.indexOf("-uuid") + 1], "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  assert.throws(() => validateMachine({ name: "u", arch: "x86_64", memory: 512, cpus: 1, uuid: "not-a-uuid" }), /Use a UUID in the form/);
});

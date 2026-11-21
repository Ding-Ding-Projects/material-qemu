import { cpuArgument, numaArguments } from "./cpu-numa.mjs";
import { targets } from "./capabilities.mjs";
import { migrateMachine } from "./machine-config.mjs";

const isX86 = (arch) => arch === "x86_64" || arch === "i386";
const escape = (value) => String(value).replaceAll(",", ",,");
const NIC = {
  virtio: "virtio-net-pci",
  e1000e: "e1000e",
  e1000: "e1000",
  rtl8139: "rtl8139",
};

// Pure builder for the QEMU command line. Every argument is derived from a
// validated machine record; browsers never supply raw QEMU arguments. Path
// options default to placeholders so the preview never reveals private paths.
// Windows hosts cannot open images with O_DIRECT (cache=none), so they use
// writethrough, which also bypasses the host write cache for durability.
export function hostCache(cache, platform) {
  return platform === "win32" && cache === "none" ? "writethrough" : cache;
}

export function launchPlan(machineRecord, options = {}) {
  const machine = migrateMachine(machineRecord);
  const {
    disk,
    disks = {},
    qmp = "<private QMP port>",
    vnc = "<private VNC display>",
    iso,
    cdroms = [],
    firmware = {},
    vars = "<machine UEFI variables>",
    varsFormat = "raw",
    tpmSocket = "<private TPM socket>",
    serialLog = "<serial log>",
    biosImage = null,
    seedIso = "<cloud-init seed>",
  } = options;
  const arch = machine.arch,
    target = targets[arch];
  if (!target) throw new Error("Unsupported architecture.");
  const x86 = isX86(arch),
    kvm = machine.accelerator === "kvm";
  const secureBoot = Boolean(machine.secureBoot) && x86;
  const uefi = x86 && machine.firmware === "uefi";
  const machineType = machine.machineType || target.machine;
  const cpuModel = machine.cpuModel || (kvm ? "host" : target.cpu);
  const cpus = Number(machine.cpus);
  const topology = machine.cores
    ? `${cpus},sockets=${machine.sockets},cores=${machine.cores},threads=${machine.threads}`
    : String(cpus);
  const args = [
    "-name",
    escape(machine.name),
    // A stable SMBIOS UUID: the one set on the machine, or the machine's id.
    ...((machine.uuid || machine.id) ? ["-uuid", machine.uuid || machine.id] : []),
    "-machine",
    secureBoot ? `${machineType},smm=on` : machineType,
    "-accel",
    machine.accelerator || "tcg",
    "-cpu",
    cpuArgument(cpuModel, machine.cpuFlags || []),
    "-m",
    String(machine.memory),
    "-smp",
    topology,
    ...numaArguments(machine.numa, Number(machine.memory), cpus),
    "-qmp",
    `tcp:127.0.0.1:${qmp},server=on,wait=off`,
    "-vnc",
    `127.0.0.1:${typeof vnc === "number" ? vnc - 5900 : vnc}`,
    "-display",
    "none",
  ];
  // Boot indexes follow the requested order of device groups.
  const order = machine.bootOrder || ["cdrom", "disk"];
  const bootindex = { cdrom: [], disk: [], net: [] };
  let counter = 1;
  for (const group of order) {
    const count =
      group === "cdrom"
        ? (machine.cdroms || []).length
        : group === "disk"
          ? machine.disks.length
          : machine.network?.mode === "user"
            ? 1
            : 0;
    for (let i = 0; i < count; i++) bootindex[group].push(counter++);
  }
  const boot = (group, index) =>
    bootindex[group][index] ? `,bootindex=${bootindex[group][index]}` : "";
  if (machine.bootMenu && x86) args.push("-boot", "menu=on");
  // The preview has no paths, so a chosen image shows as a named placeholder.
  const imagePlaceholder = machine.firmwareImage ? `<firmware image ${machine.firmwareImage}>` : null;
  if (biosImage || (imagePlaceholder && !uefi)) args.push("-bios", biosImage || imagePlaceholder);
  else if (target.firmware)
    args.push("-bios", target.firmware);
  if (uefi) {
    args.push(
      "-drive",
      `if=pflash,format=raw,unit=0,readonly=on,file=${escape(
        (secureBoot ? firmware.secureCode : firmware.code) ||
          imagePlaceholder ||
          "<UEFI firmware>",
      )}`,
      "-drive",
      `if=pflash,format=${varsFormat},unit=1,file=${escape(vars)}`,
    );
    if (secureBoot)
      args.push(
        "-global",
        "driver=cfi.pflash01,property=secure,value=on",
        "-global",
        "ICH9-LPC.disable_s3=1",
      );
  }
  // Display adapter.
  const adapter = machine.display?.adapter || (x86 ? "std" : "virtio");
  if (x86) {
    if (adapter === "ramfb") args.push("-vga", "none", "-device", "ramfb");
    else args.push("-vga", adapter);
  } else if (adapter === "virtio") args.push("-device", "virtio-gpu-pci");
  else if (adapter === "std") args.push("-device", "bochs-display");
  else if (adapter === "ramfb") args.push("-device", "ramfb");
  // USB input.
  const usb = machine.usb || { tablet: !x86, keyboard: !x86 };
  if (usb.tablet || usb.keyboard) {
    args.push("-device", "qemu-xhci");
    if (usb.keyboard) args.push("-device", "usb-kbd");
    if (usb.tablet) args.push("-device", "usb-tablet");
  }
  // Disks.
  let ideBus = 0;
  machine.disks.forEach((d, i) => {
    if (!/^[a-z0-9-]+$/.test(d.id)) throw new Error("Invalid disk id.");
    const file =
      disks[d.id] ??
      (i === 0 && disk !== undefined
        ? disk
        : i === 0
          ? "<managed disk>"
          : `<managed disk ${d.id}>`);
    const drive = `drive-${d.id}`;
    args.push(
      "-drive",
      `file=${escape(file)},format=${d.format},if=none,id=${drive},cache=${hostCache(d.cache, options.platform ?? process.platform)},discard=${d.discard ? "unmap" : "ignore"}`,
    );
    const index = boot("disk", i);
    if (d.bus === "virtio")
      args.push("-device", `virtio-blk-pci,drive=${drive}${index}`);
    else if (d.bus === "nvme")
      args.push(
        "-device",
        `nvme,drive=${drive},serial=${d.id.slice(0, 20)}${index}`,
      );
    else if (d.bus === "sata")
      args.push(
        "-device",
        `ahci,id=ahci-${d.id}`,
        "-device",
        `ide-hd,drive=${drive},bus=ahci-${d.id}.0${index}`,
      );
    else if (d.bus === "scsi")
      args.push(
        "-device",
        `virtio-scsi-pci,id=scsi-${d.id}`,
        "-device",
        `scsi-hd,drive=${drive},bus=scsi-${d.id}.0${index}`,
      );
    else if (d.bus === "ide")
      args.push(
        "-device",
        `ide-hd,drive=${drive},bus=ide.${ideBus++}${index}`,
      );
  });
  // Installation media.
  const media = machine.cdroms || [];
  if (media.length) args.push("-device", "virtio-scsi-pci,id=media-scsi");
  media.forEach((_, i) => {
    const file =
      cdroms[i] ??
      (i === 0 && iso !== undefined
        ? iso
        : i === 0
          ? "<managed ISO>"
          : `<managed ISO ${i + 1}>`);
    const id = i === 0 ? "installation-media" : `installation-media-${i}`;
    args.push(
      "-drive",
      `file=${escape(file)},format=raw,if=none,media=cdrom,readonly=on,id=${id}`,
      "-device",
      `scsi-cd,drive=${id},bus=media-scsi.0${boot("cdrom", i)},id=cd-${i}`,
    );
  });
  // cloud-init seed: read-only, on the media bus, never a boot device.
  if (machine.cloudInit?.enabled) {
    if (!media.length) args.push("-device", "virtio-scsi-pci,id=media-scsi");
    args.push(
      "-drive",
      `file=${escape(seedIso)},format=raw,if=none,media=cdrom,readonly=on,id=cloud-init-seed`,
      "-device",
      "scsi-cd,drive=cloud-init-seed,bus=media-scsi.0,id=cd-cloud-init",
    );
  }
  // Network.
  const net = machine.network;
  if (net.mode === "user") {
    const forwards = (net.forwards || [])
      .map((f) => `,hostfwd=${f.proto}::${f.hostPort}-:${f.guestPort}`)
      .join("");
    args.push(
      "-netdev",
      `user,id=net0${net.restrict ? ",restrict=on" : ""}${forwards}`,
      "-device",
      `${NIC[net.model || "virtio"]},netdev=net0${net.mac ? `,mac=${net.mac}` : ""}${boot("net", 0)}`,
    );
  } else args.push("-nic", "none");
  // Sound, RNG, balloon, serial and TPM.
  if (machine.sound === "hda")
    args.push(
      "-audiodev",
      "none,id=snd0",
      "-device",
      "intel-hda",
      "-device",
      "hda-duplex,audiodev=snd0",
    );
  else if (machine.sound === "ac97")
    args.push("-audiodev", "none,id=snd0", "-device", "AC97,audiodev=snd0");
  if (machine.rng) args.push("-device", "virtio-rng-pci");
  if (machine.balloon) args.push("-device", "virtio-balloon-pci");
  if (machine.serial)
    args.push(
      "-chardev",
      `file,id=serial0,path=${escape(serialLog)}`,
      "-serial",
      "chardev:serial0",
    );
  if (machine.tpm)
    args.push(
      "-chardev",
      `socket,id=chrtpm,path=${escape(tpmSocket)}`,
      "-tpmdev",
      "emulator,id=tpm0,chardev=chrtpm",
      "-device",
      `${x86 ? "tpm-tis" : "tpm-tis-device"},tpmdev=tpm0`,
    );
  return { executable: target.executable, args };
}

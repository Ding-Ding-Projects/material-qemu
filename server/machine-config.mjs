import { validateCloudInit } from "./cloud-init.mjs";
import { checkFirmwareName } from "./firmware-images.mjs";
import { validateCpuFlags, validateNuma } from "./cpu-numa.mjs";
import { randomBytes } from "node:crypto";
import { targets, supportedMachine } from "./capabilities.mjs";
import { cpuModelAllowList } from "./host.mjs";
import { normalizeTags } from "./organization.mjs";

export const DISK_BUSES = ["virtio", "sata", "nvme", "scsi", "ide"];
export const DISK_FORMATS = ["qcow2", "raw"];
export const DISK_CACHES = ["none", "writeback", "writethrough"];
export const NIC_MODELS = ["virtio", "e1000e", "e1000", "rtl8139"];
export const DISPLAY_ADAPTERS = ["virtio", "std", "qxl", "ramfb", "none"];
export const SOUND_DEVICES = ["none", "hda", "ac97"];
export const BOOT_DEVICES = ["cdrom", "disk", "net"];
export const MAX_DISKS = 8;
export const MAX_CDROMS = 4;
export const MAX_FORWARDS = 16;
export const MAX_DISK_GIB = 4096;
export const ISO_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,150}\.iso$/i;
const DISK_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const MAC = /^52:54:00:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}$/;
const isX86 = (arch) => arch === "x86_64" || arch === "i386";

export function generateMac() {
  const tail = randomBytes(3);
  return `52:54:00:${[...tail].map((b) => b.toString(16).padStart(2, "0")).join(":")}`;
}
// Name of the managed file that stores a disk. The first migrated disk keeps
// the historical `<machine id>.qcow2` name so existing data stays in place.
export function diskFileName(machineId, disk) {
  return disk.id === "disk0" && disk.format === "qcow2"
    ? `${machineId}.qcow2`
    : `${machineId}-${disk.id}.${disk.format}`;
}
// Bring any stored or submitted machine to the version 2 shape without
// validating it. Old records (diskGiB, network string, iso) keep working.
export function migrateMachine(input) {
  const machine = { ...input };
  if (!Array.isArray(machine.disks))
    machine.disks = [
      {
        id: "disk0",
        name: "Disk 1",
        sizeGiB: machine.diskGiB === undefined ? 20 : Number(machine.diskGiB),
        bus: "virtio",
        format: "qcow2",
        cache: "writeback",
        discard: false,
      },
    ];
  if (!Array.isArray(machine.cdroms))
    machine.cdroms = machine.iso ? [machine.iso] : [];
  if (typeof machine.network === "string")
    machine.network = {
      mode: machine.network,
      restrict: machine.network === "user",
    };
  else if (machine.network === undefined || machine.network === null)
    machine.network = { mode: "user" };
  return machine;
}
// SMBIOS UUID the guest sees. Empty means "use the machine's own id".
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function smbiosUuid(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!UUID.test(text)) throw new Error("Use a UUID in the form 12345678-1234-1234-1234-123456789abc, or leave it empty.");
  return text.toLowerCase();
}
const bool = (value, fallback = false) =>
  value === undefined || value === null ? fallback : Boolean(value);
function pick(value, allowed, fallback, label) {
  if (value === undefined || value === null || value === "") return fallback;
  if (!allowed.includes(value)) throw new Error(`Unsupported ${label}.`);
  return value;
}
function integer(value, min, max, message) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max)
    throw new Error(message);
  return number;
}
function validateDisks(list, arch) {
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_DISKS)
    throw new Error(`Use between 1 and ${MAX_DISKS} disks.`);
  const used = new Set(list.map((d) => d?.id).filter(Boolean));
  let counter = 0;
  const disks = list.map((raw, index) => {
    if (!raw || typeof raw !== "object")
      throw new Error("Each disk must be an object.");
    let id = raw.id;
    if (id === undefined || id === null || id === "") {
      while (used.has(`disk${counter}`)) counter++;
      id = `disk${counter}`;
      used.add(id);
    }
    if (typeof id !== "string" || !DISK_ID.test(id))
      throw new Error("Disk ids use lowercase letters, numbers and hyphens.");
    const name = String(raw.name ?? `Disk ${index + 1}`).trim();
    if (!name || name.length > 80 || /[\x00-\x1f]/.test(name))
      throw new Error("Use a disk name between 1 and 80 characters.");
    const bus = pick(raw.bus, DISK_BUSES, "virtio", "disk bus");
    if (bus === "ide" && !isX86(arch))
      throw new Error("The IDE bus is only available on x86 targets.");
    return {
      id,
      name,
      sizeGiB: integer(
        raw.sizeGiB,
        1,
        MAX_DISK_GIB,
        `Disk capacity must be 1–${MAX_DISK_GIB} GiB.`,
      ),
      bus,
      format: pick(raw.format, DISK_FORMATS, "qcow2", "disk format"),
      cache: pick(raw.cache, DISK_CACHES, "writeback", "cache mode"),
      discard: bool(raw.discard),
    };
  });
  if (new Set(disks.map((d) => d.id)).size !== disks.length)
    throw new Error("Disk ids must be unique.");
  if (disks.filter((d) => d.bus === "ide").length > 2)
    throw new Error("At most two disks can use the IDE bus.");
  return disks;
}
function validateNetwork(input) {
  const network = input && typeof input === "object" ? input : {};
  const mode = pick(network.mode, ["user", "none"], "user", "network");
  const forwards = network.forwards ?? [];
  if (!Array.isArray(forwards) || forwards.length > MAX_FORWARDS)
    throw new Error(`Use at most ${MAX_FORWARDS} port forwards.`);
  if (mode === "none" && forwards.length)
    throw new Error("Port forwards need the user-mode network.");
  const seen = new Set();
  const checked = forwards.map((f) => {
    const proto = pick(f?.proto, ["tcp", "udp"], undefined, "forward protocol");
    if (!proto) throw new Error("Choose tcp or udp for every port forward.");
    const hostPort = integer(
      f.hostPort,
      1024,
      65535,
      "Host ports must be 1024–65535.",
    );
    const guestPort = integer(
      f.guestPort,
      1,
      65535,
      "Guest ports must be 1–65535.",
    );
    if (seen.has(`${proto}:${hostPort}`))
      throw new Error("Each host port can be forwarded only once.");
    seen.add(`${proto}:${hostPort}`);
    return { proto, hostPort, guestPort };
  });
  let mac = network.mac;
  if (mac === undefined || mac === null || mac === "") mac = generateMac();
  mac = String(mac).toLowerCase();
  if (!MAC.test(mac))
    throw new Error("MAC addresses use the form 52:54:00:xx:xx:xx.");
  return {
    mode,
    model: pick(network.model, NIC_MODELS, "virtio", "network model"),
    mac,
    forwards: checked,
    restrict: mode === "user" && bool(network.restrict),
  };
}
function validateCpuModel(input, { arch, accelerator, host }) {
  const defaults = isX86(arch)
    ? accelerator === "kvm"
      ? "host"
      : "max"
    : accelerator === "kvm"
      ? "host"
      : "";
  if (input === undefined || input === null || input === "") return defaults;
  if (!isX86(arch)) {
    if (!["host", "max"].includes(input))
      throw new Error("This target supports the host or max CPU model.");
  } else if (!cpuModelAllowList.includes(input))
    throw new Error("Unsupported CPU model.");
  if (input === "host" && accelerator !== "kvm")
    throw new Error("The host CPU model needs the KVM accelerator.");
  const discovered = host?.cpuModels?.[arch];
  if (
    isX86(arch) &&
    discovered?.length &&
    !["host", "max"].includes(input) &&
    !discovered.includes(input)
  )
    throw new Error("This QEMU build does not provide that CPU model.");
  return input;
}
export function validateMachine(rawInput, capabilities, host) {
  const input = migrateMachine(rawInput);
  const name = String(input.name || "").trim();
  if (!name || name.length > 80 || /[\x00-\x1f]/.test(name))
    throw new Error("Use a machine name between 1 and 80 characters.");
  if (!targets[input.arch]) throw new Error("Unsupported architecture.");
  const arch = input.arch;
  const machineType = input.machineType || targets[arch].machine;
  const accelerator = input.accelerator || "tcg";
  if (
    !supportedMachine(arch, machineType) ||
    !["tcg", "kvm"].includes(accelerator)
  )
    throw new Error("Unsupported machine recipe or accelerator.");
  if (capabilities) {
    const cap = capabilities[arch];
    if (!cap?.available)
      throw new Error(cap?.reason || "Target is unavailable.");
    if (!cap.selectableRecipes.some((item) => item.machineType === machineType))
      throw new Error("Machine type was not discovered as a supported recipe.");
    if (
      !cap.accelerators.some((item) => item.name === accelerator && item.usable)
    )
      throw new Error("Accelerator is not usable on this host.");
  }
  const memory = integer(
    input.memory,
    128,
    262144,
    "Memory must be 128–262144 MiB.",
  );
  let { sockets, cores, threads, cpus } = input;
  const topology = [sockets, cores, threads].some(
    (v) => v !== undefined && v !== null && v !== "",
  );
  if (topology) {
    sockets = integer(sockets ?? 1, 1, 64, "Sockets must be 1–64.");
    cores = integer(cores ?? 1, 1, 64, "Cores must be 1–64.");
    threads = integer(threads ?? 1, 1, 64, "Threads must be 1–64.");
    const product = sockets * cores * threads;
    if (product > 64) throw new Error("CPU count must be 1–64.");
    if (cpus !== undefined && cpus !== null && Number(cpus) !== product)
      throw new Error("Sockets × cores × threads must equal the CPU count.");
    cpus = product;
  } else {
    cpus = integer(cpus, 1, 64, "CPU count must be 1–64.");
    sockets = 1;
    cores = cpus;
    threads = 1;
  }
  const disks = validateDisks(input.disks, arch);
  if (
    !Array.isArray(input.cdroms) ||
    input.cdroms.length > MAX_CDROMS ||
    input.cdroms.some((n) => typeof n !== "string" || !ISO_NAME.test(n))
  )
    throw new Error("Select up to four ISOs from the managed media directory.");
  const network = validateNetwork(input.network);
  let firmware = "uefi";
  if (isX86(arch)) {
    firmware = pick(input.firmware, ["bios", "uefi"], "bios", "firmware");
    if (firmware === "uefi" && host && !host.firmware?.[arch]?.uefi)
      throw new Error("UEFI firmware was not found on this host.");
  }
  const secureBoot = bool(input.secureBoot);
  if (secureBoot) {
    if (!isX86(arch) || firmware !== "uefi")
      throw new Error("Secure Boot needs x86 UEFI firmware.");
    if (!/^(q35|pc-q35-[0-9.]+)$/.test(machineType))
      throw new Error("Secure Boot needs a q35 machine type.");
    if (host && !host.firmware?.[arch]?.secureBoot)
      throw new Error("No Secure Boot capable firmware was found on this host.");
  }
  const tpm = bool(input.tpm);
  if (tpm && host && !host.swtpm)
    throw new Error(
      "A TPM needs the swtpm emulator, which was not found on this host.",
    );
  const display = pick(
    input.display?.adapter,
    DISPLAY_ADAPTERS,
    isX86(arch) ? "std" : "virtio",
    "display adapter",
  );
  if (!isX86(arch) && display === "qxl")
    throw new Error("The QXL adapter is only available on x86 targets.");
  const usb = input.usb && typeof input.usb === "object" ? input.usb : {};
  const bootOrder = input.bootOrder ?? ["cdrom", "disk"];
  if (
    !Array.isArray(bootOrder) ||
    bootOrder.length > 3 ||
    new Set(bootOrder).size !== bootOrder.length ||
    bootOrder.some((d) => !BOOT_DEVICES.includes(d))
  )
    throw new Error("The boot order lists cdrom, disk and net at most once.");
  return {
    name,
    arch,
    machineType,
    accelerator,
    firmware,
    secureBoot,
    tpm,
    cpuModel: validateCpuModel(input.cpuModel, { arch, accelerator, host }),
    cpuFlags: validateCpuFlags(input.cpuFlags, { arch, host }),
    firmwareImage: input.firmwareImage ? checkFirmwareName(input.firmwareImage) : "",
    cloudInit: validateCloudInit(input.cloudInit),
    numa: validateNuma(input.numa, { memory, cpus }),
    memory,
    balloon: bool(input.balloon),
    cpus,
    sockets,
    cores,
    threads,
    disks,
    cdroms: [...input.cdroms],
    network,
    display: { adapter: display },
    sound: pick(input.sound, SOUND_DEVICES, "none", "sound device"),
    usb: {
      tablet: bool(usb.tablet, true),
      keyboard: bool(usb.keyboard, !isX86(arch)),
    },
    serial: bool(input.serial),
    rng: bool(input.rng),
    bootMenu: bool(input.bootMenu),
    bootOrder: [...bootOrder],
    autostart: bool(input.autostart),
    uuid: smbiosUuid(input.uuid),
    // Derived for older clients that still read the single-disk fields.
    diskGiB: disks[0].sizeGiB,
    iso: input.cdroms[0] || "",
    folder: String(input.folder || "").slice(0, 80),
    favourite: Boolean(input.favourite),
    notes: String(input.notes || "").slice(0, 2000),
    tags: normalizeTags(input.tags),
  };
}
// Merge an update request into a stored machine. Older clients send the
// single-disk, network-string and `iso` fields; translate them first.
export function mergeMachineUpdate(machine, body) {
  const next = { ...migrateMachine(machine) };
  const update = { ...body };
  if (update.disks === undefined && update.diskGiB !== undefined) {
    if (Number(update.diskGiB) !== next.disks[0].sizeGiB)
      throw new Error(
        "Disk capacity cannot be edited here. Use the storage resize action.",
      );
    delete update.diskGiB;
  }
  delete update.diskGiB;
  if (update.cdroms === undefined && update.iso !== undefined)
    update.cdroms = update.iso ? [update.iso] : [];
  delete update.iso;
  if (typeof update.network === "string")
    update.network = {
      ...next.network,
      mode: update.network,
      forwards: update.network === "none" ? [] : next.network.forwards,
    };
  else if (update.network && typeof update.network === "object")
    update.network = { ...next.network, ...update.network };
  if (update.disks !== undefined) {
    if (!Array.isArray(update.disks)) throw new Error("Disks must be a list.");
    update.disks = update.disks.map((disk) => {
      const existing = next.disks.find((d) => d.id === disk?.id);
      if (!existing) return disk;
      if (Number(disk.sizeGiB ?? existing.sizeGiB) !== existing.sizeGiB)
        throw new Error(
          "Disk capacity cannot be edited here. Use the storage resize action.",
        );
      if ((disk.format ?? existing.format) !== existing.format)
        throw new Error("The format of an existing disk cannot change.");
      return { ...existing, ...disk };
    });
  }
  return { ...next, ...update };
}

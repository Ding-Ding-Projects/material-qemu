// Machine configuration v2: defaults, presets, path binding and payload serialization.
export const BUSES = ["virtio", "sata", "nvme", "scsi", "ide"];
export const NIC_MODELS = ["virtio", "e1000e", "e1000", "rtl8139"];
export const DISPLAYS = ["virtio", "std", "qxl", "ramfb", "none"];
export const SOUNDS = ["none", "hda", "ac97"];
export const BOOT_DEVICES = ["cdrom", "disk", "net"];
export const SECTIONS = [
  "system",
  "cpu",
  "disks",
  "network",
  "display",
  "boot",
];

let counter = 0;
const uid = (prefix) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newDisk(overrides = {}) {
  return {
    id: uid("d"),
    name: "disk",
    sizeGiB: 20,
    bus: "virtio",
    format: "qcow2",
    cache: "writeback",
    discard: true,
    ...overrides,
  };
}
export function defaultConfig(arch = "x86_64", machineType = "") {
  return {
    name: "",
    arch,
    machineType,
    accelerator: "tcg",
    firmware: "bios",
    secureBoot: false,
    tpm: false,
    cpuModel: "max",
    sockets: 1,
    cores: 2,
    threads: 1,
    memory: 2048,
    balloon: true,
    disks: [newDisk({ name: "system" })],
    cdroms: [],
    network: { mode: "user", model: "virtio", mac: "", forwards: [] },
    display: { adapter: "virtio" },
    sound: "none",
    usb: { tablet: true, keyboard: true },
    serial: false,
    rng: true,
    bootMenu: false,
    bootOrder: ["cdrom", "disk", "net"],
    autostart: false,
    uuid: "",
    folder: "",
    notes: "",
    favourite: false,
    startAfterCreate: false,
    preset: "blank",
  };
}
export const PRESETS = {
  blank: {},
  server: { cores: 2, memory: 2048, sound: "none", display: { adapter: "std" } },
  desktop: {
    cores: 4,
    memory: 4096,
    sound: "hda",
    display: { adapter: "virtio" },
    usb: { tablet: true, keyboard: true },
    disk: 40,
  },
  windows: {
    cores: 4,
    memory: 8192,
    firmware: "uefi",
    secureBoot: true,
    tpm: true,
    sound: "hda",
    display: { adapter: "std" },
    network: { model: "e1000e" },
    disk: 64,
    bus: "sata",
  },
};
export function applyPreset(config, name) {
  const preset = PRESETS[name] || {};
  const next = structuredClone(config);
  const base = defaultConfig(config.arch, config.machineType);
  for (const key of [
    "firmware",
    "secureBoot",
    "tpm",
    "cores",
    "memory",
    "sound",
    "display",
    "usb",
  ])
    next[key] = structuredClone(base[key]);
  next.network = { ...next.network, model: base.network.model };
  for (const [key, value] of Object.entries(preset)) {
    if (key === "disk") next.disks[0] = { ...next.disks[0], sizeGiB: value };
    else if (key === "bus") next.disks[0] = { ...next.disks[0], bus: value };
    else if (key === "network") next.network = { ...next.network, ...value };
    else next[key] = structuredClone(value);
  }
  next.preset = name;
  return next;
}
const toInt = (value, fallback, min, max) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
// Reads a stored record in either the old shape or the v2 shape.
export function normalizeMachine(record = {}) {
  const base = defaultConfig(record.arch, record.machineType);
  const cfg = { ...base, ...structuredClone(record) };
  if (!Array.isArray(record.disks) || !record.disks.length)
    cfg.disks = [
      newDisk({ name: "system", sizeGiB: toInt(record.diskGiB, 20, 1, 4096) }),
    ];
  cfg.disks = cfg.disks.map((d) => ({ ...newDisk(), ...d }));
  if (!Array.isArray(record.cdroms))
    cfg.cdroms = record.iso ? [record.iso] : [];
  const rawNet = record.network;
  cfg.network =
    rawNet && typeof rawNet === "object"
      ? { ...base.network, ...rawNet, forwards: rawNet.forwards || [] }
      : { ...base.network, mode: rawNet === "none" ? "none" : rawNet === "user" ? "user" : "none" };
  cfg.display = { ...base.display, ...(record.display || {}) };
  cfg.usb = { ...base.usb, ...(record.usb || {}) };
  if (!record.sockets && !record.cores && record.cpus) {
    cfg.sockets = 1;
    cfg.cores = toInt(record.cpus, 2, 1, 256);
    cfg.threads = 1;
  }
  cfg.bootOrder = Array.isArray(record.bootOrder)
    ? record.bootOrder.filter((d) => BOOT_DEVICES.includes(d))
    : base.bootOrder;
  return cfg;
}
export const totalCpus = (cfg) =>
  toInt(cfg.sockets, 1, 1, 8) *
  toInt(cfg.cores, 1, 1, 64) *
  toInt(cfg.threads, 1, 1, 4);
// Payload understood by the machine-config v2 server.
export function toV2Payload(cfg) {
  const out = {
    name: String(cfg.name || "").trim(),
    arch: cfg.arch,
    machineType: cfg.machineType,
    accelerator: cfg.accelerator,
    firmware: cfg.firmware,
    secureBoot: Boolean(cfg.secureBoot && cfg.firmware === "uefi"),
    tpm: Boolean(cfg.tpm),
    cpuModel: cfg.cpuModel,
    sockets: toInt(cfg.sockets, 1, 1, 8),
    cores: toInt(cfg.cores, 1, 1, 64),
    threads: toInt(cfg.threads, 1, 1, 4),
    cpus: totalCpus(cfg),
    memory: toInt(cfg.memory, 2048, 128, 1048576),
    balloon: Boolean(cfg.balloon),
    disks: cfg.disks.map((d) => ({
      id: d.id,
      name: String(d.name || "disk").trim(),
      sizeGiB: toInt(d.sizeGiB, 20, 1, 65536),
      bus: d.bus,
      format: d.format,
      cache: d.cache,
      discard: Boolean(d.discard),
    })),
    cdroms: [...cfg.cdroms],
    network: {
      mode: cfg.network.mode,
      model: cfg.network.model,
      mac: cfg.network.mac || undefined,
      forwards: cfg.network.forwards
        .filter((f) => f.hostPort && f.guestPort)
        .map((f) => ({
          proto: f.proto === "udp" ? "udp" : "tcp",
          hostPort: toInt(f.hostPort, 0, 1, 65535),
          guestPort: toInt(f.guestPort, 0, 1, 65535),
        })),
    },
    display: { adapter: cfg.display.adapter },
    sound: cfg.sound,
    usb: { tablet: Boolean(cfg.usb.tablet), keyboard: Boolean(cfg.usb.keyboard) },
    serial: Boolean(cfg.serial),
    rng: Boolean(cfg.rng),
    bootMenu: Boolean(cfg.bootMenu),
    bootOrder: [...cfg.bootOrder],
    autostart: Boolean(cfg.autostart),
    uuid: String(cfg.uuid || "").trim(),
    folder: cfg.folder || "",
    notes: cfg.notes || "",
    startAfterCreate: Boolean(cfg.startAfterCreate),
  };
  if (cfg.id) out.id = cfg.id;
  return out;
}
// Payload for a server that has not been upgraded to v2 yet.
export function toLegacyPayload(cfg) {
  return {
    ...(cfg.id ? { id: cfg.id } : {}),
    name: String(cfg.name || "").trim(),
    arch: cfg.arch,
    machineType: cfg.machineType,
    accelerator: cfg.accelerator,
    cpus: totalCpus(cfg),
    memory: toInt(cfg.memory, 2048, 128, 32768),
    diskGiB: toInt(cfg.disks[0]?.sizeGiB, 20, 1, 256),
    network: cfg.network.mode === "user" ? "user" : "none",
    iso: cfg.cdroms[0] || "",
    folder: cfg.folder || "",
    notes: cfg.notes || "",
    startAfterCreate: Boolean(cfg.startAfterCreate),
  };
}
// Sets cfg.a.b.0.c style paths; creates nothing outside existing containers.
export function setPath(cfg, path, value) {
  const parts = String(path).split(".");
  let node = cfg;
  for (const part of parts.slice(0, -1)) {
    node = node?.[part];
    if (node == null || typeof node !== "object") return cfg;
  }
  const last = parts.at(-1);
  if (["__proto__", "constructor", "prototype"].includes(last)) return cfg;
  node[last] = value;
  return cfg;
}
export function coerce(value, type) {
  if (type === "number") return value === "" ? "" : Number(value);
  if (type === "bool") return Boolean(value);
  return value;
}
export function addForward(cfg) {
  cfg.network.forwards.push({ proto: "tcp", hostPort: "", guestPort: "" });
  return cfg;
}
export function moveBoot(cfg, device, delta) {
  const order = cfg.bootOrder,
    index = order.indexOf(device),
    target = index + delta;
  if (index < 0 || target < 0 || target >= order.length) return cfg;
  [order[index], order[target]] = [order[target], order[index]];
  return cfg;
}
export function validateConfig(cfg) {
  const problems = [];
  if (!String(cfg.name || "").trim()) problems.push("name");
  if (!cfg.disks.length) problems.push("disks");
  const seen = new Set();
  for (const f of cfg.network.forwards) {
    const key = `${f.proto}:${f.hostPort}`;
    if (f.hostPort && seen.has(key)) problems.push("forward");
    seen.add(key);
  }
  return problems;
}

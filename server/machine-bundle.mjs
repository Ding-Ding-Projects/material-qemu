// Moving a machine to another Material QEMU host: export a stopped machine as
// one bundle (a tar file) holding its settings, disks, UEFI variables, TPM
// state, custom firmware image and saved state, and import that bundle on the
// other host. The imported machine gets a new ID but keeps its SMBIOS UUID and
// MAC address, so the guest sees the same machine and a saved state resumes.
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { createWriteStream, createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, link } from "node:fs/promises";
import { writeTar, readTar } from "./tar.mjs";
import { validateMachine, migrateMachine, diskFileName } from "./machine-config.mjs";
import { imageInfo } from "./disk-tools.mjs";
import { firmwareDirectory, FIRMWARE_NAME } from "./firmware-images.mjs";
import { savedState } from "./saved-state.mjs";
import { event } from "./store.mjs";

export const BUNDLE_VERSION = 1;
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

const exists = (file) => stat(file).then((s) => s.isFile(), () => false);
const fileEntry = async (name, file) => ({ name, file, size: (await stat(file)).size });

// The bundle's file list for one stopped machine.
export async function bundleEntries(qemu, raw) {
  const machine = migrateMachine(raw);
  if (qemu.running.has(machine.id)) throw new Error("Stop the machine before exporting it. To keep it running where it is, save its state first.");
  const runtime = qemu.runtimeDirectory(machine.id);
  const meta = { version: BUNDLE_VERSION, exportedAt: new Date().toISOString(), machine: { ...raw, uuid: raw.uuid || raw.id } };
  const entries = [{ name: "machine.json", data: Buffer.from(JSON.stringify(meta, null, 2)) }];
  if (machine.firmwareImage) entries.push(await fileEntry(`firmware/${machine.firmwareImage}`, path.join(firmwareDirectory(qemu.directory), machine.firmwareImage)));
  if (await exists(path.join(runtime, "OVMF_VARS.qcow2"))) entries.push(await fileEntry("uefi-vars.qcow2", path.join(runtime, "OVMF_VARS.qcow2")));
  for (const name of await readdir(path.join(runtime, "tpm")).catch(() => []))
    if (SAFE.test(name) && (await exists(path.join(runtime, "tpm", name)))) entries.push(await fileEntry(`tpm/${name}`, path.join(runtime, "tpm", name)));
  if (await savedState(qemu, machine.id)) {
    entries.push(await fileEntry("saved-state.json", path.join(runtime, "saved-state.json")));
    entries.push(await fileEntry("saved-state.bin", path.join(runtime, "saved-state.bin")));
  }
  for (const disk of machine.disks) entries.push(await fileEntry(`disks/${disk.id}.${disk.format}`, path.join(qemu.directory, "disks", diskFileName(machine.id, disk))));
  return entries;
}

export async function exportBundle(qemu, raw, out) {
  await writeTar(out, await bundleEntries(qemu, raw));
}

// Which names a bundle may contain, and where each may go.
function entryPlan(name) {
  if (name === "machine.json") return { kind: "meta", max: 1024 * 1024 };
  if (name === "uefi-vars.qcow2" || name === "saved-state.json" || name === "saved-state.bin") return { kind: "runtime", max: 512 * 1024 ** 3 };
  let m;
  if ((m = name.match(/^firmware\/(.+)$/)) && FIRMWARE_NAME.test(m[1])) return { kind: "firmware", file: m[1], max: 64 * 1024 ** 2 };
  if ((m = name.match(/^tpm\/(.+)$/)) && SAFE.test(m[1])) return { kind: "tpm", file: m[1], max: 64 * 1024 ** 2 };
  if ((m = name.match(/^disks\/([A-Za-z0-9_-]{1,40})\.(qcow2|raw)$/))) return { kind: "disk", id: m[1], format: m[2], max: 66 * 1024 ** 4 };
  throw new Error(`The bundle contains an unexpected file: ${name.slice(0, 80)}.`);
}

const sha256 = async (file) => {
  const h = createHash("sha256");
  for await (const c of createReadStream(file)) h.update(c);
  return h.digest("hex");
};

export async function importBundle({ request, store, qemu }) {
  const work = path.join(qemu.directory, "imports", `bundle-${randomUUID()}`);
  await mkdir(work, { recursive: true, mode: 0o700 });
  const received = new Map();
  try {
    await readTar(request, async ({ name, size }) => {
      const plan = entryPlan(name);
      if (received.has(name)) throw new Error("The bundle lists a file twice.");
      if (size > plan.max) throw new Error(`The bundle's ${name.slice(0, 80)} is too large.`);
      const file = path.join(work, `${received.size}.part`);
      received.set(name, { ...plan, file, size });
      return createWriteStream(file, { mode: 0o600 });
    });
    const metaEntry = received.get("machine.json");
    if (!metaEntry) throw new Error("This is not a Material QEMU machine bundle.");
    const meta = JSON.parse(await readFile(metaEntry.file, "utf8"));
    if (meta.version !== BUNDLE_VERSION || !meta.machine) throw new Error("This bundle was made by a version of Material QEMU this host does not read.");
    const source = migrateMachine(meta.machine);
    const config = validateMachine(source, qemu.capabilities, qemu.host);
    // Every disk the machine lists must be in the bundle, in its stated format.
    for (const disk of config.disks) {
      const entry = received.get(`disks/${disk.id}.${disk.format}`);
      if (!entry) throw new Error(`The bundle is missing the disk ${disk.name}.`);
      // The format is detected, not taken from the name, and an image that
      // points at another file (a backing file or an external data file) is
      // refused, since that file would be on this host.
      const info = await imageInfo(entry.file);
      if (info.format !== disk.format) throw new Error(`The disk ${disk.name} is not a ${disk.format} image.`);
      if (info["backing-filename"] || info["full-backing-filename"] || info["format-specific"]?.data?.["data-file"])
        throw new Error(`The disk ${disk.name} refers to another file, which a bundle cannot carry.`);
    }
    if (config.firmwareImage) {
      const entry = received.get(`firmware/${config.firmwareImage}`);
      const target = path.join(firmwareDirectory(qemu.directory), config.firmwareImage);
      if (await exists(target)) {
        if (!entry || (await sha256(entry.file)) !== (await sha256(target)))
          throw new Error(`A different firmware image named ${config.firmwareImage} is already on this host. Rename one of them first.`);
      } else if (!entry) throw new Error(`The bundle is missing the firmware image ${config.firmwareImage}.`);
    }
    if (received.has("saved-state.bin") !== received.has("saved-state.json")) throw new Error("The bundle's saved state is incomplete.");
    // Everything checks out: place the files and add the machine.
    const id = randomUUID();
    const taken = new Set(store.state.machines.map((m) => m.name));
    let name = config.name;
    for (let n = 2; taken.has(name); n++) name = `${config.name} (${n})`;
    const machine = { ...config, name, id, uuid: config.uuid || source.uuid || source.id, createdAt: new Date().toISOString(), importedAt: new Date().toISOString() };
    const runtime = qemu.runtimeDirectory(id);
    await mkdir(path.join(qemu.directory, "disks"), { recursive: true });
    await mkdir(runtime, { recursive: true, mode: 0o700 });
    for (const disk of config.disks) await rename(received.get(`disks/${disk.id}.${disk.format}`).file, path.join(qemu.directory, "disks", diskFileName(id, disk)));
    if (config.firmwareImage && received.has(`firmware/${config.firmwareImage}`)) {
      const target = path.join(firmwareDirectory(qemu.directory), config.firmwareImage);
      await mkdir(firmwareDirectory(qemu.directory), { recursive: true, mode: 0o700 });
      if (!(await exists(target))) await link(received.get(`firmware/${config.firmwareImage}`).file, target);
    }
    if (received.has("uefi-vars.qcow2")) await rename(received.get("uefi-vars.qcow2").file, path.join(runtime, "OVMF_VARS.qcow2"));
    for (const [entryName, entry] of received)
      if (entry.kind === "tpm") {
        await mkdir(path.join(runtime, "tpm"), { recursive: true, mode: 0o700 });
        await rename(entry.file, path.join(runtime, "tpm", entryName.slice("tpm/".length)));
      }
    if (received.has("saved-state.bin")) {
      await rename(received.get("saved-state.bin").file, path.join(runtime, "saved-state.bin"));
      await rename(received.get("saved-state.json").file, path.join(runtime, "saved-state.json"));
    }
    await store.transaction((s) => {
      s.machines.push(machine);
      event(s, `Imported ${name} from a machine bundle${received.has("saved-state.bin") ? ", with its saved state" : ""}.`);
    });
    return { machine, savedState: received.has("saved-state.bin") };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

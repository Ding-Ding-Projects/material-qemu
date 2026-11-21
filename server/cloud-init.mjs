// cloud-init NoCloud seed: the user-data (and optional network-config) saved
// on the machine, plus meta-data generated from the machine itself, written to
// a small "cidata" disc that is attached read-only at every start. Cloud
// images read it on first boot to set the hostname, users, keys and packages.
import { buildSeedIso } from "./seed-iso.mjs";

export const MAX_USER_DATA = 32 * 1024;
export const MAX_NETWORK_CONFIG = 8 * 1024;

const text = (value, max, label) => {
  const s = String(value ?? "");
  if (Buffer.byteLength(s, "utf8") > max) throw new Error(`${label} must be at most ${max / 1024} KiB.`);
  if (s.includes("\0")) throw new Error(`${label} must be plain text.`);
  return s;
};

export function validateCloudInit(input) {
  if (!input || typeof input !== "object" || !input.enabled) return { enabled: false, userData: "", networkConfig: "" };
  const userData = text(input.userData, MAX_USER_DATA, "Cloud-init user-data");
  if (!userData.trim()) throw new Error("Write the cloud-init user-data, or turn the seed off.");
  return { enabled: true, userData, networkConfig: text(input.networkConfig, MAX_NETWORK_CONFIG, "Cloud-init network-config") };
}

// A hostname cloud-init will accept: lower-case letters, digits and dashes.
export function seedHostname(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63) || "machine";
}

export function seedFiles(machine) {
  const files = [
    { name: "meta-data", data: `instance-id: ${machine.id}\nlocal-hostname: ${seedHostname(machine.name)}\n` },
    { name: "user-data", data: machine.cloudInit.userData },
  ];
  if (machine.cloudInit.networkConfig.trim()) files.push({ name: "network-config", data: machine.cloudInit.networkConfig });
  return files;
}

export const buildCloudInitSeed = (machine, options) => buildSeedIso(seedFiles(machine), { volumeId: "cidata", ...options });

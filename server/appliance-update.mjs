// Appliance updates. Inside the appliance the web service runs in a container
// that cannot restart itself, so it hands requests to the host's update script
// through two files in the data volume: update-request (written here) and
// update-status.json (written by the host). Outside the appliance this reports
// that updates are managed elsewhere.
import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

const STATES = new Set(["current", "available", "downloading", "restarting", "updated", "error"]);

export function applianceMode(env = process.env) {
  return env.MQ_APPLIANCE === "1";
}

export async function readUpdateStatus(dataDir, env = process.env) {
  if (!applianceMode(env)) return { supported: false };
  let status = {};
  try {
    status = JSON.parse(await readFile(path.join(dataDir, "update-status.json"), "utf8"));
  } catch {
    status = {};
  }
  const pending = await access(path.join(dataDir, "update-request")).then(() => true, () => false);
  const text = (v, max = 200) => (typeof v === "string" ? v.slice(0, max) : null);
  return {
    supported: true,
    current: text(status.current, 64),
    latest: text(status.latest, 64),
    state: STATES.has(status.state) ? status.state : null,
    message: text(status.message),
    checkedAt: text(status.checkedAt, 40),
    pending,
  };
}

export async function requestUpdate(dataDir, action, env = process.env) {
  if (!applianceMode(env)) throw new Error("Updates are only managed here on the Material QEMU appliance.");
  if (action !== "check" && action !== "apply") throw new Error("Choose check or apply.");
  await writeFile(path.join(dataDir, "update-request"), `${action}\n`, { mode: 0o644 });
  return { requested: action };
}

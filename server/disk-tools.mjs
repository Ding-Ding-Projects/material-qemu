import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const SNAPSHOT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const IMPORT_FORMATS = ["qcow2", "raw", "vmdk", "vdi", "vhdx"];

export function checkSnapshotName(name) {
  if (typeof name !== "string" || !SNAPSHOT_NAME.test(name))
    throw new Error(
      "Snapshot names start with a letter or number and use up to 64 letters, numbers, dots, underscores or hyphens.",
    );
  return name;
}
export async function qemuImg(args, timeout = 120000) {
  try {
    return (
      await exec("qemu-img", args, { timeout, maxBuffer: 8 * 1024 * 1024 })
    ).stdout;
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("qemu-img is not installed.");
    const detail = String(error.stderr || error.message)
      .trim()
      .split(/\r?\n/)
      .slice(-3)
      .join(" ");
    throw new Error(`qemu-img failed: ${detail.slice(0, 400)}`);
  }
}
// Force-share lets the report read a disk while its machine is running.
export async function imageInfo(file, { format, forceShare = false } = {}) {
  const args = ["info", "--output=json"];
  if (forceShare) args.push("-U");
  if (format) args.push("-f", format);
  return JSON.parse(await qemuImg([...args, file], 30000));
}
export function snapshotsFromInfo(info) {
  return (info.snapshots || []).map((s) => ({
    id: String(s.id),
    name: s.name,
    vmSizeBytes: s["vm-state-size"] ?? 0,
    date: new Date(
      (s["date-sec"] || 0) * 1000 + Math.floor((s["date-nsec"] || 0) / 1e6),
    ).toISOString(),
    vmClockSeconds: (s["vm-clock-sec"] || 0) + (s["vm-clock-nsec"] || 0) / 1e9,
  }));
}
// Parse the text of the monitor command `info snapshots`.
export function parseHmpSnapshots(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(
      /^(\S+)\s+(\S+)\s+([\d.]+\s*[A-Za-z]*)\s+(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\s+(\S+)/,
    );
    if (!match || match[1] === "ID" || /^-+$/.test(match[1])) continue;
    rows.push({
      id: match[1],
      name: match[2],
      vmSize: match[3].trim(),
      date: match[4],
      vmClock: match[5],
    });
  }
  return rows;
}

// Storage pools: folders, such as another drive, where new machine disks can
// live, besides the built-in managed folder. Disks are kept in a
// "material-qemu-disks" folder inside the chosen folder, so nothing else
// already there is touched. Each pool reports its free and total space.
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink, statfs, stat, readdir } from "node:fs/promises";

export const MAX_POOLS = 16;
export const POOL_SUBFOLDER = "material-qemu-disks";
export const POOL_ID = /^[a-z0-9-]{1,40}$/;

// Checks a folder the owner chose: absolute, existing, a folder, writable.
export async function checkPoolFolder(folder) {
  const value = String(folder ?? "").trim();
  if (!value || !path.isAbsolute(value) || value.length > 400) throw new Error("Give the full path of an existing folder, such as D:/VMs or /srv/vms.");
  const info = await stat(value).catch(() => null);
  if (!info?.isDirectory()) throw new Error("That folder does not exist on this host.");
  const inner = path.join(value, POOL_SUBFOLDER);
  await mkdir(inner, { recursive: true });
  const probe = path.join(inner, `.write-test-${randomUUID()}`);
  try {
    await writeFile(probe, "ok");
  } catch {
    throw new Error("Material QEMU cannot write to that folder.");
  } finally {
    await unlink(probe).catch(() => {});
  }
  return path.resolve(value);
}

export function addPool(state, { name, folder }) {
  state.pools ??= [];
  if (state.pools.length >= MAX_POOLS) throw new Error(`Use at most ${MAX_POOLS} storage pools.`);
  const label = String(name || "").trim().slice(0, 60);
  if (!label) throw new Error("Name the storage pool.");
  if (state.pools.some((p) => path.resolve(p.path).toLowerCase() === folder.toLowerCase())) throw new Error("That folder is already a storage pool.");
  const pool = { id: randomUUID().slice(0, 8), name: label, path: folder, addedAt: new Date().toISOString() };
  state.pools.push(pool);
  return pool;
}

export function removePool(state, id) {
  const used = state.machines.filter((m) => (m.disks || []).some((d) => d.pool === id));
  if (used.length) throw new Error(`Machines still keep disks in this pool: ${used.map((m) => m.name).join(", ")}.`);
  const before = (state.pools || []).length;
  state.pools = (state.pools || []).filter((p) => p.id !== id);
  if (state.pools.length === before) throw new Error("Storage pool not found.");
  return { removed: true };
}

// Free and total space, and how many disks live there, for each pool.
export async function poolReport(dataDirectory, pools, machines) {
  const all = [{ id: "", name: "Managed storage", path: path.join(dataDirectory, "disks"), builtIn: true }, ...(pools || []).map((p) => ({ ...p, builtIn: false }))];
  return Promise.all(all.map(async (p) => {
    const folder = p.builtIn ? p.path : path.join(p.path, POOL_SUBFOLDER);
    const disks = machines.flatMap((m) => (m.disks || []).filter((d) => (d.pool || "") === p.id)).length;
    try {
      const fs = await statfs(folder);
      await readdir(folder);
      return { id: p.id, name: p.name, builtIn: p.builtIn, path: p.builtIn ? null : p.path, disks, healthy: true, freeBytes: fs.bavail * fs.bsize, totalBytes: fs.blocks * fs.bsize };
    } catch (error) {
      return { id: p.id, name: p.name, builtIn: p.builtIn, path: p.builtIn ? null : p.path, disks, healthy: false, error: error.code === "ENOENT" ? "The folder is missing; is the drive connected?" : "The folder cannot be read." };
    }
  }));
}

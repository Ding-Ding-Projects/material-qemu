import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApplication } from "../server/index.mjs";

const exec = promisify(execFile);
const hasQemuImg = await exec("qemu-img", ["--version"]).then(() => true, () => false);

test("disks live in a chosen storage pool, and every disk action follows them there", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-pools-"));
  const poolFolder = await mkdtemp(path.join(os.tmpdir(), "mq-pool-folder-"));
  const origin = "http://127.0.0.1:18461";
  const app = await createApplication({ data: dir, origin });
  await new Promise((resolve) => app.server.listen(18461, "127.0.0.1", resolve));
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); await rm(poolFolder, { recursive: true, force: true }); });
  if (!hasQemuImg || !app.qemu.capabilities.x86_64?.available) return t.skip("QEMU and qemu-img are required for this test.");
  const setup = await fetch(origin + "/api/setup", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Owner", password: "owner password long" }) });
  const owner = { Origin: origin, Cookie: setup.headers.get("set-cookie").split(";")[0], "X-CSRF-Token": (await setup.json()).csrf };
  const call = async (route, method = "GET", body, as = owner) => {
    const r = await fetch(origin + route, { method, headers: { ...as, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    return { status: r.status, body: (() => { try { return JSON.parse(text); } catch { return text; } })() };
  };

  assert.match((await call("/api/pools", "POST", { name: "Nope", path: "relative/folder" })).body.error, /full path/);
  assert.match((await call("/api/pools", "POST", { name: "Nope", path: path.join(poolFolder, "missing") })).body.error, /does not exist/);
  const pool = (await call("/api/pools", "POST", { name: "Second drive", path: poolFolder })).body;
  assert.match(pool.id, /^[a-z0-9-]+$/);
  assert.match((await call("/api/pools", "POST", { name: "Again", path: poolFolder })).body.error, /already a storage pool/);

  const created = (await call("/api/machines", "POST", { name: "Pooled", arch: "x86_64", machineType: "q35", accelerator: "tcg", cpus: 1, memory: 256, disks: [{ id: "disk0", name: "system", sizeGiB: 1, bus: "virtio", format: "qcow2", pool: pool.id }, { id: "data", name: "data", sizeGiB: 1, bus: "sata", format: "qcow2" }], network: { mode: "none" } })).body;
  const machine = created.machine || created;
  const inPool = await readdir(path.join(poolFolder, "material-qemu-disks"));
  assert.deepEqual(inPool, [`${machine.id}.qcow2`]);
  assert.deepEqual((await readdir(path.join(dir, "disks"))).filter((f) => f.startsWith(machine.id)), [`${machine.id}-data.qcow2`]);
  assert.match((await call("/api/machines", "POST", { name: "Ghost", arch: "x86_64", machineType: "q35", accelerator: "tcg", cpus: 1, memory: 256, disks: [{ id: "disk0", name: "system", sizeGiB: 1, bus: "virtio", format: "qcow2", pool: "nopool" }], network: { mode: "none" } })).body.error, /no longer configured/);

  // Resize, clone and export find the disk in its pool.
  assert.equal((await call("/api/storage/disks/resize", "POST", { machineId: machine.id, diskId: "disk0", sizeGiB: 2 })).status, 200);
  const info = JSON.parse((await exec("qemu-img", ["info", "--output=json", path.join(poolFolder, "material-qemu-disks", `${machine.id}.qcow2`)])).stdout);
  assert.equal(info["virtual-size"], 2 * 1024 ** 3);
  const clone = (await call(`/api/machines/${machine.id}/clone`, "POST", { name: "Pooled copy" })).body.machine;
  assert.equal(clone.disks[0].pool, pool.id);
  assert.ok(await stat(path.join(poolFolder, "material-qemu-disks", `${clone.id}.qcow2`)));
  const exported = await fetch(origin + `/api/machines/${machine.id}/export`, { headers: owner });
  assert.equal(exported.status, 200);
  assert.ok((await exported.arrayBuffer()).byteLength > 100000);

  // Editing a machine does not move a disk between pools.
  const edit = await call(`/api/machines/${machine.id}`, "POST", { disks: [{ ...machine.disks[0], pool: undefined, sizeGiB: 2 }, { ...machine.disks[1], pool: pool.id }] });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  const saved = (await call("/api/state")).body.machines.find((m) => m.id === machine.id);
  assert.deepEqual(saved.disks.map((d) => d.pool ?? null), [pool.id, null]);

  // Health: free and total space, and how many disks each pool holds.
  const report = (await call("/api/pools")).body.pools;
  assert.deepEqual(report.map((p) => [p.name, p.builtIn, p.healthy, p.disks]), [["Managed storage", true, true, 2], ["Second drive", false, true, 2]]);
  assert.ok(report[1].freeBytes > 0 && report[1].totalBytes >= report[1].freeBytes);

  // A pool that still holds disks cannot be removed; operators cannot add pools.
  assert.match((await call(`/api/pools/${pool.id}`, "DELETE")).body.error, /still keep disks in this pool: Pooled, Pooled copy/);
  await call("/api/users", "POST", { name: "Op", username: "op", password: "operator password", role: "operator" });
  const login = await fetch(origin + "/api/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ username: "op", password: "operator password" }) });
  const operator = { Origin: origin, Cookie: login.headers.get("set-cookie").split(";")[0], "X-CSRF-Token": (await login.json()).csrf };
  assert.equal((await call("/api/pools", "GET", undefined, operator)).status, 200);
  assert.equal((await call("/api/pools", "POST", { name: "x", path: poolFolder }, operator)).status, 403);
});

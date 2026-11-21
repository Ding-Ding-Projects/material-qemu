import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Writable } from "node:stream";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApplication } from "../server/index.mjs";
import { writeTar } from "../server/tar.mjs";

const exec = promisify(execFile);
const hasQemuImg = await exec("qemu-img", ["--version"]).then(() => true, () => false);

async function host(port, t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `mq-bundle-${port}-`));
  const origin = `http://127.0.0.1:${port}`;
  const app = await createApplication({ data: dir, origin });
  await new Promise((resolve) => app.server.listen(port, "127.0.0.1", resolve));
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const setup = await fetch(origin + "/api/setup", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Owner", password: "owner password long" }) });
  const auth = { Origin: origin, Cookie: setup.headers.get("set-cookie").split(";")[0], "X-CSRF-Token": (await setup.json()).csrf };
  const call = async (route, method = "GET", body, type = "application/json") => {
    const r = await fetch(origin + route, { method, headers: { ...auth, ...(body === undefined ? {} : { "Content-Type": type }) }, body: body === undefined ? undefined : type === "application/json" ? JSON.stringify(body) : body });
    return { status: r.status, headers: r.headers, buffer: Buffer.from(await r.arrayBuffer()) };
  };
  return { dir, app, call, json: (r) => JSON.parse(r.buffer.toString()) };
}

const tarOf = async (entries) => {
  const chunks = [];
  await writeTar(new Writable({ write(c, _e, cb) { chunks.push(c); cb(); } }), entries);
  return Buffer.concat(chunks);
};

test("a machine moves to another host with its disks, keeping its identity", async (t) => {
  const a = await host(18451, t), b = await host(18452, t);
  if (!hasQemuImg || !a.app.qemu.capabilities.x86_64?.available) return t.skip("QEMU and qemu-img are required for this test.");
  const created = a.json(await a.call("/api/machines", "POST", { name: "Travelling web", arch: "x86_64", machineType: "q35", accelerator: "tcg", cpus: 2, memory: 512, notes: "carried along", disks: [{ name: "system", sizeGiB: 1, bus: "virtio", format: "qcow2" }, { name: "data", sizeGiB: 1, bus: "sata", format: "raw" }], network: { mode: "user", forwards: [{ proto: "tcp", hostPort: 22050, guestPort: 22 }] } }));
  const source = created.machine || created;
  const exported = await a.call(`/api/machines/${source.id}/export`);
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get("content-type"), "application/x-tar");
  assert.equal(Number(exported.headers.get("content-length")), exported.buffer.length);
  assert.match(exported.headers.get("content-disposition"), /Travelling web\.mqvm\.tar/);

  const imported = await b.call("/api/storage/import-bundle?name=Travelling%20web", "POST", exported.buffer, "application/octet-stream");
  assert.equal(imported.status, 201, imported.buffer.toString());
  const moved = b.json(imported).machine;
  assert.notEqual(moved.id, source.id);
  assert.equal(moved.uuid, source.id);
  assert.equal(moved.name, "Travelling web");
  assert.equal(moved.notes, "carried along");
  assert.equal(moved.network.mac, source.network.mac);
  assert.deepEqual(moved.disks.map((d) => [d.name, d.format, d.bus]), [["system", "qcow2", "virtio"], ["data", "raw", "sata"]]);
  const disks = await readdir(path.join(b.dir, "disks"));
  assert.equal(disks.filter((f) => f.startsWith(moved.id)).length, 2);
  // Importing the same bundle again gives a second copy with its own name.
  assert.equal(b.json(await b.call("/api/storage/import-bundle", "POST", exported.buffer, "application/octet-stream")).machine.name, "Travelling web (2)");
});

test("bundles with unexpected files, wrong formats or outside references are refused", async (t) => {
  const b = await host(18453, t);
  if (!hasQemuImg || !b.app.qemu.capabilities.x86_64?.available) return t.skip("QEMU and qemu-img are required for this test.");
  const machine = { id: "11111111-1111-1111-1111-111111111111", name: "Bad", arch: "x86_64", machineType: "q35", accelerator: "tcg", cpus: 1, memory: 256, disks: [{ id: "disk0", name: "system", sizeGiB: 1, bus: "virtio", format: "raw" }], network: { mode: "none" } };
  const meta = Buffer.from(JSON.stringify({ version: 1, machine }));
  const send = async (entries) => {
    const r = await b.call("/api/storage/import-bundle", "POST", await tarOf(entries), "application/octet-stream");
    return [r.status, b.json(r).error];
  };
  assert.deepEqual(await send([{ name: "machine.json", data: meta }, { name: "../escape", data: Buffer.from("x") }]), [400, "The bundle contains an unexpected file: ../escape."]);
  assert.deepEqual(await send([{ name: "machine.json", data: meta }]), [400, "The bundle is missing the disk system."]);
  // A qcow2 image whose backing file points at a file on the host, disguised as raw and as qcow2.
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-evil-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const evil = path.join(dir, "evil.qcow2");
  await exec("qemu-img", ["create", "-f", "qcow2", "-F", "raw", "-b", "C:/Windows/win.ini", evil]);
  const evilBytes = (await import("node:fs/promises")).readFile(evil);
  assert.deepEqual(await send([{ name: "machine.json", data: meta }, { name: "disks/disk0.raw", data: await evilBytes }]), [400, "The disk system is not a raw image."]);
  const asQcow2 = Buffer.from(JSON.stringify({ version: 1, machine: { ...machine, disks: [{ ...machine.disks[0], format: "qcow2" }] } }));
  assert.deepEqual(await send([{ name: "machine.json", data: asQcow2 }, { name: "disks/disk0.qcow2", data: await evilBytes }]), [400, "The disk system refers to another file, which a bundle cannot carry."]);
  assert.deepEqual(await send([{ name: "readme.txt", data: Buffer.from("hi") }]), [400, "The bundle contains an unexpected file: readme.txt."]);
  assert.deepEqual(await send([{ name: "machine.json", data: Buffer.from('{"version":99,"machine":{}}') }]), [400, "This bundle was made by a version of Material QEMU this host does not read."]);
  assert.equal(b.app.store?.state?.machines?.length ?? 0, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApplication } from "../server/index.mjs";

const exec = promisify(execFile);
const hasQemuImg = await exec("qemu-img", ["--version"]).then(() => true, () => false);

test("HTTP hardware, actions, snapshot, storage and import endpoints", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-hw-http-")),
    origin = "http://localhost:18439";
  const app = await createApplication({ data: dir, origin });
  await new Promise((resolve) => app.server.listen(18439, "127.0.0.1", resolve));
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  if (!hasQemuImg || !app.qemu.capabilities.x86_64?.available)
    return t.skip("QEMU and qemu-img are required for this test.");
  const raw = (route, method, body, headers, type = "application/json") =>
    fetch(origin + route, {
      method,
      headers: { Origin: origin, "Content-Type": type, ...headers },
      body,
    });
  const setup = await raw("/api/setup", "POST", JSON.stringify({ name: "Fixture", password: "a sufficiently long fixture password" }));
  const cookie = setup.headers.get("set-cookie").split(";")[0],
    { csrf } = await setup.json();
  const auth = { Cookie: cookie, "X-CSRF-Token": csrf };
  const call = async (route, method = "GET", body) => {
    const response = await raw(route, method, body === undefined ? undefined : JSON.stringify(body), auth);
    return { status: response.status, body: await response.json() };
  };
  // Host facts.
  const host = await call("/api/host");
  assert.equal(host.status, 200);
  assert.match(host.body.qemuVersion, /\d+\.\d+/);
  assert.ok(host.body.targets.includes("x86_64"));
  assert.equal(typeof host.body.firmware.uefi, "boolean");
  assert.equal(typeof host.body.swtpm, "boolean");
  assert.ok(host.body.cpuModels.includes("max"));
  assert.equal((await fetch(origin + "/api/host")).status, 401);
  // Preview for v2 fields is inert and uses placeholders.
  const config = {
    name: "HTTP hardware",
    arch: "x86_64",
    memory: 256,
    cpus: 2,
    sockets: 1,
    cores: 2,
    threads: 1,
    disks: [{ sizeGiB: 1 }, { sizeGiB: 1, bus: "nvme" }],
    network: { mode: "user", forwards: [{ proto: "tcp", hostPort: 28023, guestPort: 22 }] },
    sound: "ac97",
    rng: true,
    serial: true,
    cdroms: ["boot.iso"],
  };
  await writeFile(path.join(dir, "media", "boot.iso"), Buffer.alloc(8192));
  for (const route of ["/api/machine-preview", "/api/machines/preview"]) {
    const preview = await call(route, "POST", config);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.executed, false);
    assert.ok(preview.body.args.includes("-audiodev"));
    assert.ok(preview.body.args.some((a) => a.includes("<managed disk disk1>")));
    assert.ok(!preview.body.args.join(" ").includes(dir));
  }
  assert.equal(app.store.state.machines.length, 0);
  assert.equal((await call("/api/machine-preview", "POST", { ...config, tpm: !host.body.swtpm ? true : undefined, ...(host.body.swtpm ? { memory: 1 } : {}) })).status, 400);
  const created = await call("/api/machines", "POST", config);
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(created.body.disks.length, 2);
  assert.match(created.body.network.mac, /^52:54:00:/);
  // Legacy hardware edit shapes still work while stopped.
  assert.equal((await call(`/api/machines/${id}`, "POST", { network: "none" })).status, 200);
  assert.equal(app.store.state.machines[0].network.mode, "none");
  assert.equal((await call(`/api/machines/${id}`, "POST", { diskGiB: 5 })).status, 400);
  assert.equal((await call(`/api/machines/${id}`, "POST", { memory: 128, autostart: true })).status, 200);
  // Start, live actions, screenshot.
  assert.equal((await call(`/api/machines/${id}/actions`, "POST", { action: "start" })).body.state, "running");
  assert.equal((await call(`/api/machines/${id}/actions`, "POST", { action: "pause" })).body.state, "paused");
  assert.equal((await call(`/api/machines/${id}/actions`, "POST", { action: "resume" })).body.state, "running");
  assert.equal((await call(`/api/machines/${id}/actions`, "POST", { action: "send-keys", keys: "ctrl-alt-delete" })).status, 200);
  assert.equal((await call(`/api/machines/${id}/actions`, "POST", { action: "send-keys", keys: "format c:" })).status, 400);
  assert.equal((await call(`/api/machines/${id}/actions`, "POST", { action: "human-monitor-command" })).status, 400);
  assert.equal((await fetch(`${origin}/api/machines/${id}/screenshot`)).status, 401);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal((await call(`/api/machines/${id}/actions`, "POST", { action: "screenshot" })).status, 200);
  const image = await fetch(`${origin}/api/machines/${id}/screenshot`, { headers: { Cookie: cookie } });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.equal(image.headers.get("cache-control"), "no-store");
  assert.deepEqual([...Buffer.from(await image.arrayBuffer()).subarray(1, 4)], [0x50, 0x4e, 0x47]);
  // Hardware edits are refused while running; resize and clone need a stopped machine.
  assert.equal((await call(`/api/machines/${id}`, "POST", { memory: 256 })).status, 400);
  assert.equal((await call("/api/storage/disks/resize", "POST", { machineId: id, diskId: "disk0", sizeGiB: 2 })).status, 400);
  assert.equal((await call(`/api/machines/${id}/clone`, "POST", { name: "Nope" })).status, 400);
  // Running snapshots.
  assert.equal((await call(`/api/machines/${id}/snapshots`, "POST", { name: "bad name" })).status, 400);
  assert.equal((await call(`/api/machines/${id}/snapshots`, "POST", { name: "http-live" })).status, 201);
  assert.deepEqual((await call(`/api/machines/${id}/snapshots`)).body.snapshots.map((s) => s.name), ["http-live"]);
  assert.equal((await call(`/api/machines/${id}/snapshots/http-live/restore`, "POST", {})).status, 200);
  assert.equal((await call(`/api/machines/${id}/snapshots/http-live`, "DELETE")).status, 200);
  assert.equal((await call(`/api/machines/${id}/actions`, "POST", { action: "poweroff" })).body.state, "stopped");
  // Stopped snapshots, storage, resize, clone.
  assert.equal((await call(`/api/machines/${id}/snapshots`, "POST", { name: "http-cold" })).status, 201);
  assert.equal((await call("/api/storage")).body.disks[0].snapshots, 1);
  assert.equal((await call(`/api/machines/${id}/snapshots/http-cold`, "DELETE")).status, 200);
  const storage = await call("/api/storage");
  assert.equal(storage.body.disks.length, 2);
  assert.deepEqual(storage.body.isos, [{ name: "boot.iso", bytes: 8192, attachedTo: [id] }]);
  assert.equal((await call("/api/storage/disks/resize", "POST", { machineId: id, diskId: "disk0", sizeGiB: 2 })).status, 200);
  assert.equal((await call("/api/storage/isos/boot.iso", "DELETE")).status, 400);
  // Browsers send a DELETE with no content type; it reaches the handler (which
  // refuses here only because the ISO is attached), but still needs the origin
  // and the CSRF token.
  const browserDelete = (headers) => fetch(origin + "/api/storage/isos/boot.iso", { method: "DELETE", headers });
  const plain = await browserDelete({ Origin: origin, ...auth });
  assert.equal(plain.status, 400);
  assert.match((await plain.json()).error, /attached/);
  assert.equal((await browserDelete({ Origin: "http://evil.example", ...auth })).status, 403);
  assert.equal((await browserDelete({ Origin: origin, Cookie: auth.Cookie })).status, 403);
  const clone = await call(`/api/machines/${id}/clone`, "POST", { name: "HTTP clone" });
  assert.equal(clone.status, 200);
  assert.equal(clone.body.machine.disks[0].sizeGiB, 2);
  // Disk import by octet-stream upload.
  const image2 = path.join(dir, "up.vmdk");
  await exec("qemu-img", ["create", "-f", "vmdk", image2, "1G"]);
  const { readFile } = await import("node:fs/promises");
  const imported = await raw("/api/storage/import?mode=machine&name=Imported%20VM&arch=x86_64", "POST", await readFile(image2), auth, "application/octet-stream");
  assert.equal(imported.status, 201);
  assert.equal((await imported.json()).sourceFormat, "vmdk");
  assert.equal((await raw("/api/storage/import?mode=machine&name=X", "POST", Buffer.from("x"), { Cookie: cookie }, "application/octet-stream")).status, 403);
  assert.equal((await raw("/api/storage/import?mode=machine&name=X", "POST", Buffer.from("x"), {}, "application/octet-stream")).status, 401);
  assert.equal(app.store.state.machines.length, 3);
  // Autostart starts only machines marked for it.
  assert.deepEqual(await app.autostart(), [id]);
  assert.equal(app.qemu.status(id).state, "running");
});

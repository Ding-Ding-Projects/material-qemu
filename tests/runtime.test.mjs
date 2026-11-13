import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  symlink,
  mkdir,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApplication } from "../server/index.mjs";
import { Store } from "../server/store.mjs";
import { validateMachine, containedFile, Qemu } from "../server/qemu.mjs";
import { hashPassword, checkPassword } from "../server/auth.mjs";

test("serialized updates preserve every concurrent mutation and reload", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-store-"));
  try {
    const s = await new Store(dir).open();
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        s.transaction((v) => v.folders.push(String(i))),
      ),
    );
    const reloaded = await new Store(dir).open();
    assert.equal(reloaded.state.folders.length, 30);
    await assert.rejects(
      s.transaction(() => {
        throw new Error("cancel");
      }),
    );
    assert.equal(s.state.folders.length, 30);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("configuration rejects shell-like media, unknown architecture and oversized resources", () => {
  const valid = {
    name: "Test machine",
    arch: "x86_64",
    memory: 512,
    cpus: 1,
    diskGiB: 1,
    network: "none",
  };
  assert.equal(validateMachine(valid).name, "Test machine");
  for (const value of [
    { iso: "../outside.iso" },
    { iso: "disk.iso,format=raw" },
    { cpus: 1.5 },
    { memory: 100000 },
    { network: "bridge" },
    { arch: "untrusted" },
  ])
    assert.throws(() => validateMachine({ ...valid, ...value }));
});
test("passwords use salted verification", async () => {
  const a = await hashPassword("a sufficiently long fixture password");
  const b = await hashPassword("a sufficiently long fixture password");
  assert.notEqual(a.hash, b.hash);
  assert.equal(
    await checkPassword("a sufficiently long fixture password", a),
    true,
  );
  assert.equal(
    await checkPassword("another sufficiently long password", a),
    false,
  );
});
test("file access rejects a symlink outside the managed directory", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-path-"));
  try {
    await mkdir(path.join(dir, "media"));
    await writeFile(path.join(dir, "outside.iso"), "fixture");
    try {
      await symlink(
        path.join(dir, "outside.iso"),
        path.join(dir, "media", "linked.iso"),
      );
    } catch (error) {
      if (error.code === "EPERM")
        return t.skip("Host does not permit unprivileged file symlinks.");
      throw error;
    }
    await assert.rejects(containedFile(path.join(dir, "media"), "linked.iso"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("HTTP owner claim, sessions, CSRF and persistence boundaries", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-http-"));
  const origin = "http://localhost:18437";
  const app = await createApplication({ data: dir, origin });
  await new Promise((resolve) =>
    app.server.listen(18437, "127.0.0.1", resolve),
  );
  const request = (route, body, headers = {}) =>
    fetch(`${origin}/api${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    const anonymous = await (await request("/session")).json();
    assert.equal(anonymous.setupRequired, true);
    assert.equal("bootstrap" in anonymous, false);
    assert.equal(app.server.requestTimeout, 901000);
    assert.equal((await request("/state")).status, 401);
    assert.equal(
      (
        await request("/setup", {
          name: "Fixture owner",
          password: "a long fixture-only password",
        })
      ).status,
      403,
    );
    const bootstrap = (
      await readFile(path.join(dir, "setup-code"), "utf8")
    ).trim();
    const created = await request(
      "/setup",
      { name: "Fixture owner", password: "a long fixture-only password" },
      { "X-Setup-Token": bootstrap },
    );
    assert.equal(created.status, 200);
    const cookie = created.headers.get("set-cookie").split(";")[0];
    const { csrf } = await created.json();
    assert.match(created.headers.get("set-cookie"), /HttpOnly/);
    assert.match(created.headers.get("set-cookie"), /SameSite=Strict/);
    assert.equal(
      (
        await request("/login", {
          username: "Another owner",
          password: "a long fixture-only password",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/login", {
          username: "Fixture owner",
          password: "a long fixture-only password",
        })
      ).status,
      200,
    );
    await app.store.transaction((value) => {
      delete value.owner.username;
    });
    assert.equal(
      (
        await request("/login", {
          username: "Fixture owner",
          password: "a long fixture-only password",
        })
      ).status,
      200,
    );
    assert.equal("owner" in (await (await request("/session")).json()), false);
    assert.equal(
      (await request("/preferences", { folder: "Test" }, { Cookie: cookie }))
        .status,
      403,
    );
    assert.equal(
      (
        await request(
          "/preferences",
          { folder: "Test" },
          {
            Cookie: cookie,
            "X-CSRF-Token": csrf,
            Origin: "http://untrusted.invalid",
          },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/preferences",
          { folder: "Test", settings: { theme: "light", language: "both" } },
          { Cookie: cookie, "X-CSRF-Token": csrf },
        )
      ).status,
      200,
    );
    const state = await (
      await request("/state", undefined, { Cookie: cookie })
    ).json();
    assert.deepEqual(state.folders, ["Test"]);
    assert.equal(state.settings.language, "both");
    assert.ok(state.metricHistory.length >= 1);
    assert.equal(state.metricHistory.at(-1).sampledAt, state.metrics.sampledAt);
    assert.equal(
      (
        await request(
          "/preferences",
          { settings: { overviewState: "stopped", overviewArch: "x86_64" } },
          { Cookie: cookie, "X-CSRF-Token": csrf },
        )
      ).status,
      200,
    );
    const settingsReload = await new Store(dir).open();
    assert.equal(settingsReload.state.settings.overviewState, "stopped");
    assert.equal(settingsReload.state.settings.overviewArch, "x86_64");
    assert.equal("hash" in state.owner, false);
    const authenticated = { Cookie: cookie, "X-CSRF-Token": csrf };
    assert.equal(
      (
        await request(
          "/preferences",
          { setup: { step: 5, skipStep: 4, complete: false } },
          authenticated,
        )
      ).status,
      200,
    );
    assert.deepEqual(app.store.state.setup.skipped, [4]);
    assert.equal(app.store.state.setup.step, 5);
    assert.equal(
      (
        await request(
          "/preferences",
          { setup: { step: 6, skipStep: 2, complete: false } },
          authenticated,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/preferences",
          { setup: { step: 5, complete: true } },
          authenticated,
        )
      ).status,
      400,
    );
    assert.equal(app.store.state.setup.step, 5);
    assert.equal(app.store.state.setup.complete, false);
    const upload = (headers = {}) =>
      fetch(`${origin}/api/media?name=http-fixture.iso`, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/octet-stream",
          ...headers,
        },
        body: Buffer.from("Transport-only fixture, not bootable media."),
      });
    assert.equal((await upload()).status, 401);
    assert.equal((await upload({ Cookie: cookie })).status, 403);
    assert.equal(
      (
        await upload({
          Cookie: cookie,
          "X-CSRF-Token": csrf,
          Origin: "http://untrusted.invalid",
        })
      ).status,
      403,
    );
    const uploaded = await upload({ Cookie: cookie, "X-CSRF-Token": csrf });
    assert.equal(uploaded.status, 201);
    const receipt = await uploaded.json();
    assert.equal(
      receipt.bytes,
      Buffer.byteLength("Transport-only fixture, not bootable media."),
    );
    assert.equal(
      (await upload({ Cookie: cookie, "X-CSRF-Token": csrf })).status,
      400,
    );
    assert.equal(
      await readFile(path.join(dir, "media", "http-fixture.iso"), "utf8"),
      "Transport-only fixture, not bootable media.",
    );
    const realTransaction = app.store.transaction;
    try {
      app.store.transaction = async () => {
        throw new Error("Simulated activity-write failure.");
      };
      const saved = await fetch(`${origin}/api/media?name=audit-fixture.iso`, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/octet-stream",
          Cookie: cookie,
          "X-CSRF-Token": csrf,
        },
        body: Buffer.from("Safe transport fixture"),
      });
      assert.equal(saved.status, 201);
      const result = await saved.json();
      assert.equal(result.auditRecorded, false);
      assert.match(result.warning, /saved successfully/);
      assert.equal(
        await readFile(path.join(dir, "media", "audit-fixture.iso"), "utf8"),
        "Safe transport fixture",
      );
    } finally {
      app.store.transaction = realTransaction;
    }
    assert.equal(
      (
        await request(
          "/setup",
          { name: "Other", password: "a long fixture-only password" },
          { "X-Setup-Token": bootstrap },
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("/logout", {}, { Cookie: cookie, "X-CSRF-Token": csrf }))
        .status,
      200,
    );
    assert.equal(
      (await request("/state", undefined, { Cookie: cookie })).status,
      401,
    );
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("real QEMU lifecycle creates a disk and negotiates QMP", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-qemu-"));
  const qemu = await new Qemu(dir).open();
  try {
    if (!qemu.capabilities.x86_64.available)
      return t.skip(
        "QEMU is absent on this host. Run this test in the runtime container.",
      );
    const machine = {
      ...validateMachine({
        name: "Lifecycle fixture",
        arch: "x86_64",
        memory: 128,
        cpus: 1,
        diskGiB: 1,
        network: "none",
      }),
      id: "11111111-1111-4111-8111-111111111111",
    };
    await qemu.disk(machine.id, 1);
    await qemu.start(machine);
    assert.equal(qemu.status(machine.id).state, "running");
    await qemu.action(machine.id, "pause");
    assert.equal(qemu.status(machine.id).state, "paused");
    await qemu.action(machine.id, "reset");
    assert.notEqual(qemu.status(machine.id).state, "running");
    await qemu.action(machine.id, "resume");
    assert.equal(qemu.status(machine.id).state, "running");
    await qemu.action(machine.id, "stop");
    assert.equal(qemu.status(machine.id).state, "stopped");
  } finally {
    await qemu.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("HTTP preview is inert, start-after-create launches, and live folder moves preserve runtime", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-create-start-")),
    origin = "http://localhost:18438";
  const app = await createApplication({ data: dir, origin });
  await new Promise((resolve) =>
    app.server.listen(18438, "127.0.0.1", resolve),
  );
  try {
    if (!app.qemu.capabilities.x86_64.available)
      return t.skip("QEMU is absent; run inside the runtime container.");
    const call = (route, body, headers = {}) =>
      fetch(origin + "/api" + route, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const code = (await readFile(path.join(dir, "setup-code"), "utf8")).trim();
    const response = await call(
      "/setup",
      { name: "Fixture", password: "a sufficiently long fixture password" },
      { "X-Setup-Token": code },
    );
    const cookie = response.headers.get("set-cookie").split(";")[0],
      { csrf } = await response.json();
    const headers = { Cookie: cookie, "X-CSRF-Token": csrf };
    const config = {
      name: "Start after create fixture",
      arch: "x86_64",
      memory: 128,
      cpus: 1,
      diskGiB: 1,
      network: "none",
      startAfterCreate: true,
    };
    const preview = await (
      await call("/machine-preview", config, headers)
    ).json();
    assert.equal(preview.executed, false);
    assert.equal(app.qemu.running.size, 0);
    assert.equal(app.store.state.machines.length, 0);
    const createdResponse = await call("/machines", config, headers);
    assert.equal(createdResponse.status, 201);
    const machine = await createdResponse.json();
    assert.equal(machine.state, "running");
    assert.equal(machine.startError, undefined);
    assert.equal(
      (await call("/preferences", { folder: "Running folder" }, headers))
        .status,
      200,
    );
    assert.equal(
      (
        await call(
          `/machines/${machine.id}`,
          { folder: "Running folder" },
          headers,
        )
      ).status,
      200,
    );
    assert.equal(app.qemu.status(machine.id).state, "running");
    assert.equal(app.store.state.machines[0].folder, "Running folder");
    assert.equal(
      (await call(`/machines/${machine.id}`, { folder: "Missing" }, headers))
        .status,
      400,
    );
    assert.equal(app.store.state.machines[0].folder, "Running folder");
    assert.equal(
      (
        await call(
          `/machines/${machine.id}/action`,
          { action: "stop" },
          headers,
        )
      ).status,
      200,
    );
    const reloaded = await new Store(dir).open();
    assert.equal(reloaded.state.machines[0].id, machine.id);
    assert.ok(reloaded.state.machines[0].lastUsed);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

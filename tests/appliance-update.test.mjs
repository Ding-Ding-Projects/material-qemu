import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applianceMode, readUpdateStatus, requestUpdate } from "../server/appliance-update.mjs";

const appliance = { MQ_APPLIANCE: "1" };

test("updates are reported as unsupported outside the appliance", async () => {
  assert.equal(applianceMode({}), false);
  assert.deepEqual(await readUpdateStatus(os.tmpdir(), {}), { supported: false });
  await assert.rejects(requestUpdate(os.tmpdir(), "check", {}), /only managed here on the Material QEMU appliance/);
});

test("requests are written for the host and only check or apply is accepted", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-update-"));
  try {
    assert.deepEqual(await requestUpdate(dir, "apply", appliance), { requested: "apply" });
    assert.equal(await readFile(path.join(dir, "update-request"), "utf8"), "apply\n");
    assert.equal((await readUpdateStatus(dir, appliance)).pending, true);
    await assert.rejects(requestUpdate(dir, "rm -rf /", appliance), /Choose check or apply/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the host's status file is read defensively", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-update-"));
  try {
    await writeFile(path.join(dir, "update-status.json"), JSON.stringify({ current: "0.1.0-build.23", latest: "0.1.0-build.27", state: "available", message: "A newer release is available.", checkedAt: "2026-11-21T08:00:00Z" }));
    const s = await readUpdateStatus(dir, appliance);
    assert.equal(s.supported, true);
    assert.equal(s.state, "available");
    assert.equal(s.latest, "0.1.0-build.27");
    assert.equal(s.pending, false);
    await writeFile(path.join(dir, "update-status.json"), JSON.stringify({ state: "<script>", current: 42 }));
    const odd = await readUpdateStatus(dir, appliance);
    assert.equal(odd.state, null);
    assert.equal(odd.current, null);
    await writeFile(path.join(dir, "update-status.json"), "not json");
    assert.equal((await readUpdateStatus(dir, appliance)).state, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the appliance enables the update units and flags itself to the container", () => {
  const root = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
  const build = readFileSync(path.join(root, "appliance", "build-appliance.sh"), "utf8");
  assert.match(build, /material-qemu-update\.path material-qemu-update\.timer/);
  const env = readFileSync(path.join(root, "appliance", "rootfs", "usr", "local", "sbin", "material-qemu-env"), "utf8");
  assert.match(env, /MQ_APPLIANCE=1/);
  const script = readFileSync(path.join(root, "appliance", "rootfs", "usr", "local", "sbin", "material-qemu-update"), "utf8");
  assert.match(script, /docker pull "\$registry:\$latest"/);
  assert.match(script, /was restored/);
});

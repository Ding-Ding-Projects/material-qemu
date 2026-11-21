import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { MONITOR_QUERIES, runMonitorQuery, machineLog, LOG_TAIL_BYTES } from "../server/machine-monitor.mjs";

function fakeQemu(dir, running = true) {
  const calls = [];
  return {
    calls,
    running: new Map(running ? [["m1", { error: "qemu: warning: host doesn't support requested feature\n" }]] : []),
    lastErrors: new Map([["m2", "qemu: could not open disk"]]),
    runtimeDirectory: (id) => path.join(dir, id),
    command: async (id, execute, args) => { calls.push({ id, execute, args }); return { status: "running" }; },
  };
}

test("only listed read-only queries reach QEMU, by fixed command name", async () => {
  const qemu = fakeQemu(os.tmpdir());
  assert.deepEqual(await runMonitorQuery(qemu, { id: "m1" }, "status"), { status: "running" });
  assert.deepEqual(qemu.calls, [{ id: "m1", execute: "query-status", args: undefined }]);
  for (const bad of ["quit", "system_reset", "human-monitor-command", "__proto__", "constructor", "query-status"])
    await assert.rejects(runMonitorQuery(qemu, { id: "m1" }, bad), /Choose a listed monitor query/);
  assert.equal(qemu.calls.length, 1);
  assert.ok(Object.values(MONITOR_QUERIES).every((c) => c.startsWith("query-")));
  await assert.rejects(runMonitorQuery(fakeQemu(os.tmpdir(), false), { id: "m1" }, "status"), /not running/);
});

test("the log returns QEMU output and only the tail of a large serial log", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-log-"));
  try {
    await mkdir(path.join(dir, "m1"));
    const big = "boot line\n".repeat(10000) + "login: ";
    await writeFile(path.join(dir, "m1", "serial.log"), big);
    const qemu = fakeQemu(dir);
    const log = await machineLog(qemu, { id: "m1", serial: true });
    assert.equal(log.running, true);
    assert.match(log.qemuOutput, /requested feature/);
    assert.equal(log.serial.text.length, LOG_TAIL_BYTES);
    assert.ok(log.serial.text.endsWith("login: "));
    assert.equal(log.serial.cut, true);
    const stopped = await machineLog(qemu, { id: "m2", serial: false });
    assert.deepEqual([stopped.running, stopped.qemuOutput, stopped.serialEnabled, stopped.serial], [false, "qemu: could not open disk", false, null]);
    const missing = await machineLog(fakeQemu(dir, false), { id: "nope", serial: true });
    assert.equal(missing.serial, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

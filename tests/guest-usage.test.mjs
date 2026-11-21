import test from "node:test";
import assert from "node:assert/strict";
import { parseProcStat, parseProcStatm, parseProcessJson, cpuPercent, GuestUsage } from "../server/guest-usage.mjs";

test("Linux /proc readings are parsed, including names with spaces", () => {
  const stat = "1234 (qemu-system-x86 64) S 1 1234 1234 0 -1 4194560 100 0 0 0 250 150 0 0 20 0 3 0 100 0 0";
  assert.equal(parseProcStat(stat), 4);
  assert.equal(parseProcStatm("50000 25000 1000 10 0 4000 0\n"), 25000 * 4096);
});

test("Windows process readings come from PowerShell JSON, one object or many", () => {
  assert.deepEqual(parseProcessJson('{"Id":173688,"cpu":4.5625,"WorkingSet64":77160448}').get(173688), { cpuSeconds: 4.5625, memoryBytes: 77160448 });
  const many = parseProcessJson('[{"Id":1,"cpu":1,"WorkingSet64":2},{"Id":2,"cpu":3,"WorkingSet64":4}]');
  assert.equal(many.size, 2);
  assert.equal(parseProcessJson("").size, 0);
  assert.equal(parseProcessJson("not json").size, 0);
});

test("CPU is a share of the machine's own vCPUs and stays within 0 to 100", () => {
  assert.equal(cpuPercent({ cpuSeconds: 10, at: 0 }, { cpuSeconds: 12, at: 2000 }, 2), 50);
  assert.equal(cpuPercent({ cpuSeconds: 10, at: 0 }, { cpuSeconds: 30, at: 2000 }, 2), 100);
  assert.equal(cpuPercent(null, { cpuSeconds: 1, at: 1 }, 1), null);
});

test("the sampler reports usage per machine, keeps a history and forgets stopped machines", async () => {
  let cpu = 0;
  const usage = new GuestUsage({ platform: "linux", read: async (pids) => new Map(pids.map((pid) => [pid, { cpuSeconds: (cpu += 1), memoryBytes: 512 * 1048576 }])) });
  await usage.sample([{ id: "a", pid: 7, cpus: 1 }], 0);
  assert.equal(usage.get("a").cpuPercent, null, "the first reading has nothing to compare with");
  await usage.sample([{ id: "a", pid: 7, cpus: 1 }], 2000);
  assert.equal(usage.get("a").cpuPercent, 50);
  assert.equal(usage.get("a").memoryBytes, 512 * 1048576);
  assert.deepEqual(usage.get("a").cpuHistory, [50]);
  await usage.sample([], 4000);
  assert.equal(usage.get("a"), null);
  const other = new GuestUsage({ platform: "darwin" });
  await other.sample([{ id: "a", pid: 7, cpus: 1 }]);
  assert.equal(other.get("a"), null);
});

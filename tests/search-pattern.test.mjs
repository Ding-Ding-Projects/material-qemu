import test from "node:test";
import assert from "node:assert/strict";
import { compileSearch, MAX_PATTERN } from "../public/search-pattern.js";
import { filterMachines } from "../public/machine-filter.js";

const machines = [
  { name: "debian-13-dev", arch: "x86_64", notes: "build box", folder: "Lab", tags: ["dev"], state: "running" },
  { name: "win11-test", arch: "x86_64", notes: "", folder: "", tags: ["windows"], state: "stopped" },
  { name: "arm-builder", arch: "aarch64", notes: "CI", folder: "Lab", tags: [], state: "stopped" },
];

test("plain text matches case-insensitively across fields", () => {
  const s = compileSearch("LAB");
  assert.deepEqual(machines.filter(s.test).map((m) => m.name), ["debian-13-dev", "arm-builder"]);
});

test("a regular expression with flags and chosen fields", () => {
  const s = compileSearch("^(debian|win)\\d*", { regex: true, flags: { i: true }, fields: ["name"] });
  assert.equal(s.ok, true);
  assert.deepEqual(machines.filter(s.test).map((m) => m.name), ["debian-13-dev", "win11-test"]);
  const caseSensitive = compileSearch("^DEBIAN", { regex: true, flags: { i: false }, fields: ["name"] });
  assert.equal(machines.filter(caseSensitive.test).length, 0);
  const archOnly = compileSearch("aarch64|riscv", { regex: true, fields: ["arch"] });
  assert.deepEqual(machines.filter(archOnly.test).map((m) => m.name), ["arm-builder"]);
});

test("an invalid or oversized pattern is reported and matches nothing", () => {
  const bad = compileSearch("(unclosed", { regex: true });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Unterminated group/);
  assert.equal(machines.filter(bad.test).length, 0);
  const long = compileSearch("a".repeat(MAX_PATTERN + 1), { regex: true });
  assert.equal(long.ok, false);
});

test("the machine filter uses a supplied matcher with the state and folder filters", () => {
  const s = compileSearch("dev|builder", { regex: true });
  const got = filterMachines(machines, { matcher: s.test, state: "stopped", folder: "Lab" });
  assert.deepEqual(got.map((m) => m.name), ["arm-builder"]);
});

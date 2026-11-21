import test from "node:test";
import assert from "node:assert/strict";
import { compileSearch } from "../public/search-pattern.js";
import { searchEverywhere, snippet } from "../public/search-everywhere.js";

const storage = {
  disks: [
    { name: "system.qcow2", machineName: "debian-13-dev", machineId: "a", format: "qcow2" },
    { name: "data.raw", machineName: "win11-test", machineId: "b", format: "raw" },
  ],
  isos: [{ name: "debian-13.1-amd64-netinst.iso" }, { name: "Win11_24H2.iso" }],
};
const docs = [
  { title: "Create and start a machine", text: "Create and start a machine Upload a trusted ISO in Storage, if installing an OS." },
  { title: "Back up with snapshots", text: "Back up with snapshots Take a snapshot before risky changes." },
];

test("plain text finds disks by machine, ISOs by name and help articles by text", () => {
  const r = searchEverywhere(compileSearch("debian"), { storage, docs });
  assert.deepEqual(r.disks.map((d) => d.name), ["system.qcow2"]);
  assert.deepEqual(r.isos.map((i) => i.name), ["debian-13.1-amd64-netinst.iso"]);
  assert.equal(r.articles.length, 0);
  const iso = searchEverywhere(compileSearch("trusted iso"), { storage, docs });
  assert.deepEqual(iso.articles.map((a) => a.index), [0]);
  assert.equal(iso.articles[0].snippet.hit.toLowerCase(), "trusted iso");
  assert.equal(iso.articles[0].field, "text");
});

test("a regular expression with flags searches the same lists", () => {
  const r = searchEverywhere(compileSearch("^win\\d+", { regex: true, flags: { i: true } }), { storage, docs });
  assert.deepEqual(r.disks.map((d) => d.name), ["data.raw"]);
  assert.deepEqual(r.isos.map((i) => i.name), ["Win11_24H2.iso"]);
  const cased = searchEverywhere(compileSearch("^win\\d+", { regex: true, flags: { i: false } }), { storage, docs });
  assert.deepEqual(cased.isos, []);
  assert.equal(searchEverywhere(compileSearch("(", { regex: true }), { storage, docs }), null);
  assert.equal(searchEverywhere(compileSearch(""), { storage, docs }), null);
});

test("storage not loaded yet is reported, and snippets trim long text around the hit", () => {
  const r = searchEverywhere(compileSearch("snapshot"), { storage: null, docs });
  assert.equal(r.storageKnown, false);
  assert.equal(r.articles.length, 1);
  const s = snippet("x".repeat(100) + "HIT" + "y".repeat(100), [100, 103]);
  assert.equal(s.hit, "HIT");
  assert.equal(s.before.length, 48);
  assert.ok(s.cutStart && s.cutEnd);
});

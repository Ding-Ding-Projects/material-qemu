import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.mjs";
import { removeMachine, restoreMachine } from "../server/machine-records.mjs";
import { normalizeTags, updateOrganization } from "../server/organization.mjs";
const machine = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Retained fixture",
  arch: "x86_64",
  memory: 128,
  cpus: 1,
  diskGiB: 1,
  folder: "Work",
  network: "none",
  tags: ["work"],
};
test("removal is reversible and retains complete machine definition through reload", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-retained-"));
  try {
    const store = await new Store(dir).open();
    await store.transaction((s) => {
      s.folders.push("Work");
      s.machines.push({ ...machine });
    });
    await store.transaction((s) =>
      removeMachine(
        s,
        machine.id,
        { confirmName: machine.name, retainDisk: true },
        "stopped",
      ),
    );
    const reloaded = await new Store(dir).open();
    assert.equal(reloaded.state.machines.length, 0);
    assert.equal(reloaded.state.removedMachines[0].diskRetained, true);
    assert.deepEqual(reloaded.state.removedMachines[0].tags, ["work"]);
    await reloaded.transaction((s) => restoreMachine(s, machine.id));
    assert.deepEqual(reloaded.state.machines, [machine]);
    assert.deepEqual(reloaded.state.removedMachines, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("running, paused and unconfirmed removal leave the record untouched", () => {
  const s = {
    machines: [structuredClone(machine)],
    folders: ["Work"],
    events: [],
  };
  for (const runtime of ["running", "paused", "starting"])
    assert.throws(
      () =>
        removeMachine(
          s,
          machine.id,
          { confirmName: machine.name, retainDisk: true },
          runtime,
        ),
      /Stop/,
    );
  assert.throws(() =>
    removeMachine(
      s,
      machine.id,
      { confirmName: "Wrong", retainDisk: true },
      "stopped",
    ),
  );
  assert.throws(() =>
    removeMachine(
      s,
      machine.id,
      { confirmName: machine.name, retainDisk: false },
      "stopped",
    ),
  );
  assert.deepEqual(s.machines, [machine]);
  assert.equal(s.removedMachines, undefined);
});
test("tags are bounded and collapsed folders follow safe rename/removal", () => {
  assert.deepEqual(normalizeTags("work, gpu, work"), ["work", "gpu"]);
  for (const value of [
    Array(17).fill("tag"),
    ["x".repeat(33)],
    ["bad\nvalue"],
    [{}],
  ])
    assert.throws(() => normalizeTags(value));
  const state = {
    settings: { collapsedFolders: ["Work", ""] },
    folders: ["Work"],
    machines: [],
    views: [],
    events: [],
  };
  updateOrganization(state, { renameFolder: { from: "Work", to: "Lab" } });
  assert.deepEqual(state.settings.collapsedFolders, ["Lab", ""]);
  updateOrganization(state, {
    deleteFolder: { name: "Lab", confirmName: "Lab", mode: "unfiled" },
  });
  assert.deepEqual(state.settings.collapsedFolders, [""]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.mjs";
import { updateOrganization, requireFolder } from "../server/organization.mjs";

async function fixture(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mq-organization-"));
  try {
    const store = await new Store(directory).open();
    await run(store, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const machine = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Retained machine",
  arch: "x86_64",
  memory: 512,
  cpus: 1,
  diskGiB: 5,
  folder: "Work",
  network: "none",
};

test("folder rename and removal persist while preserving machines and view references", () =>
  fixture(async (store, directory) => {
    await store.transaction((state) => {
      updateOrganization(state, { folder: "Work" });
      state.machines.push({ ...machine });
      updateOrganization(state, {
        view: {
          name: "Work running",
          query: "Retained",
          state: "running",
          folder: "Work",
        },
      });
    });
    await store.transaction((state) =>
      updateOrganization(state, { renameFolder: { from: "Work", to: "Lab" } }),
    );
    let reloaded = await new Store(directory).open();
    assert.deepEqual(reloaded.state.folders, ["Lab"]);
    assert.equal(reloaded.state.machines[0].folder, "Lab");
    assert.equal(reloaded.state.views[0].folder, "Lab");
    await store.transaction((state) =>
      updateOrganization(state, {
        deleteFolder: { name: "Lab", confirmName: "Lab", mode: "unfiled" },
      }),
    );
    reloaded = await new Store(directory).open();
    assert.equal(reloaded.state.machines.length, 1);
    assert.equal(reloaded.state.machines[0].diskGiB, 5);
    assert.equal(reloaded.state.machines[0].folder, "");
    assert.equal(reloaded.state.views[0].folder, "");
    assert.deepEqual(reloaded.state.folders, []);
  }));
test("invalid folder operations fail atomically and cannot orphan assignments", () =>
  fixture(async (store, directory) => {
    await store.transaction((state) => {
      updateOrganization(state, { folder: "Work" });
      updateOrganization(state, { folder: "Other" });
      state.machines.push({ ...machine });
    });
    for (const body of [
      { folder: " " },
      { folder: "Work" },
      { folder: "bad\nname" },
      { renameFolder: { from: "Missing", to: "New" } },
      { renameFolder: { from: "Work", to: "Other" } },
      { deleteFolder: { name: "Work", confirmName: "Wrong", mode: "unfiled" } },
      {
        deleteFolder: {
          name: "Work",
          confirmName: "Work",
          mode: "delete-machines",
        },
      },
      {
        folder: "Atomic new",
        deleteFolder: { name: "Work", confirmName: "Wrong", mode: "unfiled" },
      },
    ])
      await assert.rejects(
        store.transaction((state) => updateOrganization(state, body)),
      );
    const reloaded = await new Store(directory).open();
    assert.deepEqual(reloaded.state.folders, ["Work", "Other"]);
    assert.deepEqual(reloaded.state.machines, [machine]);
    assert.throws(() => requireFolder(reloaded.state, "Missing"));
    assert.doesNotThrow(() => requireFolder(reloaded.state, ""));
  }));
test("saved view deletion persists without deleting machines or changing another view", () =>
  fixture(async (store, directory) => {
    await store.transaction((state) => {
      updateOrganization(state, { folder: "Work" });
      state.machines.push({ ...machine });
      updateOrganization(state, {
        view: { name: "One", query: "Retained", state: "all", folder: "Work" },
      });
      updateOrganization(state, {
        view: { name: "Two", query: "", state: "favourites", folder: "" },
      });
    });
    const [one, two] = store.state.views;
    await store.transaction((state) =>
      updateOrganization(state, { deleteView: one.id }),
    );
    const reloaded = await new Store(directory).open();
    assert.deepEqual(reloaded.state.views, [two]);
    assert.deepEqual(reloaded.state.machines, [machine]);
    assert.deepEqual(reloaded.state.folders, ["Work"]);
    await assert.rejects(
      store.transaction((state) =>
        updateOrganization(state, { deleteView: one.id }),
      ),
      /no longer exists/,
    );
    for (const view of [
      { name: "Two", query: "", state: "all" },
      { name: "", query: "", state: "all" },
      { name: "Invalid", query: "x".repeat(201), state: "all" },
      { name: "Invalid", query: "", state: "unknown" },
      { name: "Invalid", query: "", state: "all", folder: "Missing" },
    ])
      await assert.rejects(
        store.transaction((state) => updateOrganization(state, { view })),
      );
    assert.deepEqual(store.state.views, [two]);
  }));

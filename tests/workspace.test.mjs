import test from "node:test";
import assert from "node:assert/strict";
import {
  syncTabs,
  activateTab,
  closeTab,
  pinTab,
  openAllTabs,
} from "../public/workspace-tabs.js";
import { commandInventory, searchCommands } from "../public/commands.js";
test("workspace destinations open once, retain explicit closes and add new destinations", () => {
  let state = syncTabs(null, ["overview", "machines"]);
  assert.deepEqual(state.open, ["overview", "machines"]);
  state = closeTab(state, "machines").state;
  state = syncTabs(state, ["overview", "machines", "settings"]);
  assert.deepEqual(state.open, ["overview", "settings"]);
  state = activateTab(state, "machines");
  state = activateTab(state, "machines");
  assert.equal(state.open.filter((id) => id === "machines").length, 1);
});
test("pin/last-tab boundaries preserve navigation and Open every tab restores closed destinations", () => {
  let state = syncTabs(null, ["overview", "machines"]);
  assert.equal(closeTab(state, "overview").error, "pinned");
  state = pinTab(state, "overview");
  state = closeTab(state, "overview").state;
  assert.equal(closeTab(state, "machines").error, "last");
  state = openAllTabs(state, ["overview", "machines"]);
  assert.deepEqual(state.open, ["overview", "machines"]);
  assert.deepEqual(state.closed, []);
});
test("command inventory contains actual machine and settings controls with independent search", () => {
  const state = {
    owner: { passkeys: 0 },
    machines: [
      { id: "fixture", name: "Lab machine", arch: "x86_64", state: "running" },
    ],
  };
  const entries = commandInventory(state, (en) => en);
  assert.ok(entries.some((entry) => entry.id === "setting:theme"));
  assert.ok(
    entries.some((entry) => entry.action === "lifecycle:fixture:shutdown"),
  );
  assert.ok(entries.find((entry) => entry.id === "password-mode").unavailable);
  assert.ok(searchCommands(entries, "lab machine").length > 4);
  assert.equal(searchCommands(entries, "does not exist").length, 0);
});

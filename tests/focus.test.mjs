import test from "node:test";
import assert from "node:assert/strict";
import { rememberFocus, restoreFocus } from "../public/focus.js";
test("live refresh restores the same occurrence of a duplicated action", () => {
  const previous = globalThis.CSS;
  globalThis.CSS = { escape: (value) => value };
  try {
    const oldFirst = { dataset: { action: "console:fixture" } },
      oldSecond = {
        dataset: { action: "console:fixture" },
        isConnected: false,
      };
    const before = {
      activeElement: oldSecond,
      body: {},
      querySelectorAll: () => [oldFirst, oldSecond],
    };
    const snapshot = rememberFocus(before);
    let focused = "";
    const after = {
      querySelectorAll: () => [
        { focus: () => (focused = "first") },
        { focus: () => (focused = "second") },
      ],
      querySelector: () => null,
    };
    restoreFocus(snapshot, after);
    assert.equal(focused, "second");
  } finally {
    globalThis.CSS = previous;
  }
});
test("disappearing or disabled controls fall back to the main workspace", () => {
  let focused = 0;
  const main = { focus: () => focused++ };
  const doc = { querySelectorAll: () => [], querySelector: () => main };
  restoreFocus(
    { node: { isConnected: false }, selector: "#gone", index: 0 },
    doc,
  );
  assert.equal(focused, 1);
  doc.querySelectorAll = () => [
    {
      disabled: true,
      focus: () => {
        throw new Error("disabled target");
      },
    },
  ];
  restoreFocus(
    { node: { isConnected: false }, selector: "#disabled", index: 0 },
    doc,
  );
  assert.equal(focused, 2);
});
test("refresh leaves a still-connected interactive element alone", () => {
  restoreFocus(
    { node: { isConnected: true } },
    {
      querySelectorAll: () => {
        throw new Error("Focus should not move.");
      },
    },
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  createGate,
  toggleKey,
  slide,
  release,
  cancel,
  isDone,
} from "../public/confirm-gate.js";

test("the slider stays at zero until both keys are on", () => {
  let gate = createGate();
  assert.equal(slide(gate, 80).value, 0);
  gate = toggleKey(gate, 0);
  assert.equal(gate.phase, "locked");
  assert.equal(slide(gate, 80).value, 0);
  gate = toggleKey(gate, 1);
  assert.equal(gate.phase, "armed");
  assert.equal(slide(gate, 40).phase, "sliding");
});
test("only a full-range slide completes, and releasing early snaps back", () => {
  let gate = toggleKey(toggleKey(createGate(), 0), 1);
  gate = slide(gate, 99);
  assert.equal(isDone(gate), false);
  gate = release(gate);
  assert.equal(gate.value, 0);
  assert.equal(gate.phase, "armed");
  gate = slide(gate, 100);
  assert.equal(isDone(gate), true);
  assert.equal(release(gate).phase, "done");
});
test("turning a key off mid-slide relocks and clears progress", () => {
  let gate = slide(toggleKey(toggleKey(createGate(), 0), 1), 60);
  gate = toggleKey(gate, 1);
  assert.equal(gate.phase, "locked");
  assert.equal(gate.value, 0);
});
test("cancel wins until done and then everything is inert", () => {
  const armed = toggleKey(toggleKey(createGate(), 0), 1);
  const cancelled = cancel(armed);
  assert.equal(cancelled.phase, "cancelled");
  assert.equal(slide(cancelled, 100).phase, "cancelled");
  assert.equal(toggleKey(cancelled, 0).phase, "cancelled");
  const done = slide(armed, 100);
  assert.equal(cancel(done).phase, "done");
});
test("out of range and non numeric slider values are clamped", () => {
  const armed = toggleKey(toggleKey(createGate(), 0), 1);
  assert.equal(slide(armed, 400).value, 100);
  assert.equal(slide(armed, -5).value, 0);
  assert.equal(slide(armed, "x").value, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createReleaseChord } from "../public/input-release.js";

function press(chord, sequence) {
  let fired = 0;
  for (const [type, key] of sequence) if (chord[type]({ key }) === true) fired++;
  return fired;
}

test("Ctrl+Alt pressed and released alone releases input once", () => {
  let released = 0;
  const chord = createReleaseChord(() => released++);
  press(chord, [["keydown", "Control"], ["keydown", "Alt"], ["keyup", "Alt"], ["keyup", "Control"]]);
  assert.equal(released, 1);
  press(chord, [["keydown", "Alt"], ["keydown", "Control"], ["keyup", "Control"], ["keyup", "Alt"]]);
  assert.equal(released, 2);
});

test("Ctrl+Alt+Del and other combinations do not release input", () => {
  let released = 0;
  const chord = createReleaseChord(() => released++);
  press(chord, [["keydown", "Control"], ["keydown", "Alt"], ["keydown", "Delete"], ["keyup", "Delete"], ["keyup", "Alt"], ["keyup", "Control"]]);
  press(chord, [["keydown", "Control"], ["keydown", "Alt"], ["keydown", "F2"], ["keyup", "F2"], ["keyup", "Control"], ["keyup", "Alt"]]);
  press(chord, [["keydown", "Control"], ["keydown", "c"], ["keyup", "c"], ["keyup", "Control"]]);
  press(chord, [["keydown", "Alt"], ["keyup", "Alt"]]);
  assert.equal(released, 0);
});

test("a reset after the window loses focus forgets held keys", () => {
  let released = 0;
  const chord = createReleaseChord(() => released++);
  chord.keydown({ key: "Control" });
  chord.keydown({ key: "Alt" });
  chord.reset();
  chord.keyup({ key: "Alt" });
  chord.keyup({ key: "Control" });
  assert.equal(released, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { Sessions } from "../server/auth.mjs";
test("five unsuccessful attempts enforce a fifteen-minute cooldown", () => {
  let now = 100000;
  const sessions = new Sessions(() => now);
  for (let i = 0; i < 5; i++) {
    assert.equal(sessions.reserve("fixture"), true);
    sessions.finish("fixture", false);
  }
  assert.equal(sessions.allow("fixture"), false);
  now += 15 * 60 * 1000 - 1;
  assert.equal(sessions.allow("fixture"), false);
  now++;
  assert.equal(sessions.allow("fixture"), true);
});
test("in-flight verification is bounded and a success does not erase another pending failure", () => {
  const sessions = new Sessions(() => 1000);
  assert.equal(sessions.reserve("fixture"), true);
  assert.equal(sessions.reserve("fixture"), true);
  assert.equal(sessions.reserve("fixture"), false);
  sessions.finish("fixture", true);
  sessions.finish("fixture", false);
  assert.equal(sessions.failures.get("fixture").count, 1);
  assert.equal(sessions.inflight.size, 0);
  assert.equal(sessions.reserve("fixture"), true);
  sessions.finish("fixture", true);
  assert.equal(sessions.failures.has("fixture"), false);
});
test("pending fifth verification prevents a concurrent sixth attempt", () => {
  const sessions = new Sessions(() => 1000);
  for (let i = 0; i < 4; i++) sessions.failure("fixture");
  assert.equal(sessions.reserve("fixture"), true);
  assert.equal(sessions.reserve("fixture"), false);
  sessions.finish("fixture", false);
  assert.equal(sessions.allow("fixture"), false);
});

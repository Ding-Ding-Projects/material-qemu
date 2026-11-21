import test from "node:test";
import assert from "node:assert/strict";
import { explainPattern, findMatches, previewReplace, previewSplit, createLibrary } from "../public/regex-tools.js";

test("a pattern is explained token by token in order, with group depth", () => {
  const parts = explainPattern("^(?<os>debian|win)\\d{2,}?\\b[^ab]+$");
  assert.deepEqual(parts.map((p) => p.text), ["^", "(?<os>", "debian", "|", "win", ")", "\\d", "{2,}?", "\\b", "[^ab]", "+", "$"]);
  assert.match(parts[1].en, /group 1, named os/);
  assert.equal(parts[2].depth, 1);
  assert.match(parts[7].en, /2 or more times \(as few as possible\)/);
  assert.match(parts[9].en, /any one character except: ab/);
  assert.ok(parts.every((p) => p.yue && p.yue.length));
});

test("look-arounds, back-references and escapes are named", () => {
  const parts = explainPattern("(a)(?=b)(?<!c)\\1\\x41\\u00e9");
  const texts = Object.fromEntries(parts.map((p) => [p.text, p.en]));
  assert.match(texts["(?="], /look-ahead/);
  assert.match(texts["(?<!"], /negative look-behind/);
  assert.match(texts["\\1"], /same text as group 1/);
  assert.match(texts["\\x41"], /0x41/);
  assert.match(texts["\\u00e9"], /U\+00E9/);
});

test("a quantifier after literal text applies to the last character only", () => {
  assert.deepEqual(explainPattern("abc+").map((p) => p.text), ["ab", "c", "+"]);
});

test("matches carry positions and numbered and named groups", () => {
  const { matches } = findMatches("(?<name>\\w+)-(\\d+)", "", "web-01 db-2 x");
  assert.equal(matches.length, 2);
  assert.deepEqual(matches[0], { index: 0, end: 6, text: "web-01", groups: [{ number: 1, value: "web" }, { number: 2, value: "01" }], named: { name: "web" } });
  assert.equal(matches[1].index, 7);
});

test("patterns that match empty text do not loop and the list is capped", () => {
  const { matches, truncated } = findMatches("x*", "", "abc");
  assert.equal(matches.length, 4);
  assert.equal(truncated, false);
  const capped = findMatches("", "", "a".repeat(50), 10);
  assert.equal(capped.matches.length, 10);
  assert.equal(capped.truncated, true);
});

test("replace and split previews", () => {
  assert.equal(previewReplace("(\\w+)@(\\w+)", "", "a@b c@d", "$2 at $1"), "b at a d at c");
  assert.equal(previewReplace("(?<n>\\d)", "", "x1y2", "[$<n>]"), "x[1]y[2]");
  assert.deepEqual(previewSplit("\\s*,\\s*", "g", "a , b,c"), ["a", "b", "c"]);
});

test("the library saves, replaces by name, survives a reload and rejects bad patterns", () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const lib = createLibrary(storage);
  lib.add("Debian or Windows", "^(debian|win)", "i");
  lib.add("Debian or Windows", "^(debian|windows)", "i");
  assert.equal(lib.list().length, 1);
  assert.equal(createLibrary(storage).list()[0].pattern, "^(debian|windows)");
  assert.throws(() => lib.add("broken", "(", ""), /Invalid regular expression/);
  assert.throws(() => lib.add("", "a"), /Give the pattern a name/);
  lib.remove("Debian or Windows");
  assert.equal(createLibrary(storage).list().length, 0);
});

test("the runner stops a worker that runs past its time limit", async () => {
  const { runBounded } = await import("../public/regex-runner.js");
  let terminated = false;
  class SlowWorker { constructor() {} postMessage() {} terminate() { terminated = true; } }
  const slow = await runBounded("findMatches", ["(a+)+$", "", "aaaa!"], { limit: 50, Worker: SlowWorker, url: "x" });
  assert.equal(slow.timedOut, true);
  assert.equal(terminated, true);
  class FastWorker { postMessage(msg) { setTimeout(() => this.onmessage({ data: { id: msg.id, ok: true, result: 42 } }), 5); } terminate() {} }
  assert.deepEqual(await runBounded("findMatches", [], { Worker: FastWorker, url: "x" }), { id: 1, ok: true, result: 42 });
  assert.equal((await runBounded("findMatches", [], { Worker: undefined, url: "x" })).unavailable, true);
});

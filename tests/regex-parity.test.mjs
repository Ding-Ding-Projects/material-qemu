import test from "node:test";
import assert from "node:assert/strict";
import { debugMatch, parseRegex } from "../public/regex-debug.js";
import { flavourReport, generateCode, searchFiles, replaceFiles, LANGUAGES } from "../public/regex-convert.js";

test("replacing in files matches String.replace, counts hits and lists changed lines", () => {
  const files = [
    { name: "a.conf", text: "port=80\r\nhost=a\r\nport=8080\r\n" },
    { name: "b.conf", text: "nothing" },
  ];
  const [a, b] = replaceFiles("^port=(?<n>\\d+)$", "m", files, "port=$<n>0");
  assert.equal(a.text, "port=800\r\nhost=a\r\nport=80800\r\n");
  assert.equal(a.count, 2);
  assert.deepEqual(a.changed, [{ line: 1, before: "port=80", after: "port=800" }, { line: 3, before: "port=8080", after: "port=80800" }]);
  assert.equal(b.count, 0);
  assert.equal(b.text, "nothing");
  // Look-arounds behave exactly as in the real engine.
  assert.equal(replaceFiles("(?<=a)b", "", [{ name: "x", text: "ab cb ab" }], "B")[0].text, "aB cb aB");
  const joined = replaceFiles("\\n", "", [{ name: "x", text: "1\n2\n3" }], ",")[0];
  assert.equal(joined.text, "1,2,3");
  assert.equal(joined.linesChanged, true);
});

// The debugger must find the same first match as the real engine.
const agree = [
  ["^(?<os>debian|win)\\w*", "im", "x\nwin11-test"],
  ["a+?b", "", "caaab"],
  ["(a|ab)(c|bcd)(d*)", "", "abcd"],
  ["\\b\\d{2,3}\\b", "", "1 22 4444 333"],
  ["(\\w)\\1", "i", "abBa"],
  ["x(?=y)", "", "xz xy"],
  ["x(?!y)", "", "xy xz"],
  ["[^a-c]+", "", "abcdef"],
  ["colou?r", "i", "The COLOR"],
  ["(a*)*b", "", "aaab"],
  [".+", "s", "a\nb"],
  ["^$", "m", "a\n\nb"],
  ["(?:ab){2}", "", "ababab"],
  ["[\\d-]+", "", "ab12-3c"],
  ["(?<y>\\d{4})-\\k<y>", "", "2026-2026"],
  ["nope", "", "nothing here"],
];
for (const [src, flags, text] of agree) {
  test(`debugger agrees with the real engine on /${src}/${flags}`, () => {
    const real = new RegExp(src, flags).exec(text);
    const dbg = debugMatch(src, flags, text);
    assert.equal(dbg.ok, true);
    if (!real) return assert.equal(dbg.match, null);
    assert.equal(dbg.match.index, real.index);
    assert.equal(dbg.match.text, real[0]);
    assert.deepEqual(dbg.match.groups, real.slice(1).map((g) => g ?? null));
  });
}

test("the trace records tries, failures and backtracking in order", () => {
  const r = debugMatch("a+b", "", "aac");
  const kinds = new Set(r.trace.map((e) => e.kind));
  assert.ok(kinds.has("start") && kinds.has("try") && kinds.has("fail") && kinds.has("backtrack"));
  assert.equal(r.match, null);
  assert.ok(r.steps > 5);
  assert.ok(r.trace.every((e) => e.start <= e.end));
});

test("runaway patterns stop at the step limit and unsupported syntax is refused", () => {
  const r = debugMatch("(a+)+$", "", "a".repeat(28) + "!", { maxSteps: 5000 });
  assert.equal(r.aborted, true);
  assert.equal(debugMatch("(?<=a)b", "", "ab").unsupported, "look-behind");
  assert.match(debugMatch("(", "", "").error, /Unterminated group/);
  assert.match(debugMatch("*a", "", "").error, /Nothing to repeat/);
  assert.equal(parseRegex("(a)(?<n>b)").groupCount, 2);
});

test("flavour report flags real differences and converts named groups for Python", () => {
  const rows = Object.fromEntries(flavourReport("(?<y>\\d+)(?=x)\\k<y>").map((r) => [r.id, r]));
  assert.equal(rows.js.ok, true);
  assert.equal(rows.go.ok, false);
  assert.equal(rows.python.converted, "(?P<y>\\d+)(?=x)(?P=y)");
  assert.equal(rows.python.ok, true);
  assert.equal(flavourReport("(?<=a+)b").find((r) => r.id === "python").ok, false);
  assert.equal(flavourReport("\\p{L}", "").find((r) => r.id === "js").ok, false);
  assert.equal(flavourReport("\\p{L}", "u").find((r) => r.id === "js").ok, true);
});

test("generated code compiles the same pattern in each language", () => {
  for (const lang of LANGUAGES) assert.ok(generateCode("a\"b'c/d", "im", lang).length > 20, lang);
  const js = generateCode("a/b", "i", "JavaScript");
  const re = (0, eval)(js.split("\n")[0].replace("const re = ", "").replace(/;$/, ""));
  assert.equal(re.source, "a\\/b");
  assert.equal(re.flags, "gi");
  assert.ok(generateCode('say "hi"', "", "C#").includes('@"say ""hi"""'));
  assert.ok(generateCode("it's", "i", "PowerShell").includes("'it''s', 'IgnoreCase'"));
  assert.ok(generateCode("(?<n>x)", "", "Python").includes('re.compile(r"(?P<n>x)")'));
  assert.ok(generateCode("a`b", "s", "Go").includes('MustCompile("(?s)a`b")'));
  assert.ok(generateCode('a"b', "", "Java").includes('Pattern.compile("a\\"b")'));
});

test("file search lists matching lines with ranges and caps the result", () => {
  const r = searchFiles("err(or)?", "i", [{ name: "a.log", text: "ok\nERROR one\nerr two err\n" }, { name: "b.log", text: "fine" }]);
  assert.equal(r.total, 2);
  assert.deepEqual(r.files[0].lines.map((l) => l.line), [2, 3]);
  assert.deepEqual(r.files[0].lines[1].ranges, [[0, 3], [8, 11]]);
  assert.equal(r.files[1].count, 0);
  const many = searchFiles("x", "", [{ name: "x", text: "x\n".repeat(20) }], 5);
  assert.equal(many.files[0].lines.length, 5);
  assert.equal(many.truncated, true);
});

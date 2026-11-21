// Step-by-step regex debugger. A small backtracking matcher that follows the
// same order as JavaScript's engine and records every attempt, so each step
// can be shown: where in the text it is, which part of the pattern it tries,
// and whether that part matched, failed or was given up (backtracked).
// The Test tab always uses the browser's real engine; this is for watching.
// Look-behind and Unicode property escapes are refused rather than guessed.

class Unsupported extends Error {}

export function parseRegex(src) {
  let i = 0, groupCount = 0;
  const names = {};
  const fail = (msg) => { throw new SyntaxError(msg); };
  const node = (type, start, extra) => ({ type, start, end: i, ...extra });

  function parseAlt() {
    const start = i;
    const alts = [parseSeq()];
    while (src[i] === "|") { i++; alts.push(parseSeq()); }
    return alts.length > 1 ? node("alt", start, { alts }) : alts[0];
  }
  function parseSeq() {
    const start = i, items = [];
    while (i < src.length && src[i] !== "|" && src[i] !== ")") {
      const s = i;
      items.push(parseQuant(parseAtom(), s));
    }
    return node("seq", start, { items });
  }
  function escapeClass(c) {
    const d = [["0", "9"]], w = [["a", "z"], ["A", "Z"], ["0", "9"], ["_", "_"]];
    const s = [[" ", " "], ["\t", "\r"], [" ", " "], [" ", " "], ["﻿", "﻿"]];
    return { d: [d, false], D: [d, true], w: [w, false], W: [w, true], s: [s, false], S: [s, true] }[c];
  }
  function escapeChar() {
    // i points after the backslash
    const c = src[i];
    let m;
    if ((m = src.slice(i).match(/^x([0-9a-fA-F]{2})/))) { i += 3; return String.fromCharCode(parseInt(m[1], 16)); }
    if ((m = src.slice(i).match(/^u([0-9a-fA-F]{4})/))) { i += 5; return String.fromCharCode(parseInt(m[1], 16)); }
    i++;
    return { n: "\n", r: "\r", t: "\t", f: "\f", v: "\v", 0: "\0" }[c] ?? c;
  }
  function parseClass(start) {
    i++;
    const negate = src[i] === "^";
    if (negate) i++;
    const parts = [];
    let first = true;
    while (i < src.length && (src[i] !== "]" || first)) {
      first = false;
      let lo;
      if (src[i] === "\\") {
        i++;
        const cls = escapeClass(src[i]);
        if (cls) { parts.push({ set: cls[0], negate: cls[1] }); i++; continue; }
        if (src[i] === "p" || src[i] === "P") throw new Unsupported("Unicode property escapes");
        lo = src[i] === "b" ? (i++, "\b") : escapeChar();
      } else lo = src[i++];
      if (src[i] === "-" && src[i + 1] && src[i + 1] !== "]") {
        i++;
        const hi = src[i] === "\\" ? (i++, escapeChar()) : src[i++];
        if (hi < lo) fail("Range out of order in character class");
        parts.push({ set: [[lo, hi]], negate: false });
      } else parts.push({ set: [[lo, lo]], negate: false });
    }
    if (src[i] !== "]") fail("Unterminated character class");
    i++;
    return node("class", start, { parts, negate });
  }
  function parseAtom() {
    const start = i, c = src[i];
    if ("*+?".includes(c) || (c === "{" && /^\{\d+(,\d*)?\}/.test(src.slice(i)))) fail("Nothing to repeat");
    if (c === "(") {
      i++;
      let kind = "group", name = null, number = 0;
      if (src.startsWith("?:", i)) { kind = "nc"; i += 2; }
      else if (src.startsWith("?=", i)) { kind = "ahead"; i += 2; }
      else if (src.startsWith("?!", i)) { kind = "nahead"; i += 2; }
      else if (src.startsWith("?<=", i) || src.startsWith("?<!", i)) throw new Unsupported("look-behind");
      else if (src[i] === "?" && src[i + 1] === "<") {
        const m = src.slice(i).match(/^\?<([A-Za-z_$][\w$]*)>/);
        if (!m) fail("Invalid capture group name");
        name = m[1]; i += m[0].length;
      } else if (src[i] === "?") fail("Invalid group");
      if (kind === "group") { number = ++groupCount; if (name) names[name] = number; }
      const child = parseAlt();
      if (src[i] !== ")") fail("Unterminated group");
      i++;
      return node(kind, start, { child, number, name });
    }
    if (c === ")") fail("Unmatched ')'");
    if (c === "[") return parseClass(start);
    if (c === ".") { i++; return node("any", start); }
    if (c === "^") { i++; return node("bol", start); }
    if (c === "$") { i++; return node("eol", start); }
    if (c === "\\") {
      i++;
      const e = src[i];
      if (e === undefined) fail("\\ at end of pattern");
      const cls = escapeClass(e);
      if (cls) { i++; return node("class", start, { parts: [{ set: cls[0], negate: cls[1] }], negate: false }); }
      if (e === "b" || e === "B") { i++; return node(e === "b" ? "wordb" : "nwordb", start); }
      if (e === "p" || e === "P") throw new Unsupported("Unicode property escapes");
      let m;
      if ((m = src.slice(i).match(/^[1-9]\d*/))) { i += m[0].length; return node("backref", start, { ref: Number(m[0]) }); }
      if ((m = src.slice(i).match(/^k<([A-Za-z_$][\w$]*)>/))) { i += m[0].length; return node("backref", start, { refName: m[1] }); }
      return node("char", start, { ch: escapeChar() });
    }
    i++;
    return node("char", start, { ch: c });
  }
  function parseQuant(atom, start) {
    const rest = src.slice(i);
    const m = rest.match(/^(?:(\*)|(\+)|(\?)|\{(\d+)(?:(,)(\d*))?\})(\?)?/);
    if (!m) return atom;
    if (["bol", "eol", "wordb", "nwordb"].includes(atom.type)) fail("Nothing to repeat");
    i += m[0].length;
    let min, max;
    if (m[1]) [min, max] = [0, Infinity];
    else if (m[2]) [min, max] = [1, Infinity];
    else if (m[3]) [min, max] = [0, 1];
    else { min = Number(m[4]); max = m[5] ? (m[6] === "" ? Infinity : Number(m[6])) : min; }
    if (max < min) fail("numbers out of order in {} quantifier");
    return node("quant", start, { child: atom, min, max, lazy: Boolean(m[7]) });
  }

  const root = parseAlt();
  if (i < src.length) fail("Unmatched ')'");
  const resolve = (n) => {
    if (!n || typeof n !== "object") return;
    if (n.type === "backref" && n.refName) {
      if (!names[n.refName]) fail("Invalid named capture referenced");
      n.ref = names[n.refName];
    }
    for (const k of ["child"]) resolve(n[k]);
    (n.items || n.alts || []).forEach(resolve);
  };
  resolve(root);
  return { root, groupCount, names };
}

const isWord = (c) => c !== undefined && /\w/.test(c);
const isLineBreak = (c) => c === "\n" || c === "\r" || c === " " || c === " ";

// Returns { ok, steps, trace, match, truncated, aborted } or { ok: false, unsupported | error }.
// Each trace entry: { kind: "try"|"match"|"fail"|"backtrack"|"start"|"found", pos, start, end }.
export function debugMatch(source, flags, text, { maxSteps = 200000, maxTrace = 3000, maxText = 2000 } = {}) {
  let parsed;
  try { parsed = parseRegex(String(source)); }
  catch (error) {
    if (error instanceof Unsupported) return { ok: false, unsupported: error.message };
    return { ok: false, error: error.message };
  }
  const f = String(flags);
  const icase = f.includes("i"), multi = f.includes("m"), dotall = f.includes("s");
  const input = String(text).slice(0, maxText);
  const trace = [];
  let steps = 0, aborted = false;
  const record = (kind, pos, n) => {
    if (trace.length < maxTrace) trace.push({ kind, pos, start: n ? n.start : 0, end: n ? n.end : 0 });
  };
  const tick = () => { if (++steps > maxSteps) { aborted = true; throw new RangeError("steps"); } };
  const fold = (c) => (icase ? c.toLowerCase() : c);
  const inClass = (n, c) => {
    const hit = n.parts.some((p) => {
      const inside = p.set.some(([lo, hi]) => (c >= lo && c <= hi) || (icase && ((c.toLowerCase() >= lo.toLowerCase() && c.toLowerCase() <= hi.toLowerCase()) || (c.toUpperCase() >= lo && c.toUpperCase() <= hi))));
      return p.negate ? !inside : inside;
    });
    return n.negate ? !hit : hit;
  };
  let caps = [];

  function m(n, pos, k) {
    tick();
    switch (n.type) {
      case "seq": {
        const step = (idx, p) => (idx === n.items.length ? k(p) : m(n.items[idx], p, (q) => step(idx + 1, q)));
        return step(0, pos);
      }
      case "alt":
        for (const a of n.alts) {
          if (m(a, pos, k)) return true;
          record("backtrack", pos, a);
        }
        return false;
      case "char": case "any": case "class": {
        record("try", pos, n);
        const c = input[pos];
        const ok = c !== undefined && (n.type === "char" ? fold(c) === fold(n.ch) : n.type === "any" ? dotall || !isLineBreak(c) : inClass(n, c));
        record(ok ? "match" : "fail", ok ? pos + 1 : pos, n);
        return ok ? k(pos + 1) : false;
      }
      case "bol": case "eol": case "wordb": case "nwordb": {
        record("try", pos, n);
        const ok = n.type === "bol" ? pos === 0 || (multi && isLineBreak(input[pos - 1]))
          : n.type === "eol" ? pos === input.length || (multi && isLineBreak(input[pos]))
          : (isWord(input[pos - 1]) !== isWord(input[pos])) === (n.type === "wordb");
        record(ok ? "match" : "fail", pos, n);
        return ok ? k(pos) : false;
      }
      case "backref": {
        record("try", pos, n);
        const cap = caps[n.ref];
        const want = cap ? input.slice(cap[0], cap[1]) : "";
        const got = input.slice(pos, pos + want.length);
        const ok = got.length === want.length && fold(got) === fold(want);
        record(ok ? "match" : "fail", ok ? pos + want.length : pos, n);
        return ok ? k(pos + want.length) : false;
      }
      case "group":
        return m(n.child, pos, (p) => {
          const old = caps[n.number];
          caps[n.number] = [pos, p];
          if (k(p)) return true;
          caps[n.number] = old;
          return false;
        });
      case "nc":
        return m(n.child, pos, k);
      case "ahead": case "nahead": {
        record("try", pos, n);
        const saved = caps.slice();
        const hit = m(n.child, pos, () => true);
        if (n.type === "nahead") caps = saved;
        const ok = n.type === "ahead" ? hit : !hit;
        if (!ok) caps = saved;
        record(ok ? "match" : "fail", pos, n);
        if (ok && k(pos)) return true;
        caps = saved;
        return false;
      }
      case "quant": {
        const rep = (count, p) => {
          const more = () => count < n.max && m(n.child, p, (q) => (q === p && count >= n.min ? false : rep(count + 1, q)));
          if (n.lazy) {
            if (count >= n.min && k(p)) return true;
            if (more()) return true;
          } else {
            if (more()) return true;
            if (count >= n.min) {
              if (count > 0 || n.min === 0) record("backtrack", p, n);
              return k(p);
            }
          }
          return false;
        };
        return rep(0, pos);
      }
      default:
        return false;
    }
  }

  let match = null;
  try {
    for (let start = 0; start <= input.length && !match; start++) {
      record("start", start, null);
      caps = [];
      let end = -1;
      if (m(parsed.root, start, (p) => { end = p; return true; })) {
        match = { index: start, end, text: input.slice(start, end), groups: Array.from({ length: parsed.groupCount }, (_, g) => (caps[g + 1] ? input.slice(caps[g + 1][0], caps[g + 1][1]) : null)) };
        record("found", end, parsed.root);
      }
    }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    aborted = true; // step limit or recursion depth
  }
  return { ok: true, steps, trace, match, truncated: trace.length >= maxTrace, aborted, textCut: String(text).length > maxText };
}

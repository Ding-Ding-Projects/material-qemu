// Regular expression toolkit shared by every search with a builder: explain a
// pattern token by token, list matches with their groups, preview a replace or
// a split, and keep a library of saved patterns. JavaScript (ECMAScript) flavour.

// Explanations come as [English, Cantonese] pairs; callers choose the language.
const ESCAPES = {
  d: ["a digit 0–9", "一個數字 0–9"], D: ["any character except a digit", "數字以外的任何字元"],
  w: ["a word character (letter, digit or _)", "一個字詞字元（字母、數字或 _）"], W: ["any character except a word character", "字詞字元以外的任何字元"],
  s: ["whitespace (space, tab, line break…)", "空白（空格、定位、換行…）"], S: ["any character except whitespace", "空白以外的任何字元"],
  b: ["a word boundary", "字詞邊界"], B: ["a position that is not a word boundary", "非字詞邊界的位置"],
  n: ["a line feed", "換行字元"], r: ["a carriage return", "歸位字元"], t: ["a tab", "定位字元"], f: ["a form feed", "換頁字元"], v: ["a vertical tab", "垂直定位字元"], 0: ["the NUL character", "空字元"],
};

function quantifierText(q, lazy) {
  const tail = lazy ? [" (as few as possible)", "（盡量少）"] : [" (as many as possible)", "（盡量多）"];
  if (q === "*") return [`zero or more times${tail[0]}`, `零次或多次${tail[1]}`];
  if (q === "+") return [`one or more times${tail[0]}`, `一次或多次${tail[1]}`];
  if (q === "?") return [`optionally${lazy ? " (prefer none)" : ""}`, `可有可無${lazy ? "（優先沒有）" : ""}`];
  const m = q.match(/^\{(\d+)(,(\d*))?\}$/);
  if (!m) return [q, q];
  if (!m[2]) return [`exactly ${m[1]} times`, `剛好 ${m[1]} 次`];
  if (m[3] === "") return [`${m[1]} or more times${tail[0]}`, `${m[1]} 次或以上${tail[1]}`];
  return [`between ${m[1]} and ${m[3]} times${tail[0]}`, `${m[1]} 至 ${m[3]} 次${tail[1]}`];
}

// Returns [{ text, en, yue, depth }] in pattern order. Unknown constructs are
// described as literal text rather than guessed.
export function explainPattern(source) {
  const out = [];
  let depth = 0;
  let group = 0;
  const push = (text, [en, yue]) => out.push({ text, en, yue, depth });
  for (let i = 0; i < source.length; ) {
    const ch = source[i];
    const rest = source.slice(i);
    let m;
    if (ch === "\\") {
      const next = source[i + 1] ?? "";
      if ((m = rest.match(/^\\([1-9]\d*)/))) { push(m[0], [`the same text as group ${m[1]}`, `與第 ${m[1]} 組相同的文字`]); i += m[0].length; }
      else if ((m = rest.match(/^\\k<([A-Za-z_$][\w$]*)>/))) { push(m[0], [`the same text as the group named ${m[1]}`, `與名為 ${m[1]} 的組相同的文字`]); i += m[0].length; }
      else if ((m = rest.match(/^\\[pP]\{([^}]+)\}/))) { push(m[0], [`${m[0][1] === "P" ? "a character not in" : "a character in"} the Unicode property ${m[1]} (needs the u flag)`, `${m[0][1] === "P" ? "不屬於" : "屬於"} Unicode 屬性 ${m[1]} 的字元（需要 u 旗標）`]); i += m[0].length; }
      else if ((m = rest.match(/^\\x([0-9a-fA-F]{2})/))) { push(m[0], [`the character with code 0x${m[1]}`, `編碼為 0x${m[1]} 的字元`]); i += 4; }
      else if ((m = rest.match(/^\\u([0-9a-fA-F]{4})/))) { push(m[0], [`the character U+${m[1].toUpperCase()}`, `字元 U+${m[1].toUpperCase()}`]); i += 6; }
      else if (ESCAPES[next]) { push(`\\${next}`, ESCAPES[next]); i += 2; }
      else { push(`\\${next}`, [`the character “${next}”`, `字元「${next}」`]); i += 2; }
    } else if (ch === "[") {
      let j = i + 1;
      if (source[j] === "^") j++;
      if (source[j] === "]") j++;
      while (j < source.length && source[j] !== "]") j += source[j] === "\\" ? 2 : 1;
      const text = source.slice(i, j + 1);
      const negated = text[1] === "^";
      const body = text.slice(negated ? 2 : 1, -1);
      push(text, negated ? [`any one character except: ${body}`, `以下以外的任何一個字元：${body}`] : [`any one of: ${body}`, `以下任何一個：${body}`]);
      i = j + 1;
    } else if (ch === "(") {
      if ((m = rest.match(/^\(\?<([A-Za-z_$][\w$]*)>/))) { group++; push(m[0], [`start of group ${group}, named ${m[1]} (captured)`, `第 ${group} 組開始，名為 ${m[1]}（擷取）`]); i += m[0].length; }
      else if (rest.startsWith("(?:")) { push("(?:", ["start of a group that is not captured", "不擷取的群組開始"]); i += 3; }
      else if (rest.startsWith("(?=")) { push("(?=", ["start of a look-ahead: what follows must match", "前瞻開始：後面必須符合"]); i += 3; }
      else if (rest.startsWith("(?!")) { push("(?!", ["start of a negative look-ahead: what follows must not match", "否定前瞻開始：後面不可符合"]); i += 3; }
      else if (rest.startsWith("(?<=")) { push("(?<=", ["start of a look-behind: what comes before must match", "後顧開始：前面必須符合"]); i += 4; }
      else if (rest.startsWith("(?<!")) { push("(?<!", ["start of a negative look-behind: what comes before must not match", "否定後顧開始：前面不可符合"]); i += 4; }
      else { group++; push("(", [`start of group ${group} (captured)`, `第 ${group} 組開始（擷取）`]); i += 1; }
      depth++;
      continue;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
      push(")", ["end of group", "群組結束"]);
      i += 1;
      continue;
    } else if ((m = rest.match(/^(\*|\+|\?|\{\d+(,\d*)?\})(\?)?/)) && out.length) {
      push(m[0], quantifierText(m[1], Boolean(m[3])).map((s, k) => (k ? `前一項重複${s}` : `the previous item, ${s}`)));
      i += m[0].length;
    } else if (ch === "^") { push("^", ["start of the text (or of a line with the m flag)", "文字開頭（m 旗標時為行首）"]); i++; }
    else if (ch === "$") { push("$", ["end of the text (or of a line with the m flag)", "文字結尾（m 旗標時為行尾）"]); i++; }
    else if (ch === ".") { push(".", ["any character except a line break (including line breaks with the s flag)", "換行以外的任何字元（s 旗標時包括換行）"]); i++; }
    else if (ch === "|") { push("|", ["or: the alternative after this", "或：之後的另一選擇"]); i++; }
    else {
      let j = i;
      while (j < source.length && !/[\\[\]().|^$*+?{}]/.test(source[j])) j++;
      if (j === i) j = i + 1;
      // A quantifier after a literal run applies to its last character only.
      if (j - i > 1 && /^[*+?{]/.test(source[j] || "")) j--;
      const text = source.slice(i, j);
      push(text, [`the text “${text}”`, `文字「${text}」`]);
      i = j;
    }
  }
  return out;
}

export function compileRegex(source, flags = "") {
  const clean = [...new Set(String(flags).replace(/[^dgimsuy]/g, ""))].join("");
  return new RegExp(source, clean.includes("g") ? clean : `${clean}g`);
}

// All matches with positions and groups, capped so a pattern matching empty
// strings everywhere cannot produce an endless list.
export function findMatches(source, flags, text, limit = 1000) {
  const re = compileRegex(source, flags);
  const matches = [];
  let m;
  while ((m = re.exec(text)) && matches.length < limit) {
    matches.push({
      index: m.index,
      end: m.index + m[0].length,
      text: m[0],
      groups: m.slice(1).map((value, i) => ({ number: i + 1, value: value ?? null })),
      named: m.groups ? { ...m.groups } : {},
    });
    if (m[0] === "") re.lastIndex++;
  }
  return { matches, truncated: Boolean(m) };
}

export function previewReplace(source, flags, text, replacement) {
  return String(text).replace(compileRegex(source, flags), replacement);
}

export function previewSplit(source, flags, text, limit = 1000) {
  const clean = String(flags).replace(/[gy]/g, "");
  return String(text).split(new RegExp(source, clean), limit);
}

// Library of saved patterns, kept in this browser.
export function createLibrary(storage = globalThis.localStorage, key = "mq-regex-library") {
  let items = [];
  try { items = JSON.parse(storage?.getItem(key) || "[]").filter((p) => p && typeof p.pattern === "string" && typeof p.name === "string"); } catch { items = []; }
  const save = () => { try { storage?.setItem(key, JSON.stringify(items)); } catch { /* storage unavailable */ } };
  return {
    list: () => items.slice(),
    add(name, pattern, flags = "") {
      const n = String(name).trim().slice(0, 60), p = String(pattern);
      if (!n || !p) throw new Error("Give the pattern a name.");
      new RegExp(p, String(flags).replace(/[^dimsuy]/g, ""));
      items = [{ name: n, pattern: p.slice(0, 200), flags: String(flags).replace(/[^dimsuy]/g, ""), savedAt: new Date().toISOString() }, ...items.filter((x) => x.name !== n)].slice(0, 100);
      save();
      return items[0];
    },
    remove(name) { items = items.filter((x) => x.name !== name); save(); },
  };
}

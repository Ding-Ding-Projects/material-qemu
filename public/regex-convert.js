// Other regex flavours and code generation. The pattern is written in the
// JavaScript flavour; this lists what would behave differently or fail in
// other common engines, offers a converted pattern where a conversion is
// exact, and generates ready-to-paste code. Notes are [English, Cantonese].

export const FLAVOURS = [
  { id: "js", name: "JavaScript" },
  { id: "pcre", name: "PCRE (PHP, grep -P)" },
  { id: "python", name: "Python re" },
  { id: "dotnet", name: ".NET" },
  { id: "java", name: "Java" },
  { id: "go", name: "Go (RE2)" },
];

const has = (src, re) => re.test(src);

// Returns [{ id, name, ok, notes: [[en, yue]], converted }].
export function flavourReport(src, flags = "") {
  const named = has(src, /\(\?<[A-Za-z_$][\w$]*>/);
  const namedRef = has(src, /\\k<[A-Za-z_$][\w$]*>/);
  const behind = has(src, /\(\?<[=!]/);
  const ahead = has(src, /\(\?[=!]/);
  const backref = has(src, /\\[1-9]/) || namedRef;
  const prop = has(src, /\\[pP]\{/);
  const varBehind = /\(\?<[=!][^)]*([*+]|\{\d+,\})/.test(src);
  const lazy = has(src, /[*+?}]\?/);
  const u = flags.includes("u");
  const notes = {
    js: [],
    pcre: [],
    python: [],
    dotnet: [],
    java: [],
    go: [],
  };
  if (prop && !u) notes.js.push(["\\p{…} needs the u flag.", "\\p{…} 需要 u 旗標。"]);
  if (varBehind) {
    notes.pcre.push(["Look-behind must have a bounded length.", "後顧必須有固定或有限長度。"]);
    notes.python.push(["Look-behind must have a fixed length.", "後顧必須是固定長度。"]);
    notes.java.push(["Look-behind must have a bounded length.", "後顧必須有有限長度。"]);
  }
  if (named) notes.python.push(["Named groups are written (?P<name>…); the converted pattern does this.", "具名群組要寫成 (?P<name>…)；轉換後的樣式已處理。"]);
  if (namedRef) notes.python.push(["Named back-references are written (?P=name); the converted pattern does this.", "具名反向參照要寫成 (?P=name)；轉換後的樣式已處理。"]);
  if (prop) notes.python.push(["The re module has no \\p{…}; the third-party regex module does.", "re 模組沒有 \\p{…}；第三方 regex 模組有。"]);
  if (has(src, /\\d|\\w|\\b/)) {
    notes.dotnet.push(["\\d, \\w and \\b match Unicode digits and letters unless RegexOptions.ECMAScript is set.", "除非設定 RegexOptions.ECMAScript，否則 \\d、\\w、\\b 會配對 Unicode 數字和字母。"]);
    notes.python.push(["\\d and \\w match Unicode digits and letters in str patterns.", "str 樣式中 \\d 和 \\w 會配對 Unicode 數字和字母。"]);
  }
  if (has(src, /\$/) && !flags.includes("m")) {
    notes.python.push(["$ also matches before a final line break.", "$ 也會在最後的換行前配對。"]);
    notes.pcre.push(["$ also matches before a final line break (unless D is set).", "$ 也會在最後的換行前配對（除非設定 D）。"]);
    notes.java.push(["$ also matches before a final line break.", "$ 也會在最後的換行前配對。"]);
    notes.dotnet.push(["$ also matches before a final line break.", "$ 也會在最後的換行前配對。"]);
  }
  if (ahead || behind) notes.go.push(["RE2 has no look-ahead or look-behind.", "RE2 不支援前瞻或後顧。"]);
  if (backref) notes.go.push(["RE2 has no back-references.", "RE2 不支援反向參照。"]);
  if (lazy) { /* supported everywhere listed */ }
  if (named) notes.go.push(["Named groups (?<name>…) need Go 1.22 or later; (?P<name>…) works in all versions.", "具名群組 (?<name>…) 需要 Go 1.22 或以上；(?P<name>…) 所有版本都可用。"]);
  if (prop) notes.go.push(["\\p{…} works for Unicode categories and scripts only.", "\\p{…} 只支援 Unicode 類別和文字。"]);

  const fatal = { go: (ahead || behind || backref), python: prop || varBehind, pcre: varBehind, java: varBehind, js: prop && !u, dotnet: false };
  const python = src.replace(/\(\?<([A-Za-z_$][\w$]*)>/g, "(?P<$1>").replace(/\\k<([A-Za-z_$][\w$]*)>/g, "(?P=$1)");
  return FLAVOURS.map((fl) => ({
    ...fl,
    ok: !fatal[fl.id],
    notes: notes[fl.id],
    converted: fl.id === "python" && python !== src ? python : null,
  }));
}

export const LANGUAGES = ["JavaScript", "Python", "C#", "PowerShell", "Java", "Go"];

const jsonString = (s) => JSON.stringify(s);

// Returns a code snippet that compiles the pattern and lists every match.
export function generateCode(src, flags = "", language = "JavaScript") {
  const f = (c) => flags.includes(c);
  switch (language) {
    case "JavaScript": {
      const literal = src.replace(/\\\//g, "/").replace(/\//g, "\\/").replace(/\n/g, "\\n");
      return `const re = /${literal}/g${f("i") ? "i" : ""}${f("m") ? "m" : ""}${f("s") ? "s" : ""}${f("u") ? "u" : ""};\nfor (const m of text.matchAll(re)) {\n  console.log(m.index, m[0], m.groups);\n}`;
    }
    case "Python": {
      const py = src.replace(/\(\?<([A-Za-z_$][\w$]*)>/g, "(?P<$1>").replace(/\\k<([A-Za-z_$][\w$]*)>/g, "(?P=$1)");
      const opts = [f("i") && "re.IGNORECASE", f("m") && "re.MULTILINE", f("s") && "re.DOTALL"].filter(Boolean);
      let lit;
      if (!py.includes('"') && !py.endsWith("\\") && !py.includes("\n")) lit = `r"${py}"`;
      else if (!py.includes("'") && !py.endsWith("\\") && !py.includes("\n")) lit = `r'${py}'`;
      else lit = jsonString(py);
      return `import re\n\npattern = re.compile(${lit}${opts.length ? ", " + opts.join(" | ") : ""})\nfor m in pattern.finditer(text):\n    print(m.start(), m.group(0), m.groupdict())`;
    }
    case "C#": {
      const opts = [f("i") && "RegexOptions.IgnoreCase", f("m") && "RegexOptions.Multiline", f("s") && "RegexOptions.Singleline"].filter(Boolean);
      return `using System.Text.RegularExpressions;\n\nvar re = new Regex(@"${src.replace(/"/g, '""')}"${opts.length ? ", " + opts.join(" | ") : ""});\nforeach (Match m in re.Matches(text))\n{\n    Console.WriteLine($"{m.Index} {m.Value}");\n}`;
    }
    case "PowerShell": {
      const opts = [f("i") ? "IgnoreCase" : null, f("m") && "Multiline", f("s") && "Singleline"].filter(Boolean);
      return `$re = [regex]::new('${src.replace(/'/g, "''")}'${opts.length ? `, '${opts.join(", ")}'` : ""})\nforeach ($m in $re.Matches($text)) {\n    "{0} {1}" -f $m.Index, $m.Value\n}`;
    }
    case "Java": {
      const opts = [f("i") && "Pattern.CASE_INSENSITIVE", f("m") && "Pattern.MULTILINE", f("s") && "Pattern.DOTALL", f("u") && "Pattern.UNICODE_CASE"].filter(Boolean);
      return `import java.util.regex.*;\n\nPattern re = Pattern.compile(${jsonString(src)}${opts.length ? ", " + opts.join(" | ") : ""});\nMatcher m = re.matcher(text);\nwhile (m.find()) {\n    System.out.println(m.start() + " " + m.group());\n}`;
    }
    case "Go": {
      const inline = ["i", "m", "s"].filter(f).join("");
      const body = (inline ? `(?${inline})` : "") + src;
      const lit = body.includes("`") ? jsonString(body) : "`" + body + "`";
      return `import "regexp"\n\nre := regexp.MustCompile(${lit})\nfor _, loc := range re.FindAllStringIndex(text, -1) {\n\tfmt.Println(loc[0], text[loc[0]:loc[1]])\n}`;
    }
    default:
      throw new Error("Choose a supported language.");
  }
}

// Searches local files line by line. files: [{ name, text }].
// Returns { files: [{ name, lines: [{ line, text, ranges: [[s, e]] }], count }], total, truncated }.
export function searchFiles(src, flags, files, limit = 500) {
  const clean = [...new Set(String(flags).replace(/[^imsu]/g, ""))].join("") + "g";
  const re = new RegExp(src, clean);
  const out = [];
  let total = 0, truncated = false;
  for (const file of files) {
    const lines = [];
    let count = 0;
    String(file.text).split(/\r?\n/).forEach((text, idx) => {
      re.lastIndex = 0;
      const ranges = [];
      let m;
      while ((m = re.exec(text)) && ranges.length < 50) {
        ranges.push([m.index, m.index + m[0].length]);
        if (m[0] === "") re.lastIndex++;
      }
      if (!ranges.length) return;
      count += ranges.length;
      if (total < limit) lines.push({ line: idx + 1, text: text.slice(0, 400), ranges });
      else truncated = true;
      total++;
    });
    out.push({ name: file.name, lines, count });
  }
  return { files: out, total, truncated };
}

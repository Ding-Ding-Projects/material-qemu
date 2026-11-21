// Turns the header search into a machine matcher: plain text (case-insensitive
// substring) or a regular expression with chosen flags and fields. Patterns are
// bounded in length and checked before use, so an invalid one is reported
// instead of filtering everything out.
export const SEARCH_FIELDS = ["name", "notes", "folder", "tags", "arch"];
export const MAX_PATTERN = 200;

function fieldText(machine, fields) {
  const parts = {
    name: machine.name || "",
    notes: machine.notes || "",
    folder: machine.folder || "",
    tags: (machine.tags || []).join(" "),
    arch: machine.arch || "",
  };
  return fields.map((f) => parts[f]).join("\n");
}

export function compileSearch(text, { regex = false, flags = { i: true, m: false, s: false }, fields = SEARCH_FIELDS } = {}) {
  const source = String(text ?? "");
  const use = fields.filter((f) => SEARCH_FIELDS.includes(f));
  const scope = use.length ? use : SEARCH_FIELDS;
  if (!source) return { ok: true, active: false, test: () => true, span: () => null };
  if (source.length > MAX_PATTERN) return { ok: false, active: true, error: `Use at most ${MAX_PATTERN} characters.`, test: () => false, span: () => null };
  if (!regex) {
    const needle = source.toLowerCase();
    // span(text) gives the first [start, end] found in any text, for other searchable lists.
    const span = (value) => { const at = String(value).toLowerCase().indexOf(needle); return at < 0 ? null : [at, at + needle.length]; };
    return { ok: true, active: true, test: (m) => fieldText(m, scope).toLowerCase().includes(needle), span };
  }
  let re;
  try {
    re = new RegExp(source, `${flags.i ? "i" : ""}${flags.m ? "m" : ""}${flags.s ? "s" : ""}${flags.u ? "u" : ""}`);
  } catch (error) {
    return { ok: false, active: true, error: error.message.replace(/^Invalid regular expression: /, ""), test: () => false, span: () => null };
  }
  const span = (value) => { const m = re.exec(String(value)); return m ? [m.index, m.index + m[0].length] : null; };
  return { ok: true, active: true, regex: re, test: (m) => re.test(fieldText(m, scope)), span };
}

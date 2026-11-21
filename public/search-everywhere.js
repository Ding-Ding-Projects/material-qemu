// The header search also looks beyond machines: disk images and ISOs in the
// storage inventory, and the help articles. It uses the same matcher as the
// machine filter (plain text or the regular expression with its flags). Each
// result says which field matched and where, so the hit can be highlighted in
// place; long article text is trimmed to a snippet around the hit.

const SNIPPET = 48;

export function snippet(text, span) {
  const value = String(text);
  if (!span) return { before: value.slice(0, SNIPPET * 2), hit: "", after: "", cutStart: false, cutEnd: value.length > SNIPPET * 2 };
  const [a, b] = span;
  const from = Math.max(0, a - SNIPPET), to = Math.min(value.length, b + SNIPPET);
  return { before: value.slice(from, a), hit: value.slice(a, b), after: value.slice(b, to), cutStart: from > 0, cutEnd: to < value.length };
}

// search: result of compileSearch. storage: normalized storage or null.
// docs: [{ title, text }]. Returns null when the search is empty or invalid.
export function searchEverywhere(search, { storage = null, docs = [] } = {}, limit = 20) {
  if (!search?.ok || !search.active) return null;
  // Returns { field, span } for the first field that matches, in order.
  const first = (fields) => {
    for (const [field, value] of fields) {
      if (value == null || value === "") continue;
      const span = search.span(value);
      if (span) return { field, span };
    }
    return null;
  };
  const disks = [], isos = [], articles = [];
  for (const d of storage?.disks || []) {
    const hit = first([["name", d.name], ["machineName", d.machineName], ["format", d.format]]);
    if (hit && disks.length < limit) disks.push({ name: d.name, machineName: d.machineName, machineId: d.machineId, format: d.format, ...hit });
  }
  for (const i of storage?.isos || []) {
    const hit = first([["name", i.name]]);
    if (hit && isos.length < limit) isos.push({ name: i.name, ...hit });
  }
  docs.forEach((doc, index) => {
    const hit = first([["title", doc.title], ["text", doc.text]]);
    if (hit && articles.length < limit) articles.push({ index, title: doc.title, ...hit, ...(hit.field === "text" ? { snippet: snippet(doc.text, hit.span) } : {}) });
  });
  return { disks, isos, articles, storageKnown: Boolean(storage), total: disks.length + isos.length + articles.length };
}

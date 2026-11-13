const fields = [
  "name",
  "arch",
  "machineType",
  "accelerator",
  "cpus",
  "memory",
  "diskGiB",
  "network",
  "iso",
  "folder",
  "notes",
  "favourite",
  "preset",
  "startAfterCreate",
];
const key = (id) => (id ? `mq-machine-edit-draft:${id}` : "mq-machine-draft");
export function loadDraft(storage, id) {
  try {
    const raw = storage.getItem(key(id));
    if (!raw || raw.length > 32768) return null;
    const parsed = JSON.parse(raw);
    const record = parsed.version === 1 ? parsed : { step: 1, data: parsed };
    if (
      !record.data ||
      typeof record.data !== "object" ||
      !Number.isInteger(record.step) ||
      record.step < 1 ||
      record.step > 8
    )
      return null;
    const data = {};
    for (const field of fields)
      if (["string", "number", "boolean"].includes(typeof record.data[field]))
        data[field] = record.data[field];
    return { step: record.step, data };
  } catch {
    return null;
  }
}
export function saveDraft(storage, data, step, id) {
  const safe = {};
  for (const field of fields)
    if (["string", "number", "boolean"].includes(typeof data[field]))
      safe[field] = data[field];
  storage.setItem(key(id), JSON.stringify({ version: 1, step, data: safe }));
}
export function clearDraft(storage, id) {
  storage.removeItem(key(id));
}

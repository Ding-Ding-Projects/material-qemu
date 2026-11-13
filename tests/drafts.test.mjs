import test from "node:test";
import assert from "node:assert/strict";
import { loadDraft, saveDraft, clearDraft } from "../public/drafts.js";
const memory = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};
test("draft resumes the exact step and keeps new/edit state independent", () => {
  const storage = memory();
  saveDraft(
    storage,
    { name: "New machine", arch: "arm", memory: 512, unrelated: "drop" },
    5,
  );
  saveDraft(storage, { name: "Edit machine", memory: 1024 }, 3, "machine-id");
  assert.deepEqual(loadDraft(storage), {
    step: 5,
    data: { name: "New machine", arch: "arm", memory: 512 },
  });
  assert.equal(loadDraft(storage, "machine-id").step, 3);
  clearDraft(storage, "machine-id");
  assert.equal(loadDraft(storage, "machine-id"), null);
  assert.equal(loadDraft(storage).step, 5);
});
test("legacy drafts migrate while malformed and oversized records are ignored", () => {
  const storage = memory();
  storage.setItem(
    "mq-machine-draft",
    JSON.stringify({ name: "Legacy", memory: 256 }),
  );
  assert.equal(loadDraft(storage).step, 1);
  for (const value of [
    "{",
    "x".repeat(32769),
    JSON.stringify({ version: 1, step: 9, data: { name: "invalid" } }),
  ]) {
    storage.setItem("mq-machine-draft", value);
    assert.equal(loadDraft(storage), null);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { createNotificationLog, NOTIFICATION_LIMIT } from "../public/notifications.js";

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}

test("notifications are kept newest first with an unread count", () => {
  const log = createNotificationLog(memoryStorage());
  log.add("Machine started.", "2026-11-21T09:00:00Z");
  log.add("Snapshot saved.", "2026-11-21T09:01:00Z");
  assert.deepEqual(log.list().map((n) => n.message), ["Snapshot saved.", "Machine started."]);
  assert.equal(log.unread(), 2);
  log.markAllRead();
  assert.equal(log.unread(), 0);
  assert.equal(log.add("   "), null);
});

test("the log survives a reload, is capped and can be cleared", () => {
  const storage = memoryStorage();
  const first = createNotificationLog(storage);
  for (let i = 0; i < NOTIFICATION_LIMIT + 5; i++) first.add(`Message ${i}`);
  const again = createNotificationLog(storage);
  assert.equal(again.list().length, NOTIFICATION_LIMIT);
  assert.equal(again.list()[0].message, `Message ${NOTIFICATION_LIMIT + 4}`);
  const added = again.add("After reload");
  assert.ok(added.id > again.list()[1].id, "ids keep increasing after a reload");
  again.clear();
  assert.equal(createNotificationLog(storage).list().length, 0);
});

test("unreadable saved data starts an empty log", () => {
  const storage = memoryStorage();
  storage.setItem("mq-notifications", "{not json");
  assert.deepEqual(createNotificationLog(storage).list(), []);
  storage.setItem("mq-notifications", JSON.stringify([{ message: 1 }, { message: "ok", at: "x", id: 3 }]));
  assert.deepEqual(createNotificationLog(storage).list().map((n) => n.message), ["ok"]);
});

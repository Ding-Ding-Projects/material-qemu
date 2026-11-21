// Keeps the last notifications shown in this browser so they can be read again
// from the notifications center after the transient notice disappears.
export const NOTIFICATION_LIMIT = 50;

export function createNotificationLog(storage = globalThis.localStorage, key = "mq-notifications") {
  let items = [];
  try {
    const saved = JSON.parse(storage?.getItem(key) || "[]");
    if (Array.isArray(saved)) items = saved.filter((n) => n && typeof n.message === "string" && typeof n.at === "string").slice(0, NOTIFICATION_LIMIT);
  } catch {
    items = [];
  }
  const save = () => {
    try { storage?.setItem(key, JSON.stringify(items)); } catch { /* storage unavailable */ }
  };
  let next = items.reduce((n, i) => Math.max(n, Number(i.id) || 0), 0) + 1;
  return {
    add(message, at = new Date().toISOString()) {
      const text = String(message ?? "").trim().slice(0, 500);
      if (!text) return null;
      const item = { id: next++, at, message: text, read: false };
      items = [item, ...items].slice(0, NOTIFICATION_LIMIT);
      save();
      return item;
    },
    list: () => items.slice(),
    unread: () => items.filter((n) => !n.read).length,
    markAllRead() {
      items = items.map((n) => ({ ...n, read: true }));
      save();
    },
    clear() {
      items = [];
      save();
    },
  };
}

const bounded = (value) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item) => typeof item === "string" && item.length <= 100,
          ),
        ),
      ].slice(0, 512)
    : [];
export function readTabs(storage) {
  try {
    const raw = storage.getItem("mq-workspace-tabs");
    if (!raw || raw.length > 65536) return null;
    const value = JSON.parse(raw);
    return value.version === 1 ? value : null;
  } catch {
    return null;
  }
}
export function syncTabs(saved, available) {
  const allowed = new Set(available),
    closed = bounded(saved?.closed),
    known = [...new Set([...bounded(saved?.known), ...available])];
  const open = bounded(saved?.open).filter(
    (id) => allowed.has(id) && !closed.includes(id),
  );
  for (const id of available)
    if (!closed.includes(id) && !open.includes(id)) open.push(id);
  if (!open.length && available.length) {
    open.push(available[0]);
    const index = closed.indexOf(available[0]);
    if (index >= 0) closed.splice(index, 1);
  }
  return {
    version: 1,
    known,
    open,
    closed,
    pinned: bounded(saved ? saved.pinned : ["overview"]).filter((id) =>
      open.includes(id),
    ),
    active: open.includes(saved?.active) ? saved.active : open[0],
  };
}
export function activateTab(state, id) {
  if (!state.known.includes(id))
    throw new Error("Unknown workspace destination.");
  return {
    ...state,
    open: state.open.includes(id) ? state.open : [...state.open, id],
    closed: state.closed.filter((value) => value !== id),
    active: id,
  };
}
export function initialTab(state) {
  return state.open.includes(state.active) ? state.active : state.open[0];
}
export function closeTab(state, id) {
  if (state.pinned.includes(id)) return { state, error: "pinned" };
  if (state.open.length <= 1) return { state, error: "last" };
  return {
    state: {
      ...state,
      open: state.open.filter((value) => value !== id),
      closed: [...new Set([...state.closed, id])],
    },
    error: null,
  };
}
export function pinTab(state, id) {
  return {
    ...state,
    pinned: state.pinned.includes(id)
      ? state.pinned.filter((value) => value !== id)
      : [...state.pinned, id],
  };
}
export function openAllTabs(state, available) {
  return syncTabs(
    {
      ...state,
      open: available,
      closed: state.closed.filter((id) => !available.includes(id)),
    },
    available,
  );
}

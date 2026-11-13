import { randomUUID } from "node:crypto";
import { event } from "./store.mjs";

export function folderName(value) {
  if (typeof value !== "string") throw new Error("Folder name must be text.");
  const name = value.trim();
  if (!name || name.length > 80 || /[\x00-\x1f\x7f]/.test(name))
    throw new Error("Folder name must contain 1–80 printable characters.");
  return name;
}
export function requireFolder(state, name) {
  if (name && !state.folders.includes(name))
    throw new Error(
      "Selected folder no longer exists. Refresh and choose another folder.",
    );
}
export function updateOrganization(state, body) {
  if (Object.hasOwn(body, "folder")) {
    const name = folderName(body.folder);
    if (state.folders.includes(name))
      throw new Error("A folder with this name already exists.");
    if (state.folders.length >= 100) throw new Error("Folder limit reached.");
    state.folders.push(name);
    event(state, `Created folder ${name}.`);
  }
  if (body.renameFolder) {
    const from = folderName(body.renameFolder.from),
      to = folderName(body.renameFolder.to);
    requireFolder(state, from);
    if (from !== to && state.folders.includes(to))
      throw new Error("A folder with the new name already exists.");
    state.folders = state.folders.map((name) => (name === from ? to : name));
    for (const machine of state.machines)
      if (machine.folder === from) machine.folder = to;
    for (const view of state.views) if (view.folder === from) view.folder = to;
    event(
      state,
      `Renamed folder ${from} to ${to}; machine assignments retained.`,
    );
  }
  if (body.deleteFolder) {
    const name = folderName(body.deleteFolder.name);
    requireFolder(state, name);
    if (
      body.deleteFolder.mode !== "unfiled" ||
      body.deleteFolder.confirmName !== name
    )
      throw new Error(
        "Confirm the exact folder name and move its machines to Unfiled.",
      );
    state.folders = state.folders.filter((value) => value !== name);
    for (const machine of state.machines)
      if (machine.folder === name) machine.folder = "";
    for (const view of state.views) if (view.folder === name) view.folder = "";
    event(state, `Removed folder ${name}; machines retained in Unfiled.`);
  }
  if (body.view) {
    const name = folderName(body.view.name);
    if (state.views.some((v) => v.name === name))
      throw new Error("A saved view with this name already exists.");
    if (state.views.length >= 50) throw new Error("Saved view limit reached.");
    if (typeof body.view.query !== "string" || body.view.query.length > 200)
      throw new Error("Saved query must contain at most 200 characters.");
    if (
      ![
        "all",
        "running",
        "paused",
        "stopped",
        "favourites",
        "attention",
        "recent",
      ].includes(body.view.state)
    )
      throw new Error("Invalid saved view state.");
    const folder = body.view.folder || "";
    requireFolder(state, folder);
    state.views.push({
      id: randomUUID(),
      name,
      query: body.view.query,
      state: body.view.state,
      folder,
    });
    event(state, `Saved view ${name}.`);
  }
  if (body.deleteView) {
    const view = state.views.find((v) => v.id === body.deleteView);
    if (!view) throw new Error("Saved view no longer exists.");
    state.views = state.views.filter((v) => v.id !== body.deleteView);
    event(state, `Removed saved view ${view.name}; machines unchanged.`);
  }
}

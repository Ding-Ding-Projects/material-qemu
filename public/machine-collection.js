export function renderCollection({
  list,
  state,
  checked,
  t,
  escape,
  button,
  pill,
  enumLabel,
  machineCard,
}) {
  const groups = [...new Set([...state.folders,...list.map(machine=>machine.folder||""), ""])].filter((name) =>
    list.some((machine) => (machine.folder || "") === name),
  );
  return groups
    .map((name) => {
      const machines = list.filter(
          (machine) => (machine.folder || "") === name,
        ),
        collapsed = (state.settings.collapsedFolders || []).includes(name),
        title = name || t("Unfiled", "未分類"),
        id = `folder-group-${encodeURIComponent(name)}`;
      const body =
        state.settings.layout === "cards"
          ? `<div class="grid">${machines.map((machine) => machineCard(machine, true, checked.has(machine.id))).join("")}</div>`
          : `<div class="card table-wrap ${state.settings.layout}"><table><thead><tr><th>${t("Select", "選取")}</th><th>${t("Machine", "機器")}</th>${state.settings.columns.map((column) => `<th>${enumLabel(column)}</th>`).join("")}<th>${t("State", "狀態")}</th><th>${t("Actions", "操作")}</th></tr></thead><tbody>${machines.map((machine) => `<tr><td><input type="checkbox" aria-label="${t("Select", "選取")} ${escape(machine.name)}" data-check="${machine.id}" ${checked.has(machine.id) ? "checked" : ""}></td><td>${button(`details:${machine.id}`, escape(machine.name), "table-name")}<br><small>${escape((machine.tags || []).join(" · "))}</small></td>${state.settings.columns.map((column) => `<td>${column === "platform" ? machine.arch : column === "memory" ? machine.memory + " MiB" : machine.cpus + " vCPU"}</td>`).join("")}<td>${pill(machine)}</td><td>${button(`console:${machine.id}`, t("Console", "主控台"))}</td></tr>`).join("")}</tbody></table></div>`;
      return `<section class="machine-group"><div class="toolbar"><h3>${button(`toggle-folder:${encodeURIComponent(name)}`, `<span class="icon" aria-hidden="true">${collapsed ? "chevron_right" : "expand_more"}</span> ${escape(title)} (${machines.length})`, "ghost", `aria-expanded="${!collapsed}" aria-controls="${id}"`)}</h3><small>${machines.filter((machine) => machine.state === "running").length} ${t("running", "運行中")}</small></div><div id="${id}" ${collapsed ? "hidden" : ""}>${collapsed ? "" : body}</div></section>`;
    })
    .join("");
}

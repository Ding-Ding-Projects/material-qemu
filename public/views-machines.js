import { renderCollection } from "./machine-collection.js";
import { filterMachines } from "./machine-filter.js";

export function powerVerb(m) {
  return m.state === "stopped" || m.state === "error"
    ? "start"
    : m.state === "paused" || m.state === "prelaunch"
      ? "resume"
      : "pause";
}
export function createMachines(ctx) {
  const { state, t, label, escape, button, pill, enumLabel, thumbs } = ctx;
  const specOf = (m) => {
    const cpus = m.sockets ? m.sockets * m.cores * (m.threads || 1) : m.cpus;
    return `${escape(m.arch)} · ${escape((m.accelerator || "tcg").toUpperCase())} · ${cpus} vCPU · ${m.memory} MiB`;
  };
  function machineCard(m, selectable = false, checked = false) {
    const verb = powerVerb(m),
      verbText = t(
        verb === "start" ? "Start" : verb === "resume" ? "Resume" : "Pause",
        verb === "start" ? "啟動" : verb === "resume" ? "繼續" : "暫停",
      ),
      icon = verb === "start" ? "power_settings_new" : verb === "resume" ? "play_arrow" : "pause",
      showThumb = m.state === "running" && thumbs.enabled && !thumbs.failed.has(m.id);
    return `<article class="card machine" draggable="true" data-drag-machine="${m.id}" aria-roledescription="${escape(t("draggable machine", "可拖放的機器"))}">${selectable ? `<label class="select-box" title="${t("Select", "選取")} ${escape(m.name)}"><input type="checkbox" data-check="${m.id}" ${checked ? "checked" : ""} aria-label="${t("Select", "選取")} ${escape(m.name)}"></label>` : ""}<div class="preview ${m.state}">${showThumb ? `<img class="thumb" data-machine="${m.id}" alt="" src="/api/machines/${m.id}/screenshot?t=${thumbs.tick}">` : ""}${m.state === "running" ? `<span class="live"><span class="led"></span>${t("LIVE", "即時")}</span><span class="caption">${escape(m.name)}</span>` : `<span class="icon" aria-hidden="true">${m.state === "paused" ? "pause_circle" : m.state === "error" ? "error" : "bedtime"}</span>`}</div><div class="info"><div class="card-title"><h3>${escape(m.name)}</h3>${pill(m)}</div><p class="spec">${specOf(m)}</p>${m.state === "running" && m.usage ? `<p class="usage-line"><span class="icon" aria-hidden="true">speed</span>${m.usage.cpuPercent ?? "…"}% CPU · ${Math.round(m.usage.memoryBytes / 1048576)} MiB</p>` : ""}${m.error ? `<p class="error-text">${escape(m.error)}</p>` : ""}${(m.tags || []).length ? `<div class="tags">${m.tags.map((x) => `<span class="tag">${escape(x)}</span>`).join("")}</div>` : ""}<div class="card-foot">${button(`lifecycle:${m.id}:${verb}`, `<span class="icon" aria-hidden="true">${icon}</span>`, `power-btn ${m.state === "running" ? "on" : m.state === "paused" ? "paused" : "off"}`, `aria-label="${escape(verbText + " · " + m.name)}" title="${escape(verbText)}"`)}${button(`console:${m.id}`, label("console"), "grow")}${button(`details:${m.id}`, t("Details", "詳細資料"), "ghost")}</div></div></article>`;
  }
  const filtered = () =>
    filterMachines(state.machines, { query: ctx.query, matcher: ctx.searchMatcher, state: ctx.filter, folder: ctx.folder });
  function machines() {
    const { filter, folder } = ctx;
    return (
      ctx.heading(
        label("machines"),
        t("Organize your workspace. Keep the important machines close.", "整理工作區，重要機器隨手可用。"),
        button("new", `<span class="icon" aria-hidden="true">add</span>${label("new")}`, "primary"),
      ) +
      `<div class="toolbar"><div class="chips" role="group" aria-label="${t("Machine state filter", "機器狀態篩選")}">${["all", "favourites", "running", "paused", "stopped", "attention", "recent"].map((f) => button(`filter:${f}`, enumLabel(f), filter === f ? "selected" : "", `aria-pressed="${filter === f}"`)).join("")}</div><div class="actions">${filter === "recent" ? `<span class="muted">${t("Used in the last 7 days, newest first.", "最近七日使用，最新排先。")}</span>` : ""}${button("save-view", t("Save view", "儲存檢視"))}${button("page:storage", t("Import ISO", "匯入 ISO"))}${button("folder", t("New folder", "新增資料夾"))}${button("manage-folders", t("Manage folders", "管理資料夾"))}${button("removed-machines", t("Removed machines", "已移除機器") + ` (${(state.removedMachines || []).length})`)}${button("columns", t("Columns", "欄位"))}</div></div><div class="toolbar"><div class="chips">${button("folder-filter:", t("All folders", "所有資料夾"), folder ? "" : "selected")}${state.folders.map((f) => button(`folder-filter:${escape(f)}`, escape(f), folder === f ? "selected" : "")).join("")}${state.views.map((v) => `<span class="saved-view">${button(`view:${v.id}`, escape(v.name), "ghost")}${button(`delete-view:${v.id}`, `<span class="icon" aria-hidden="true">close</span>`, "icon-btn", `aria-label="${escape(t("Delete saved view: ", "刪除已儲存檢視：") + v.name)}"`)}</span>`).join("")}</div><div class="chips" role="group" aria-label="${t("Layout", "版面")}">${["cards", "list", "compact"].map((v) => button(`layout:${v}`, enumLabel(v), state.settings.layout === v ? "selected" : "", `aria-pressed="${state.settings.layout === v}"`)).join("")}</div></div><div id="machine-results">${machineResults()}</div><div id="search-elsewhere" aria-live="polite"></div>`
    );
  }
  function machineResults() {
    const list = filtered(),
      machine = state.machines.find((v) => v.id === ctx.selected),
      checked = ctx.checked;
    return `<div class="toolbar"><span class="muted">${t(`${list.length} ${list.length === 1 ? "machine" : "machines"}`, `${list.length} 部機器`)}</span><div class="actions"><span class="selected-count">${checked.size ? `${checked.size} ${t("selected", "已選取")}` : ""}</span>${button("select-all", t("Select visible", "選取可見機器"))}${checked.size ? button("clear-selected", t("Clear selection", "清除選取")) + button("bulk:start", t("Start selected", "啟動已選機器")) + button("bulk:pause", t("Pause selected", "暫停已選機器")) + button("bulk:shutdown", t("Shut down selected", "關閉已選機器")) + button("bulk-snapshot", t("Snapshot selected", "為已選機器建立快照")) + button("bulk-move", t("Move selected", "移動已選機器")) + button("bulk-remove", t("Remove selected", "移除已選機器"), "danger") : ""}</div></div><div class="${machine ? "split" : ""}"><div>${list.length ? renderCollection({ list, state, checked, t, escape, button, pill, enumLabel, machineCard }) : `<section class="card empty"><h2>${t("No matching machines", "沒有符合的機器")}</h2><p>${t("Try another search or create your first machine.", "試試另一個搜尋，或建立第一部機器。")}</p>${button("new", label("new"), "primary")}</section>`}</div>${machine ? details(machine) : ""}</div>`;
  }
  function details(m) {
    const disks = m.disks?.length ? m.disks.map((d) => `${d.name || "disk"} ${d.sizeGiB} GiB ${d.bus || ""}`).join(", ") : `${m.diskGiB} GiB`;
    return `<aside class="card details"><div class="card-title"><h2>${escape(m.name)}</h2>${button("details:", `<span class="icon" aria-hidden="true">close</span>`, "icon-btn", `aria-label="${t("Close", "關閉")}"`)}</div>${pill(m)}<dl style="margin-top:20px"><dt>${t("Architecture", "架構")}</dt><dd>${escape(m.arch)}</dd><dt>${t("Memory", "記憶體")}</dt><dd>${m.memory} MiB</dd><dt>CPU</dt><dd>${m.sockets ? `${m.sockets}·${m.cores}·${m.threads || 1}` : m.cpus}</dd><dt>${t("Disk", "磁碟")}</dt><dd>${escape(disks)}</dd><dt>${t("Folder", "資料夾")}</dt><dd>${escape(m.folder || "—")}</dd><dt>ISO</dt><dd>${escape((m.cdroms && m.cdroms.join(", ")) || m.iso || "—")}</dd><dt>${t("Tags", "標籤")}</dt><dd>${escape((m.tags || []).join(", ") || "—")}</dd></dl><p class="muted" style="margin-top:20px">${escape(m.notes)}</p><div class="actions">${button(`edit:${m.id}`, t("Edit machine", "編輯機器"))}${button(`move:${m.id}`, t("Move to folder", "移至資料夾"))}${button(`tags:${m.id}`, t("Edit tags", "編輯標籤"))}${button(`clone:${m.id}`, t("Clone", "複製"))}${button(`remove:${m.id}`, t("Remove machine", "移除機器"), "danger")}${button(`favourite:${m.id}`, m.favourite ? t("Remove favourite", "取消最愛") : t("Favourite", "加入最愛"))}${button(`console:${m.id}`, label("console"), "primary")}</div><p class="muted-line">${t("Hardware changes require a stopped machine. Favourites and folder organization can change while it runs.", "更改硬件前請先停止機器，最愛和資料夾分類可在運行時更改。")}</p></aside>`;
  }
  return { machineCard, filtered, machines, machineResults, details, specOf };
}

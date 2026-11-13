import { filterMachines } from "./machine-filter.js";
export function createViews(context) {
  const {
    state,
    session,
    page,
    query,
    filter,
    folder,
    selected,
    checked,
    t,
    label,
    escape,
    bytes,
    field,
    select,
    button,
    pill,
    enumLabel,
    consoleScale,
    consoleInput,
  } = context;
  function metrics() {
    const m = state.metrics;
    return `<div class="grid metrics">${[
      [
        t("Host CPU", "主機處理器"),
        m.cpuPercent === null ? t("Sampling…", "取樣中…") : `${m.cpuPercent}%`,
        `${m.cpuCount} ${t("logical processors", "邏輯處理器")}`,
        m.cpuPercent,
      ],
      [
        t("Memory", "記憶體"),
        bytes(m.memoryUsed),
        `${t("of", "共")} ${bytes(m.memoryTotal)}`,
        (100 * m.memoryUsed) / m.memoryTotal,
      ],
      [
        t("Machines", "機器"),
        state.machines.length,
        `${state.machines.filter((x) => x.state === "running").length} ${t("running", "運行中")}`,
        null,
      ],
      [
        t("Host uptime", "主機運行時間"),
        `${Math.floor(m.uptime / 3600)}h ${Math.floor((m.uptime % 3600) / 60)}m`,
        `${m.platform} · ${m.arch}`,
        null,
      ],
    ]
      .map(
        ([name, value, sub, amount]) =>
          `<section class="card"><div class="card-title"><h3>${name}</h3><span class="pill">${t("Live", "即時")}</span></div><div class="metric-value">${value}</div><p class="muted">${sub}</p>${amount !== null ? `<div class="meter"><span style="width:${Math.max(0, Math.min(100, amount || 0))}%"></span></div>` : ""}</section>`,
      )
      .join("")}</div>`;
  }
  function heading(title, description, actions = "") {
    return `<div class="crumb">${t("Workspace", "工作區")} / ${title}</div><div class="heading"><div><h1>${title}</h1><p>${description}</p></div><div class="actions">${actions}</div></div>`;
  }
  function overview() {
    return (
      heading(
        t("Everything at a glance", "一眼掌握所有狀態"),
        t(
          "Your host and machines, measured in real time.",
          "主機和機器狀態，全部即時量度。",
        ),
        button("new", `＋ ${label("new")}`, "primary"),
      ) +
      metrics() +
      `<div class="toolbar"><h2>${t("Machines", "機器")}</h2>${button("page:machines", t("View all machines", "查看所有機器"), "ghost")}</div>${state.machines.length ? `<div class="grid">${state.machines.slice(0, 6).map(machineCard).join("")}</div>` : empty()}<div class="grid lower"><section class="card"><h2>${t("Recent activity", "最近活動")}</h2>${eventList(5)}</section><section class="card"><h2>${t("Your host", "你的主機")}</h2><dl><dt>QEMU</dt><dd>${
        Object.entries(state.capabilities)
          .filter(([, c]) => c.available)
          .map(([a]) => a)
          .join(", ") || t("Unavailable", "未能使用")
      }</dd><dt>${t("Acceleration", "加速方式")}</dt><dd>TCG</dd><dt>${t("Connection", "連線")}</dt><dd>${escape(location.origin)}</dd><dt>${t("Disk and network rates", "磁碟及網絡速率")}</dt><dd>${t("Not collected", "尚未收集")}</dd></dl></section></div>`
    );
  }
  function empty() {
    return `<section class="card empty"><div class="empty-icon" aria-hidden="true"><span class="icon">computer</span></div><h2>${t("A home for your first machine", "為第一部機器安個家")}</h2><p>${t("Create a machine with a private virtual disk, choose your resources, then open its live console. No sample machines are shown.", "建立私人虛擬磁碟，選擇資源，再打開即時主控台。這裡不會顯示假機器。")}</p>${button("new", `＋ ${label("new")}`, "primary")}</section>`;
  }
  function machineCard(m) {
    return `<article class="card machine"><div class="preview ${m.state}">${m.state === "running" ? t("Live console available", "即時主控台可用") : escape(t(m.state, { stopped: "已停止", paused: "已暫停", error: "錯誤" }[m.state]))}</div><div class="info"><div class="card-title"><h3>${escape(m.name)}</h3>${pill(m)}</div><p class="spec">${escape(m.arch)} · ${escape(m.machineType || state.capabilities[m.arch]?.machine || "")} · ${escape((m.accelerator || "tcg").toUpperCase())} · ${m.cpus} vCPU · ${m.memory} MiB</p>${m.error ? `<p class="error-text">${escape(m.error)}</p>` : ""}<div class="actions">${button(`console:${m.id}`, label("console"))}${button(`lifecycle:${m.id}:${m.state === "stopped" ? "start" : m.state === "paused" ? "resume" : "pause"}`, t(m.state === "stopped" ? "Start" : m.state === "paused" ? "Resume" : "Pause", { stopped: "啟動", paused: "繼續" }[m.state] || "暫停"))}${button(`details:${m.id}`, t("Details", "詳細資料"), "ghost")}</div></div></article>`;
  }
  function filtered() {
    return filterMachines(state.machines, { query, state: filter, folder });
  }
  function machines() {
    return (
      heading(
        label("machines"),
        t(
          "Organize your workspace. Keep the important machines close.",
          "整理工作區，重要機器隨手可用。",
        ),
        button("new", `＋ ${label("new")}`, "primary"),
      ) +
      `<div class="toolbar"><div class="chips">${["all", "favourites", "running", "paused", "stopped", "attention", "recent"].map((f) => button(`filter:${f}`, enumLabel(f), filter === f ? "selected" : "")).join("")}</div><div class="actions">${filter === "recent" ? `<span class="muted">${t("Used in the last 7 days, newest first.", "最近七日使用，最新排先。")}</span>` : ""}${button("save-view", t("Save view", "儲存檢視"))}${button("folder", t("New folder", "新增資料夾"))}${button("manage-folders", t("Manage folders", "管理資料夾"))}${button("columns", t("Columns", "欄位"))}</div></div><div class="toolbar"><div class="chips">${button("folder-filter:", t("All folders", "所有資料夾"), folder ? "" : "selected")}${state.folders.map((f) => button(`folder-filter:${escape(f)}`, escape(f), folder === f ? "selected" : "")).join("")}${state.views.map((v) => `<span class="saved-view">${button(`view:${v.id}`, escape(v.name), "ghost")}${button(`delete-view:${v.id}`, t("Delete", "刪除"), "ghost", `aria-label="${escape(t("Delete saved view: ", "刪除已儲存檢視：") + v.name)}"`)}</span>`).join("")}</div><div class="chips">${["cards", "list", "compact"].map((v) => button(`layout:${v}`, enumLabel(v), state.settings.layout === v ? "selected" : "")).join("")}</div></div><div id="machine-results">${machineResults()}</div>`
    );
  }
  function machineResults() {
    const list = filtered();
    const m = state.machines.find((m) => m.id === selected);
    return `<div class="toolbar"><span class="muted">${t(`${list.length} ${list.length === 1 ? "machine" : "machines"}`, `${list.length} 部機器`)}</span><div class="actions"><span class="selected-count">${checked.size ? `${checked.size} ${t("selected", "已選取")}` : ""}</span>${button("select-all", t("Select visible", "選取可見機器"))}${checked.size ? button("bulk:start", t("Start selected", "啟動已選機器")) + button("bulk:pause", t("Pause selected", "暫停已選機器")) + button("bulk-move", t("Move selected", "移動已選機器")) : ""}</div></div><div class="${m ? "split" : ""}"><div>${!list.length ? `<section class="card empty"><h2>${t("No matching machines", "沒有符合的機器")}</h2><p>${t("Try another search or create your first machine.", "試試另一個搜尋，或建立第一部機器。")}</p>${button("new", label("new"), "primary")}</section>` : state.settings.layout === "cards" ? `<div class="grid">${list.map((m) => `<div><label class="check"><input type="checkbox" data-check="${m.id}" ${checked.has(m.id) ? "checked" : ""}>${t("Select", "選取")} ${escape(m.name)}</label>${machineCard(m)}</div>`).join("")}</div>` : `<div class="card table-wrap ${state.settings.layout}"><table><thead><tr><th>${t("Select", "選取")}</th><th>${t("Machine", "機器")}</th>${state.settings.columns.map((c) => `<th>${enumLabel(c)}</th>`).join("")}<th>${t("State", "狀態")}</th><th>${t("Actions", "操作")}</th></tr></thead><tbody>${list.map((m) => `<tr><td><input type="checkbox" aria-label="${t("Select", "選取")} ${escape(m.name)}" data-check="${m.id}" ${checked.has(m.id) ? "checked" : ""}></td><td>${button(`details:${m.id}`, escape(m.name), "table-name")}<br><small>${escape(m.folder || "")}</small></td>${state.settings.columns.map((c) => `<td>${c === "platform" ? m.arch : c === "memory" ? m.memory + " MiB" : m.cpus + " vCPU"}</td>`).join("")}<td>${pill(m)}</td><td>${button(`console:${m.id}`, label("console"))}</td></tr>`).join("")}</tbody></table></div>`}</div>${m ? details(m) : ""}</div>`;
  }
  function details(m) {
    return `<aside class="card details"><div class="card-title"><h2>${escape(m.name)}</h2>${button("details:", t("Close", "關閉"), "ghost")}</div>${pill(m)}<dl style="margin-top:20px"><dt>${t("Architecture", "架構")}</dt><dd>${m.arch}</dd><dt>${t("Memory", "記憶體")}</dt><dd>${m.memory} MiB</dd><dt>CPU</dt><dd>${m.cpus}</dd><dt>${t("Disk", "磁碟")}</dt><dd>${m.diskGiB} GiB</dd><dt>${t("Folder", "資料夾")}</dt><dd>${escape(m.folder || "—")}</dd><dt>ISO</dt><dd>${escape(m.iso || "—")}</dd></dl><p class="muted" style="margin-top:20px">${escape(m.notes)}</p><div class="actions">${button(`edit:${m.id}`, t("Edit machine", "編輯機器"))}${button(`move:${m.id}`, t("Move to folder", "移至資料夾"))}${button(`favourite:${m.id}`, m.favourite ? t("Remove favourite", "取消最愛") : t("Favourite", "加入最愛"))}${button(`console:${m.id}`, label("console"), "primary")}</div><p class="muted-line">${t("Hardware changes require a stopped machine. Favourites and folder organization can change while it runs.", "更改硬件前請先停止機器，最愛和資料夾分類可在運行時更改。")}</p></aside>`;
  }
  function settings() {
    return (
      heading(
        label("settings"),
        t(
          "Make this workspace yours. Changes are saved to your account.",
          "打造你的工作區，變更會儲存至帳戶。",
        ),
      ) +
      `<div class="settings-grid"><section class="card"><h2>${t("Appearance & language", "外觀與語言")}</h2>${select(
        "theme",
        t("Theme", "主題"),
        [
          ["dark", t("Dark", "深色")],
          ["light", t("Light", "淺色")],
          ["system", t("Follow device", "跟隨裝置")],
        ],
        state.settings.theme,
      )}${select(
        "language",
        t("Language", "語言"),
        [
          ["en", "English"],
          ["yue", "廣東話"],
          ["both", "English + 廣東話"],
        ],
        state.settings.language,
      )}<label class="check"><input id="motion" type="checkbox" ${state.settings.motion ? "checked" : ""}>${t("Interface motion", "介面動畫")}</label><p class="muted-line">${t("Your device’s reduced-motion preference always wins.", "裝置的減少動畫設定永遠優先。")}</p>${button("save-settings", t("Save preferences", "儲存偏好"), "primary")}</section><section class="card"><h2>${t("Account & access", "帳戶與存取")}</h2><p>${escape(state.owner.name)}</p><p class="muted">${state.owner.passkeys} ${t("registered passkeys", "個已登記通行密鑰")}</p>${button("register-passkey", t("Add a passkey", "新增通行密鑰"), "primary")}<p class="help">${t("Passkeys need HTTPS or localhost and a compatible browser. The password fallback remains enabled.", "通行密鑰需要 HTTPS 或 localhost，以及相容瀏覽器。密碼登入會保持可用。")}</p></section><section class="card"><h2>${t("Host capabilities", "主機功能")}</h2>${Object.entries(
        state.capabilities,
      )
        .map(
          ([a, c]) =>
            `<p><strong>${a}</strong><br><small>${escape(c.version || c.reason)}</small></p>`,
        )
        .join(
          "",
        )}<p class="muted">${t("Hardware acceleration, advanced devices, backups and appliance installation remain outside this initial runtime.", "硬件加速、進階裝置、備份及裝置安裝尚未納入目前執行版本。")}</p></section></div>`
    );
  }
  function eventList(limit = 200) {
    return `<ul class="activity">${
      state.events
        .slice(0, limit)
        .map(
          (e) =>
            `<li><span>${escape(e.message)}</span><time datetime="${e.at}">${new Date(e.at).toLocaleString()}</time></li>`,
        )
        .join("") || `<li>${t("No activity yet.", "尚無活動。")}</li>`
    }</ul>`;
  }
  function history() {
    return (
      heading(
        label("history"),
        t("Actual actions and their timestamps.", "實際操作及時間記錄。"),
      ) + `<section class="card">${eventList()}</section>`
    );
  }
  function docs() {
    return (
      heading(
        label("docs"),
        t(
          "Practical workflows for your local QEMU workspace.",
          "本機 QEMU 工作區的實用指南。",
        ),
      ) +
      `<div class="grid"><article class="card"><h2>${t("Create and start a machine", "建立和啟動機器")}</h2><ol><li>${t("Add a trusted ISO to the managed media directory, if installing an OS.", "如需安裝作業系統，先將可信 ISO 放進 media 目錄。")}</li><li>${t("Open New machine and follow the eight steps.", "開啟新增機器，完成八個步驟。")}</li><li>${t("Review the resources, save, then choose Start.", "檢查資源，儲存後選擇啟動。")}</li><li>${t("Open Console to interact with the guest.", "開啟主控台操作客體。")}</li></ol>${button("new", label("new"), "primary")}</article><article class="card"><h2>${t("Control a running machine", "控制運行中的機器")}</h2><p>${t("Pause suspends virtual CPUs. Resume continues them. Shut down sends an ACPI power request, which the guest must handle. Power off immediately terminates the virtual machine and can lose unsaved guest data.", "暫停會停止虛擬處理器，繼續會恢復運行。關機會傳送 ACPI 請求，由客體處理。強制關機會立即終止機器，可能失去未儲存資料。")}</p></article><article class="card"><h2>${t("Storage and recovery", "儲存與復原")}</h2><p>${t("Keep the persistent data volume. It contains account configuration, machine definitions, disks and installation media. Back it up while machines are stopped. Never delete the data volume to update the container.", "保留持久資料空間，內有帳戶、機器設定、磁碟和安裝媒體。停止機器後才備份，更新容器時切勿刪除資料空間。")}</p></article><article class="card"><h2>${t("Delivery scope", "目前交付範圍")}</h2><p>${t("This runtime implements the six front-door workflows. The other design boards remain a roadmap, including appliance OS images, USB installer, desktop assistant, snapshots, migration and advanced QEMU hardware. They are not shipped features.", "此執行版本提供六個主要流程。其他設計仍屬路線圖，包括裝置映像、USB 安裝器、桌面助手、快照、遷移及進階 QEMU 硬件，尚未交付。")}</p></article></div>`
    );
  }
  function consolePage() {
    const m = state.machines.find((m) => m.id === selected);
    if (!m) return empty();
    return (
      heading(
        escape(m.name),
        `${m.arch} · ${m.cpus} vCPU · ${m.memory} MiB`,
        pill(m),
      ) +
      `<section class="card"><div class="console-toolbar"><div class="actions">${button(`lifecycle:${m.id}:${m.state === "stopped" ? "start" : m.state === "paused" ? "resume" : "pause"}`, t(m.state === "stopped" ? "Start" : m.state === "paused" ? "Resume" : "Pause", { stopped: "啟動", paused: "繼續" }[m.state] || "暫停"), "primary")}${m.state !== "stopped" ? button(`lifecycle:${m.id}:shutdown`, t("Shut down", "關機")) + button("console-reset", t("Reset", "重設")) + button(`lifecycle:${m.id}:stop`, t("Power off", "強制關機"), "danger") : ""}</div><div class="actions">${button("console-scale", consoleScale ? t("Scaling: fit", "縮放：符合畫面") : t("Scaling: native", "縮放：原始大小"), "", `aria-pressed="${consoleScale}"`)}${button("console-fullscreen", t("Fullscreen", "全螢幕"))}${button("console-keys", t("Send keys", "傳送按鍵"))}${button("console-text", t("Type text", "輸入文字"))}${button("console-clipboard", t("Clipboard", "剪貼簿"))}${button("console-release", consoleInput ? t("Guest input: on", "客體輸入：開啟") : t("Guest input: off", "客體輸入：關閉"), "", `aria-pressed="${consoleInput}"`)}${button("console-reconnect", t("Reconnect", "重新連線"))}</div></div><div id="console-screen" class="console-screen">${m.state === "stopped" ? `<p>${t("This machine is stopped. Start it to connect to the live display.", "機器已停止，啟動後即可連接即時畫面。")}</p>` : '<div id="vnc"></div>'}</div><p id="console-status" class="muted-line">${t("Authenticated console. Guest input is sent only while connected.", "已驗證主控台，只會在連線時傳送操作。")}</p></section>`
    );
  }
  return {
    metrics,
    heading,
    overview,
    empty,
    machineCard,
    filtered,
    machines,
    machineResults,
    details,
    settings,
    eventList,
    history,
    docs,
    consolePage,
  };
}

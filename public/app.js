import { loadDraft, saveDraft, clearDraft } from "./drafts.js";
import { platformFields } from "./capability-view.js";
import { createViews } from "./views.js";
import { uploadIso } from "./upload.js";
const { startRegistration, startAuthentication } = window.SimpleWebAuthnBrowser;

const $ = (selector) => document.querySelector(selector);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const bytes = (value) =>
  value == null
    ? t("Unavailable", "未能提供")
    : `${(value / 1073741824).toFixed(1)} GiB`;
let session,
  state,
  page = "overview",
  query = "",
  filter = "all",
  folder = "",
  selected = "",
  checked = new Set(),
  wizardStep = 1,
  wizard = {},
  editing = false,
  rfb,
  noticeTimer,
  dialogOpener,
  dialogOpenerAction;
let onboardingMachine = false;
let previewTimer,
  previewSequence = 0;
let consoleScale = localStorage.getItem("mq-console-scale") !== "false";
let consoleInput = localStorage.getItem("mq-console-input") !== "false";
const names = {
  overview: ["Overview", "總覽"],
  machines: ["All machines", "所有機器"],
  new: ["New machine", "新增機器"],
  settings: ["Settings", "設定"],
  docs: ["Help & documentation", "說明文件"],
  history: ["Activity", "活動記錄"],
  console: ["Console", "主控台"],
};
function t(en, yue = en) {
  const mode =
    state?.settings.language || localStorage.getItem("mq-language") || "en";
  return mode === "yue"
    ? yue
    : mode === "both" && en !== yue
      ? `${en} · ${yue}`
      : en;
}
function label(key) {
  return t(...names[key]);
}
function enumLabel(value) {
  const labels = {
    all: ["All", "全部"],
    favourites: ["Favourites", "最愛"],
    attention: ["Needs attention", "需要處理"],
    recent: ["Recently used", "最近使用"],
    running: ["Running", "運行中"],
    paused: ["Paused", "已暫停"],
    stopped: ["Stopped", "已停止"],
    starting: ["Starting", "啟動中"],
    error: ["Error", "錯誤"],
    prelaunch: ["Ready to resume", "準備繼續"],
    cards: ["Cards", "卡片"],
    list: ["List", "清單"],
    compact: ["Compact", "緊密"],
    platform: ["Platform", "平台"],
    memory: ["Memory", "記憶體"],
    cpu: ["CPU", "處理器"],
    none: ["Disconnected", "不連網"],
    user: ["Restricted user network", "受限制使用者網絡"],
  };
  return labels[value] ? t(...labels[value]) : value;
}
function notify(message) {
  const text = document.createElement("span");
  text.textContent = message;
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = t("Dismiss", "關閉通知");
  dismiss.onclick = () => $("#notice").replaceChildren();
  $("#notice").replaceChildren(text, dismiss);
  clearTimeout(noticeTimer);
  if (!matchMedia("(max-width:760px)").matches)
    noticeTimer = setTimeout(() => $("#notice").replaceChildren(), 6500);
}
async function api(route, body, options = {}) {
  const response = await fetch(`/api${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            "X-CSRF-Token": session?.csrf || "",
            "X-Setup-Token": options.bootstrap || "",
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
async function refresh(renderPage = true) {
  state = await api("/state");
  session.csrf = state.csrf;
  applySettings();
  if (renderPage) render();
}
function applySettings() {
  if (state?.settings) {
    localStorage.setItem("mq-language", state.settings.language);
    localStorage.setItem("mq-theme", state.settings.theme);
  }
  const theme =
    state?.settings.theme || localStorage.getItem("mq-theme") || "dark";
  document.documentElement.dataset.theme =
    theme === "system"
      ? matchMedia("(prefers-color-scheme:dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.dataset.motion =
    state?.settings.motion === false ? "off" : "on";
  document.documentElement.lang =
    state?.settings.language === "yue" ? "zh-HK" : "en";
}
function field(name, title, value = "", type = "text", extra = "") {
  return `<div class="field"><label for="${name}">${title}</label><input id="${name}" name="${name}" type="${type}" value="${escape(value)}" ${extra}></div>`;
}
function select(name, title, options, value) {
  return `<div class="field"><label for="${name}">${title}</label><select id="${name}" name="${name}">${options.map(([v, l]) => `<option value="${escape(v)}" ${v === value ? "selected" : ""}>${escape(l)}</option>`).join("")}</select></div>`;
}
function button(action, text, cls = "", extra = "") {
  return `<button type="button" data-action="${action}" class="${cls}" ${extra}>${text}</button>`;
}
function pill(machine) {
  return `<span class="pill ${machine.state}">${escape(enumLabel(machine.state))}</span>`;
}
function render() {
  if (rfb) {
    rfb.disconnect();
    rfb = null;
  }
  if (!session?.authenticated) {
    renderAuth();
    return;
  }
  if (!state.setup.complete && !onboardingMachine) {
    renderOnboarding();
    return;
  }
  $("#app").innerHTML =
    `<header class="topbar"><div class="brand"><span class="mark" aria-hidden="true"><span class="icon">memory</span></span>Material QEMU</div><div class="search"><input id="global-search" aria-label="${t("Search machines", "搜尋機器")}" placeholder="${t("Search machines, folders and notes", "搜尋機器、資料夾和備註")}" value="${escape(query)}"></div><span class="spacer"></span><span class="pill healthy health">● ${t("Host connected", "主機已連線")}</span>${button("logout", t("Sign out", "登出"), "ghost")}</header><div class="shell"><nav aria-label="${t("Workspace", "工作區")}">${["overview", "machines", "new"].map((k) => button(`page:${k}`, `<span class="icon" aria-hidden="true">${{ overview: "dashboard", machines: "view_list", new: "add" }[k]}</span><span>${label(k)}</span>`, page === k ? "active" : "")).join("")}<div class="group">${t("Machines", "機器")}</div>${state.machines.map((m) => button(`console:${m.id}`, `<span class="icon" aria-hidden="true">computer</span><span class="nav-name">${escape(m.name)}</span>`, "machine-nav")).join("")}<div class="group">${t("Your workspace", "你的工作區")}</div>${["settings", "history", "docs"].map((k) => button(`page:${k}`, label(k), page === k ? "active" : "")).join("")}<div class="bottom">Material QEMU 0.1.0<br>${t("Built", "建置時間")} ${escape(state.updatedAt || t("unavailable", "未能提供"))}<br>${escape(state.owner.name)}</div></nav><main class="main" id="main" tabindex="-1">${({ overview: views().overview, machines: views().machines, new: machineWizard, settings: views().settings, history: views().history, docs: views().docs, console: views().consolePage }[page] || views().overview)()}</main></div>`;
  if (page === "console") {
    updateConsoleControls();
    connectConsole();
  }
  if (page === "new") requestPreview();
  const search = $("#global-search");
  search?.addEventListener("input", (e) => {
    query = e.target.value;
    if (page !== "machines") {
      page = "machines";
      render();
      $("#global-search").focus();
    } else $("#machine-results").innerHTML = views().machineResults();
  });
}
function renderAuth() {
  const setup = session?.setupRequired;
  $("#app").innerHTML =
    `<header class="topbar"><div class="brand"><span class="mark" aria-hidden="true"><span class="icon">memory</span></span>Material QEMU</div><span class="spacer"></span><small>0.1.0 · ${escape(session.updatedAt || t("Build time unavailable", "未能提供建置時間"))}</small><div class="auth-controls">${select(
      "auth-language",
      t("Language", "語言"),
      [
        ["en", "English"],
        ["yue", "廣東話"],
        ["both", "English + 廣東話"],
      ],
      localStorage.getItem("mq-language") || "en",
    )}${select(
      "auth-theme",
      t("Theme", "主題"),
      [
        ["dark", t("Dark", "深色")],
        ["light", t("Light", "淺色")],
        ["system", t("Follow device", "跟隨裝置")],
      ],
      localStorage.getItem("mq-theme") || "dark",
    )}</div></header><main class="auth"><div class="card auth-card"><section class="auth-intro"><div class="mark" aria-hidden="true"><span class="icon">memory</span></div><span class="pill">${t("Your machines. Your control.", "你的機器，由你掌控。")}</span><h1 style="margin-top:24px">${t("A quieter home for your virtual machines.", "虛擬機器的安心基地。")}</h1><p class="muted">${t("One workspace for QEMU. Manage, monitor and connect, with everything running on your own host.", "一個 QEMU 工作區，管理、監察及連線，全部在你的主機上運行。")}</p><p class="muted-line">${t("Private by default. No cloud account required.", "預設私人使用，毋須雲端帳戶。")}</p></section><section class="auth-form"><h2>${setup ? t("Welcome to your new workspace", "歡迎使用新工作區") : t("Welcome back", "歡迎回來")}</h2><p class="muted">${setup ? t("Create the owner account to begin guided setup.", "建立擁有人帳戶，開始設定。") : t("Unlock your local workspace.", "解鎖你的本機工作區。")}</p>${!setup ? button("passkey-login", t("Sign in with a passkey", "使用通行密鑰登入"), "primary", 'style="width:100%;margin-bottom:22px"') : ""}<form id="auth-form">${setup ? field("owner", t("Your name", "你的名字"), "", "text", 'required autocomplete="name"') + field("bootstrap", t("Setup authorization code", "設定授權碼"), "", "password", 'required autocomplete="off"') : ""}${field("password", t("Password", "密碼"), "", "password", `required minlength="12" maxlength="256" autocomplete="${setup ? "new-password" : "current-password"}"`)}<button class="${setup ? "primary" : ""}" type="submit" style="width:100%">${setup ? t("Create owner account", "建立擁有人帳戶") : t("Sign in with password", "使用密碼登入")}</button></form><p class="muted-line">${setup ? t("The setup authorization code is stored in the host data directory. Passwords need at least 12 characters.", "設定授權碼存於主機資料目錄，密碼最少需要十二個字元。") : t("Passkeys require HTTPS or localhost. Your password remains available as a recovery method.", "通行密鑰需要 HTTPS 或 localhost。密碼仍可用作復原登入。")}</p></section></div></main>`;
  $("#auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const values = new FormData(e.target);
    try {
      const result = await api(
        setup ? "/setup" : "/login",
        {
          name: values.get("owner"),
          password: values.get("password"),
          preferences: {
            language: localStorage.getItem("mq-language") || "en",
            theme: localStorage.getItem("mq-theme") || "dark",
          },
        },
        { bootstrap: values.get("bootstrap") },
      );
      session = { ...session, authenticated: true, csrf: result.csrf };
      await refresh();
    } catch (error) {
      notify(error.message);
    }
  };
}

const setupNames = [
  ["Owner", "擁有人"],
  ["Language", "語言"],
  ["Hardware", "硬件"],
  ["Storage", "儲存空間"],
  ["Network", "網絡"],
  ["ISO library", "ISO 媒體"],
  ["First machine", "第一部機器"],
  ["Ready", "準備完成"],
];
function steps(labels, current) {
  return `<div class="steps" aria-label="Progress">${labels.map((s, i) => `<div class="step ${current === i + 1 ? "active" : current > i + 1 ? "done" : ""}" ${current === i + 1 ? 'aria-current="step"' : ""}><b>${current > i + 1 ? "✓" : i + 1}</b>${t(...s)}</div>`).join("")}</div>`;
}
function renderOnboarding() {
  const n = state.setup.step;
  let content = "";
  if (n === 2)
    content =
      select(
        "setup-language",
        t("Workspace language", "工作區語言"),
        [
          ["en", "English"],
          ["yue", "廣東話"],
          ["both", "English + 廣東話"],
        ],
        state.settings.language,
      ) +
      select(
        "setup-theme",
        t("Appearance", "外觀"),
        [
          ["dark", t("Dark", "深色")],
          ["light", t("Light", "淺色")],
          ["system", t("Follow device", "跟隨裝置")],
        ],
        state.settings.theme,
      );
  if (n === 3)
    content = `<div class="grid">${Object.entries(state.capabilities)
      .map(
        ([arch, c]) =>
          `<div class="card"><h3>${arch}</h3><span class="pill ${c.available ? "healthy" : "error"}">${c.available ? t("Ready", "可用") : t("Unavailable", "未能使用")}</span><p class="muted" style="margin-top:15px">${escape(c.version || c.reason)}</p></div>`,
      )
      .join(
        "",
      )}</div><p class="help">${t("TCG software emulation works without passing host virtualization devices into the container. No host firmware or security settings are changed.", "TCG 使用模擬運行，不需將虛擬化裝置交給容器，也不會更改主機韌體或安全設定。")}</p>`;
  if (n === 4)
    content = `<h3>${t("Private managed storage", "私人管理儲存空間")}</h3><p>${t("Machine disks are created as sparse QCOW2 images in the persistent data volume. Existing host disks are never selected or erased.", "機器使用持久資料空間中的 QCOW2 磁碟，不會選取或清除現有主機磁碟。")}</p><dl><dt>${t("Disk format", "磁碟格式")}</dt><dd>QCOW2</dd><dt>${t("Storage scope", "儲存範圍")}</dt><dd>${t("Managed data volume only", "只限管理資料空間")}</dd></dl>`;
  if (n === 5)
    content = `<h3>${t("Isolated by default", "預設隔離")}</h3><p>${t("Machines use restricted user-mode networking, or no network. Host port forwarding and bridges are not enabled.", "機器使用受限制的使用者模式網絡，或完全不連網。不會啟用主機端口轉送或網絡橋接。")}</p><div class="help">${escape(location.origin)}<br>${t("This is your current connection, not a claim of LAN reachability. Use an HTTPS reverse proxy before remote access.", "這是目前連線地址，並不代表區域網絡已可連線。遠端存取前請設定 HTTPS 代理。")}</div>`;
  if (n === 6)
    content = `<h3>${t("Bring your installation media", "準備安裝媒體")}</h3><p>${t("Place your trusted ISO files in the data volume’s media directory. The host operator manages these files. A blank machine can be created without an ISO.", "將可信的 ISO 放進資料空間的 media 目錄，由主機管理者處理。也可先建立沒有 ISO 的空白機器。")}</p><div class="help">${state.media.length ? state.media.map(escape).join("<br>") : t("No ISO files found. You can add them later.", "尚未找到 ISO，可稍後新增。")}</div>${button("import-iso", t("Import ISO", "匯入 ISO"), "primary")}${button("refresh", t("Check again", "重新檢查"))}`;
  if (n === 7)
    content = `<h3>${t("Your first machine is next", "下一步，建立第一部機器")}</h3><p>${t("The machine wizard will help you choose a platform, CPU, memory, private disk, network and display. Create it here, or continue with an empty workspace.", "機器精靈會帶你選擇平台、處理器、記憶體、磁碟、網絡及顯示。可以在這裡建立，也可以先使用空白工作區。")}</p><p class="help">${t("Create a machine now, or skip this optional step. Startup happens only when you select it.", "可以現在建立機器，或跳過這個可選步驟，只有選取啟動才會開機。")}</p>${button("setup-create", t("Create first machine", "建立第一部機器"), "primary")}`;
  if (n === 8)
    content = `<div class="empty"><div class="empty-icon">✓</div><h2>${t("Your workspace is ready", "工作區已準備好")}</h2><p>${t("Your owner account and preferences are saved. You can register a passkey in Settings and create your first machine.", "帳戶和偏好已儲存，可在設定登記通行密鑰，再建立第一部機器。")}</p></div>`;
  $("#app").innerHTML =
    `<header class="topbar"><div class="brand"><span class="mark" aria-hidden="true"><span class="icon">memory</span></span>Material QEMU</div><span class="spacer"></span><span class="pill">${t("Setup saved automatically", "設定進度自動儲存")}</span></header><main class="main wizard">${views().heading(t("Make yourself at home", "設定你的工作區"), t("A few practical steps, then you are in.", "幾個實用步驟，完成即可開始。"))}${steps(setupNames, n)}<section class="card wizard-content"><h2>${t(...setupNames[n - 1])}</h2>${content}</section><div class="wizard-footer"><div class="actions">${button("setup-save", t("Save and finish later", "儲存並稍後繼續"))}${[4, 5, 6, 7].includes(n) ? button("setup-skip", t("Skip this step", "跳過此步驟"), "ghost") : ""}</div>${n > 2 ? button("setup-back", t("Back", "上一步")) : "<span></span>"}${button(n === 8 ? "setup-finish" : "setup-next", n === 8 ? t("Open workspace", "開啟工作區") : t("Save & continue", "儲存並繼續"), "primary")}</div></main>`;
}
const machineSteps = [
  ["Preset", "預設"],
  ["Platform", "平台"],
  ["CPU & memory", "處理器及記憶體"],
  ["Firmware", "韌體"],
  ["Storage", "儲存"],
  ["Network", "網絡"],
  ["Display", "顯示"],
  ["Review", "檢查"],
];
function machineWizard() {
  let content = "";
  if (wizardStep === 1)
    content =
      field(
        "name",
        t("Machine name", "機器名稱"),
        wizard.name,
        "text",
        'required maxlength="80"',
      ) +
      select(
        "preset",
        t("Starting point", "起點"),
        [
          ["blank", t("Blank machine", "空白機器")],
          ["small", t("Lightweight server resources", "輕量伺服器資源")],
          ...Object.entries(state.capabilities)
            .filter(([, cap]) => cap.available)
            .map(([arch]) => [
              `desktop:${arch}`,
              `${t("Linux desktop resources", "Linux 桌面資源")} · ${arch}`,
            ]),
        ],
        wizard.preset || "blank",
      ) +
      `<p class="help">${t("Presets select an installed platform and resource defaults, not an operating system installation. Network access stays disconnected until you choose it.", "預設只選擇已安裝平台和資源，不會安裝作業系統。網絡保持不連線，直至你選擇。")}</p><details><summary>${t("Presets not yet supported", "尚未支援的預設")}</summary><ul><li>${t("Windows 11: Secure Boot and TPM setup is not implemented.", "Windows 11：尚未提供安全啟動及 TPM 設定。")}</li><li>${t("MicroVM and Raspberry Pi: direct kernel and board-specific boot media are not implemented.", "MicroVM 及 Raspberry Pi：尚未提供直接核心及板型專用啟動媒體。")}</li><li>${t("Retro PC: legacy audio, floppy and ISA device recipes are not implemented.", "懷舊電腦：尚未提供舊式音效、軟碟及 ISA 裝置。")}</li><li>${t("Confidential guests: encrypted-memory hardware setup is not implemented.", "機密客體：尚未提供加密記憶體硬件設定。")}</li></ul></details>`;
  if (wizardStep === 2)
    content = platformFields({ state, wizard, t, select, escape });
  if (wizardStep === 3)
    content = `<div class="form-grid">${field("cpus", t("Virtual CPUs", "虛擬處理器"), wizard.cpus, "number", 'min="1" max="16" required')}${field("memory", t("Memory (MiB)", "記憶體（MiB）"), wizard.memory, "number", 'min="128" max="32768" step="128" required')}</div><p class="help">${t("Available host memory", "主機可用記憶體")}: ${bytes(state.metrics.memoryTotal - state.metrics.memoryUsed)}. ${t("Leave room for the host and other machines.", "請為主機和其他機器預留空間。")}</p>`;
  if (wizardStep === 4)
    content = `<h3>${["aarch64", "arm"].includes(wizard.arch) ? "UEFI" : "SeaBIOS"}</h3><p>${t("The supported firmware is selected by the platform. Secure Boot and TPM configuration are not implemented in this release.", "韌體按平台選定。此版本尚未提供安全啟動和 TPM 設定。")}</p><div class="help">${escape(wizard.machineType || state.capabilities[wizard.arch]?.machine || "")} · ${escape((wizard.accelerator || "tcg").toUpperCase())} · ${["aarch64", "arm"].includes(wizard.arch) ? "UEFI" : "SeaBIOS"}</div>`;
  if (wizardStep === 5)
    content = `${field("diskGiB", t("Virtual disk capacity (GiB)", "虛擬磁碟容量（GiB）"), wizard.diskGiB, "number", `min="1" max="256" required ${editing ? "readonly" : ""}`)}${select("iso", t("Installation ISO", "安裝 ISO"), [["", t("No installation media", "沒有安裝媒體")], ...state.media.map((f) => [f, f])], wizard.iso || "")}${button("import-iso", t("Import ISO", "匯入 ISO"))}<p class="help">${t("A sparse QCOW2 disk is created inside managed storage. No existing host disk is touched. Disk resizing is not yet available.", "QCOW2 磁碟只會在管理空間內建立，不會觸碰現有主機磁碟。目前未提供調整容量。")}</p>`;
  if (wizardStep === 6)
    content =
      select(
        "network",
        t("Network connection", "網絡連線"),
        [
          ["user", t("Restricted user-mode network", "受限制使用者網絡")],
          ["none", t("Disconnected", "不連網")],
        ],
        wizard.network,
      ) +
      `<div class="help">${t("Restricted networking blocks guest access to the host and outside network. This release does not configure bridges or forwarding.", "受限制網絡會阻止客體存取主機及外部網絡。此版本不設定橋接或轉送。")}</div>`;
  if (wizardStep === 7)
    content = `<h3>${t("Browser console", "瀏覽器主控台")}</h3><p>${t("VNC stays private inside the host and is proxied through your authenticated session. Scaling, fullscreen and key sequences are available in the live console.", "VNC 保持在主機內，經過已驗證登入的連線轉送。即時主控台支援縮放、全螢幕及按鍵組合。")}</p>${select("folder", t("Folder", "資料夾"), [["", t("Unfiled", "未分類")], ...state.folders.map((f) => [f, f])], wizard.folder || "")}${field("notes", t("Notes", "備註"), wizard.notes || "", "text", 'maxlength="2000"')}`;
  if (wizardStep === 8)
    content = `<dl>${[
      [t("Name", "名稱"), wizard.name],
      [
        t("Platform", "平台"),
        `${wizard.arch} · ${wizard.machineType || state.capabilities[wizard.arch]?.machine} · ${(wizard.accelerator || "tcg").toUpperCase()}`,
      ],
      [t("CPU", "處理器"), `${wizard.cpus} vCPU`],
      [t("Memory", "記憶體"), `${wizard.memory} MiB`],
      [t("Disk", "磁碟"), `${wizard.diskGiB} GiB · QCOW2`],
      [t("Network", "網絡"), enumLabel(wizard.network)],
      ["ISO", wizard.iso || t("None", "沒有")],
      [t("Folder", "資料夾"), wizard.folder || t("Unfiled", "未分類")],
    ]
      .map(([k, v]) => `<dt>${k}</dt><dd>${escape(v)}</dd>`)
      .join(
        "",
      )}</dl><label class="check"><input name="startAfterCreate" type="checkbox" ${wizard.startAfterCreate ? "checked" : ""}>${t("Start after creating", "建立後啟動")}</label><div class="help">${t("Review before saving. The machine starts only when Start after creating is selected.", "儲存前請檢查。只有選取建立後啟動，機器才會啟動。")}</div>`;
  return (
    views().heading(
      editing ? t("Edit machine", "編輯機器") : label("new"),
      t(
        "Start with the essentials. Every choice belongs to this machine.",
        "由基本設定開始，每個選擇只屬於這部機器。",
      ),
    ) +
    `<div class="wizard">${steps(machineSteps, wizardStep)}<form id="machine-form"><section class="card wizard-content"><h2>${t(...machineSteps[wizardStep - 1])}</h2>${content}</section><div class="wizard-footer"><div class="actions">${button("page:machines", t("Cancel", "取消"), "ghost")}${wizardStep > 1 ? button("wizard-back", t("Back", "上一步")) : ""}</div>${button(wizardStep === 8 ? "wizard-create" : "wizard-next", wizardStep === 8 ? t("Save machine", "儲存機器") : t("Continue", "繼續"), "primary")}</div></form><details class="card command-plan" open><summary>${t("Server-generated launch preview", "伺服器產生的啟動預覽")}</summary><pre id="command-preview" aria-live="polite"></pre><p class="muted">${t("Placeholders represent private paths and ports assigned at launch. This preview executes nothing.", "佔位文字代表啟動時分配的私人路徑和端口，預覽不會執行任何指令。")}</p></details></div>`
  );
}

async function connectConsole() {
  if (!$("#vnc")) return;
  try {
    const { default: RFB } = await import("/vendor/novnc/core/rfb.js");
    rfb = new RFB(
      $("#vnc"),
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/console/${selected}`,
      { shared: true },
    );
    rfb.scaleViewport = consoleScale;
    rfb.viewOnly = !consoleInput;
    rfb.resizeSession = false;
    rfb.addEventListener("connect", () => {
      $("#console-status").textContent = t(
        "Connected to the live QEMU display.",
        "已連接 QEMU 即時畫面。",
      );
    });
    rfb.addEventListener("disconnect", () => {
      if ($("#console-status"))
        $("#console-status").textContent = t(
          "Console disconnected. Reconnect or check the machine state.",
          "主控台已中斷，請重新連線或檢查機器狀態。",
        );
    });
  } catch (e) {
    notify(e.message);
  }
}
function startWizard(machine) {
  editing = Boolean(machine);
  const draft = loadDraft(localStorage, machine?.id);
  wizardStep = draft?.step || 1;
  const arch =
    Object.keys(state.capabilities).find(
      (key) => state.capabilities[key].available,
    ) || "x86_64";
  wizard = {
    ...(machine || {
      name: "",
      arch,
      machineType: state.capabilities[arch]?.machine,
      accelerator: "tcg",
      cpus: 2,
      memory: 2048,
      diskGiB: 20,
      network: "none",
      iso: "",
      folder: "",
      notes: "",
    }),
    ...(draft?.data || {}),
  };
  page = "new";
  render();
}
function currentDraftData() {
  const form = $("#machine-form");
  if (!form) return { ...wizard };
  const values = Object.fromEntries(new FormData(form)),
    data = { ...wizard };
  if (wizardStep === 1 && values.preset !== wizard.preset) {
    if (values.preset?.startsWith("desktop:")) {
      const arch = values.preset.slice(8);
      if (state.capabilities[arch]?.available)
        Object.assign(data, {
          arch,
          machineType: state.capabilities[arch].machine,
          accelerator: "tcg",
          cpus: 2,
          memory: 2048,
          diskGiB: 32,
          network: "none",
        });
    }
    if (values.preset === "small")
      Object.assign(data, { cpus: 1, memory: 512, diskGiB: 8 });
  }
  Object.assign(data, values);
  if (wizardStep === 8)
    data.startAfterCreate = Boolean(form.elements.startAfterCreate?.checked);
  return data;
}
function persistDraft() {
  try {
    saveDraft(
      localStorage,
      currentDraftData(),
      wizardStep,
      editing ? wizard.id : undefined,
    );
  } catch {
    notify(
      t("Draft could not be saved in this browser.", "此瀏覽器未能儲存草稿。"),
    );
  }
}
function saveWizard() {
  if (!$("#machine-form").reportValidity()) return false;
  wizard = currentDraftData();
  persistDraft();
  return true;
}
function modal(title, content, confirm, callback) {
  const d = $("#dialog");
  if (!d.open) {
    dialogOpener = document.activeElement;
    dialogOpenerAction = dialogOpener?.closest("[data-action]")?.dataset.action;
  }
  const opener = dialogOpener,
    openerAction = dialogOpenerAction;
  d.innerHTML = `<h2 id="dialog-title">${title}</h2><form id="dialog-form">${content}<div class="actions">${button("dialog-close", t("Cancel", "取消"), "ghost")}<button class="primary" type="submit">${confirm}</button></div></form>`;
  d.setAttribute("aria-labelledby", "dialog-title");
  d.onclose = () => {
    const target = opener?.isConnected
      ? opener
      : openerAction
        ? document.querySelector(`[data-action="${CSS.escape(openerAction)}"]`)
        : null;
    (target || $("#main"))?.focus();
  };
  d.showModal();
  $("#dialog-form").onsubmit = async (e) => {
    e.preventDefault();
    const submit = e.target.querySelector("[type=submit]");
    submit.disabled = true;
    try {
      const close = await callback(new FormData(e.target));
      if (close !== false) d.close();
    } catch (error) {
      notify(error.message);
    } finally {
      submit.disabled = false;
    }
  };
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const action = b.dataset.action;
  try {
    if (action === "dialog-close") return $("#dialog").close();
    if (action === "import-iso") {
      if ($("#machine-form") && !saveWizard()) return;
      return modal(
        t("Import installation ISO", "匯入安裝 ISO"),
        `${field("isoFile", t("Choose a trusted ISO", "選擇可信 ISO"), "", "file", 'required accept=".iso"')}${field("isoName", t("Stored filename", "儲存檔名"), "", "text", 'required maxlength="155"')}<p class="muted">${t("Maximum 2 GiB and 15 minutes per upload, with two concurrent uploads. Existing filenames are never overwritten. Uploading checks transfer integrity, not whether an image is safe or bootable.", "每次上限 2 GiB 和 15 分鐘，最多同時兩個上傳，不會覆寫現有檔名。上傳只檢查傳輸完整性，不代表映像安全或可以啟動。")}</p><progress id="upload-progress" max="100" value="0" style="width:100%"></progress><p id="upload-status" role="status"></p>`,
        t("Upload ISO", "上傳 ISO"),
        async (f) => {
          const file = f.get("isoFile");
          if (!file?.size || file.size > state.mediaMaxBytes)
            throw new Error(
              t(
                "Choose an ISO between 1 byte and 2 GiB.",
                "請選擇介乎 1 byte 和 2 GiB 的 ISO。",
              ),
            );
          const transfer = uploadIso(
            file,
            f.get("isoName"),
            session.csrf,
            (loaded, total) => {
              const percent = Math.round((100 * loaded) / total);
              if ($("#upload-progress")) $("#upload-progress").value = percent;
              if ($("#upload-status"))
                $("#upload-status").textContent = t(
                  `${percent}% transferred; verifying after upload.`,
                  `${percent}% 已傳送，上傳後會核對。`,
                );
            },
          );
          const dialog = $("#dialog"),
            abort = () => transfer.abort();
          dialog.addEventListener("close", abort, { once: true });
          try {
            const result = await transfer.promise;
            wizard.iso = result.name;
            await refresh();
            notify(
              t(
                `Imported ${result.name} (${result.bytes} bytes).`,
                `已匯入 ${result.name}（${result.bytes} bytes）。`,
              ),
            );
          } finally {
            dialog.removeEventListener("close", abort);
          }
        },
      );
    }
    if (action.startsWith("page:")) {
      if (onboardingMachine && action !== "page:new") {
        persistDraft();
        onboardingMachine = false;
        render();
        return;
      }
      page = action.slice(5);
      if (page === "new") return startWizard();
      render();
      return;
    }
    if (action === "new") return startWizard();
    if (action === "refresh") return refresh();
    if (action === "logout") {
      onboardingMachine=false;
      await api("/logout", {});
      session = await api("/session");
      state = null;
      render();
      return;
    }
    if (action === "passkey-login") {
      const result = await api("/passkey/login-options", {});
      const response = await startAuthentication({
        optionsJSON: result.options,
      });
      const login = await api("/passkey/login", { id: result.id, response });
      session = { authenticated: true, csrf: login.csrf };
      return refresh();
    }
    if (action === "register-passkey") {
      const { options } = await api("/passkey/register-options", {});
      const response = await startRegistration({ optionsJSON: options });
      await api("/passkey/register", { response });
      await refresh();
      notify(t("Passkey added.", "通行密鑰已新增。"));
      return;
    }
    if (action === "setup-create") {
      onboardingMachine = true;
      return startWizard();
    }
    if (action === "setup-save") {
      const step = state.setup.step;
      if (step === 2)
        await api("/preferences", {
          settings: {
            language: $("#setup-language").value,
            theme: $("#setup-theme").value,
          },
        });
      await api("/preferences", { setup: { step, complete: false } });
      await api("/logout", {});
      session = await api("/session");
      state = null;
      render();
      return;
    }
    if (action.startsWith("setup-")) {
      let step = state.setup.step;
      if (step === 2) {
        await api("/preferences", {
          settings: {
            language: $("#setup-language").value,
            theme: $("#setup-theme").value,
          },
        });
      }
      await api("/preferences", {
        setup: {
          step:
            action === "setup-back"
              ? step - 1
              : action === "setup-finish"
                ? 8
                : step + 1,
          complete: action === "setup-finish",
          skipStep: action === "setup-skip" ? step : undefined,
        },
      });
      if(action==='setup-finish')page='overview';
      return refresh();
    }
    if (action === "wizard-next") {
      if (saveWizard()) {
        wizardStep++;
        saveDraft(
          localStorage,
          wizard,
          wizardStep,
          editing ? wizard.id : undefined,
        );
        render();
      }
      return;
    }
    if (action === "wizard-back") {
      wizard = currentDraftData();
      wizardStep--;
      saveDraft(
        localStorage,
        wizard,
        wizardStep,
        editing ? wizard.id : undefined,
      );
      render();
      return;
    }
    if (action === "wizard-create") {
      if (!saveWizard()) return;
      b.disabled = true;
      const result = await api(
        editing ? `/machines/${wizard.id}` : "/machines",
        wizard,
      );
      clearDraft(localStorage, editing ? wizard.id : undefined);
      if (onboardingMachine) {
        onboardingMachine = false;
        await api("/preferences", { setup: { step: 8, complete: false } });
        await refresh();
        notify(
          result.startError
            ? result.startError
            : t("First machine saved.", "第一部機器已儲存。"),
        );
        return;
      }
      if (!editing && wizard.startAfterCreate && !result.startError) {
        selected = result.id;
        page = "console";
      } else page = "machines";
      await refresh();
      notify(
        result.startError
          ? t(
              `Machine saved, but start did not complete: ${result.startError}`,
              `機器已儲存，但啟動未完成：${result.startError}`,
            )
          : t("Machine saved.", "機器已儲存。"),
      );
      return;
    }
    if (action.startsWith("filter:")) {
      filter = action.slice(7);
      render();
      return;
    }
    if (action.startsWith("folder-filter:")) {
      folder = action.slice(14);
      render();
      return;
    }
    if (action.startsWith("layout:")) {
      await api("/preferences", { settings: { layout: action.slice(7) } });
      return refresh();
    }
    if (action.startsWith("view:")) {
      const view = state.views.find((v) => v.id === action.slice(5));
      query = view.query;
      filter = view.state;
      folder = view.folder || "";
      render();
      return;
    }
    if (action === "save-view")
      return modal(
        t("Save this view", "儲存此檢視"),
        field(
          "viewName",
          t("View name", "檢視名稱"),
          "",
          "text",
          'required maxlength="80"',
        ),
        t("Save", "儲存"),
        async (f) => {
          await api("/preferences", {
            view: { name: f.get("viewName"), query, state: filter, folder },
          });
          await refresh();
        },
      );
    if (action.startsWith("delete-view:")) {
      const view = state.views.find((v) => v.id === action.slice(12));
      return modal(
        t("Delete saved view", "刪除已儲存檢視"),
        `<p>${t("Delete", "刪除")} <strong>${escape(view.name)}</strong>?</p><p class="muted">${t("Only the saved filter is removed. Machines and folders stay unchanged.", "只會刪除已儲存篩選，機器和資料夾不會改變。")}</p>`,
        t("Delete view", "刪除檢視"),
        async () => {
          await api("/preferences", { deleteView: view.id });
          await refresh();
        },
      );
    }
    if (action === "manage-folders")
      return modal(
        t("Manage folders", "管理資料夾"),
        `<div class="organization-list">${state.folders.map((name) => `<section><strong>${escape(name)}</strong><span class="muted">${state.machines.filter((m) => m.folder === name).length} ${t("assigned", "已分類")}</span><div class="actions">${button(`rename-folder:${escape(name)}`, t("Rename", "重新命名"))}${button(`delete-folder:${escape(name)}`, t("Remove", "移除"), "danger")}</div></section>`).join("") || `<p>${t("No folders yet. Create one from the machine toolbar.", "尚無資料夾，請從機器工具列建立。")}</p>`}</div>`,
        t("Close", "關閉"),
        async () => {},
      );
    if (action.startsWith("rename-folder:")) {
      const from = action.slice(14);
      return modal(
        t("Rename folder", "重新命名資料夾"),
        field(
          "folderName",
          t("New name", "新名稱"),
          from,
          "text",
          'required maxlength="80"',
        ) +
          `<p class="muted">${t("Machine assignments and saved folder filters follow the new name.", "機器分類和已儲存篩選會跟隨新名稱。")}</p>`,
        t("Rename", "重新命名"),
        async (f) => {
          const to = f.get("folderName").trim();
          await api("/preferences", { renameFolder: { from, to } });
          if (folder === from) folder = to;
          await refresh();
        },
      );
    }
    if (action.startsWith("delete-folder:")) {
      const name = action.slice(14),
        count = state.machines.filter((m) => m.folder === name).length;
      return modal(
        t("Remove folder", "移除資料夾"),
        `<p><strong>${escape(name)}</strong></p><p>${t(`${count} assigned ${count === 1 ? "machine moves" : "machines move"} to Unfiled. No machine or disk will be deleted. Saved views using this folder will include all folders.`, `${count} 部已分類機器會移至未分類，不會刪除任何機器或磁碟。使用此資料夾的已儲存檢視將包含所有資料夾。`)}</p>${field("confirmName", t("Type the exact folder name", "輸入完整資料夾名稱"), "", "text", 'required maxlength="80"')}<label class="check"><input name="unfiled" type="checkbox" required>${t("Keep all machines in Unfiled", "將所有機器保留在未分類")}</label>`,
        t("Remove folder", "移除資料夾"),
        async (f) => {
          await api("/preferences", {
            deleteFolder: {
              name,
              mode: f.get("unfiled") ? "unfiled" : "",
              confirmName: f.get("confirmName"),
            },
          });
          if (folder === name) folder = "";
          await refresh();
        },
      );
    }
    if (action === "folder")
      return modal(
        t("New folder", "新增資料夾"),
        field(
          "folderName",
          t("Folder name", "資料夾名稱"),
          "",
          "text",
          'required maxlength="80"',
        ),
        t("Create", "建立"),
        async (f) => {
          await api("/preferences", { folder: f.get("folderName") });
          await refresh();
        },
      );
    if (action === "columns")
      return modal(
        t("Visible columns", "顯示欄位"),
        ["platform", "memory", "cpu"]
          .map(
            (c) =>
              `<label class="check"><input type="checkbox" name="columns" value="${c}" ${state.settings.columns.includes(c) ? "checked" : ""}>${enumLabel(c)}</label>`,
          )
          .join(""),
        t("Apply", "套用"),
        async (f) => {
          await api("/preferences", {
            settings: { columns: f.getAll("columns") },
          });
          await refresh();
        },
      );
    if (action === "select-all") {
      views()
        .filtered()
        .forEach((m) => checked.add(m.id));
      render();
      return;
    }
    if (action.startsWith("details:")) {
      selected = action.slice(8);
      page = "machines";
      render();
      return;
    }
    if (action.startsWith("console:")) {
      selected = action.slice(8);
      page = "console";
      render();
      return;
    }
    if (action.startsWith("move:") || action === "bulk-move") {
      const ids = action === "bulk-move" ? [...checked] : [action.slice(5)];
      return modal(
        t("Move machines to folder", "將機器移至資料夾"),
        select(
          "destination",
          t("Destination folder", "目的資料夾"),
          [
            ["", t("Unfiled", "未分類")],
            ...state.folders.map((name) => [name, name]),
          ],
          "",
        ) +
          `<p class="muted">${t("Only organization changes. Machine state and disks are preserved.", "只更改分類，機器狀態及磁碟會保留。")}</p>`,
        t("Move", "移動"),
        async (f) => {
          const outcomes = [];
          for (const id of ids) {
            const name = state.machines.find((m) => m.id === id)?.name || id;
            try {
              await api(`/machines/${id}`, { folder: f.get("destination") });
              outcomes.push(`${name}: ${t("moved", "已移動")}`);
            } catch (error) {
              outcomes.push(`${name}: ${error.message}`);
            }
          }
          await refresh();
          modal(
            t("Move results", "移動結果"),
            `<ul>${outcomes.map((value) => `<li>${escape(value)}</li>`).join("")}</ul>`,
            t("Close", "關閉"),
            async () => {},
          );
          return false;
        },
      );
    }
    if (action.startsWith("edit:"))
      return startWizard(state.machines.find((m) => m.id === action.slice(5)));
    if (action.startsWith("favourite:")) {
      const m = state.machines.find((m) => m.id === action.slice(10));
      await api(`/machines/${m.id}`, { favourite: !m.favourite });
      return refresh();
    }
    if (action.startsWith("lifecycle:")) {
      const [, id, verb] = action.split(":");
      if (verb === "stop")
        return modal(
          t("Power off immediately?", "立即強制關機？"),
          `<p>${t("Unsaved guest data may be lost. A normal shutdown is safer. Type POWER OFF to confirm.", "可能失去客體未儲存資料，正常關機較安全。輸入 POWER OFF 確認。")}</p>${field("confirm", t("Confirmation", "確認"), "", "text", 'required pattern="POWER OFF"')}`,
          t("Power off", "強制關機"),
          async () => {
            await api(`/machines/${id}/action`, { action: verb });
            await refresh();
          },
        );
      b.disabled = true;
      await api(`/machines/${id}/action`, { action: verb });
      await refresh();
      notify(
        t(
          "Action requested. The displayed state reflects the host.",
          "操作已請求，顯示狀態由主機回報。",
        ),
      );
      return;
    }
    if (action.startsWith("bulk:")) {
      const verb = action.slice(5),
        outcomes = [];
      for (const id of checked) {
        try {
          await api(`/machines/${id}/action`, { action: verb });
          outcomes.push(
            `${state.machines.find((m) => m.id === id)?.name}: ${t("requested", "已請求")}`,
          );
        } catch (err) {
          outcomes.push(
            `${state.machines.find((m) => m.id === id)?.name}: ${err.message}`,
          );
        }
      }
      await refresh();
      return modal(
        t("Bulk action results", "批次操作結果"),
        `<ul>${outcomes.map((v) => `<li>${escape(v)}</li>`).join("")}</ul>`,
        t("Close", "關閉"),
        async () => {},
      );
    }
    if (action === "save-settings") {
      await api("/preferences", {
        settings: {
          theme: $("#theme").value,
          language: $("#language").value,
          motion: $("#motion").checked,
        },
      });
      localStorage.setItem("mq-theme", $("#theme").value);
      localStorage.setItem("mq-language", $("#language").value);
      await refresh();
      notify(t("Preferences saved.", "偏好已儲存。"));
      return;
    }
    if (action === "console-release") {
      consoleInput = !consoleInput;
      localStorage.setItem("mq-console-input", String(consoleInput));
      if (rfb) rfb.viewOnly = !consoleInput;
      updateConsoleControls();
      return;
    }
    if (action === "console-scale") {
      consoleScale = !consoleScale;
      localStorage.setItem("mq-console-scale", String(consoleScale));
      if (rfb) rfb.scaleViewport = consoleScale;
      updateConsoleControls();
      return;
    }
    if (action === "console-fullscreen")
      return $("#console-screen").requestFullscreen();
    if (action === "console-keys")
      return modal(
        t("Send keys", "傳送按鍵"),
        select(
          "sequence",
          t("Key sequence", "按鍵組合"),
          [
            ["ctrlaltdel", "Ctrl + Alt + Del"],
            ["ctrlaltf1", "Ctrl + Alt + F1"],
            ["ctrlaltf2", "Ctrl + Alt + F2"],
            ["escape", "Escape"],
            ["enter", "Enter"],
            ["print", "Print Screen"],
            ["meta", t("System key", "系統鍵")],
          ],
          "ctrlaltdel",
        ),
        t("Send", "傳送"),
        async (f) => {
          await api(`/machines/${selected}/keys`, { keys: f.get("sequence") });
        },
      );
    if (action === "console-reset")
      return modal(
        t("Reset this machine?", "重設這部機器？"),
        `<p>${t("Reset restarts the guest immediately. Unsaved guest work may be lost.", "重設會立即重新啟動客體，未儲存的工作可能遺失。")}</p>`,
        t("Reset machine", "重設機器"),
        async () => {
          await api(`/machines/${selected}/action`, { action: "reset" });
          await refresh();
        },
      );
    if (action === "console-text" || action === "console-clipboard") {
      if (!rfb || !consoleInput)
        throw new Error(
          t(
            "Connect the console and enable guest input first.",
            "請先連接主控台並啟用客體輸入。",
          ),
        );
      const clipboard = action === "console-clipboard";
      return modal(
        clipboard
          ? t("Send clipboard text", "傳送剪貼簿文字")
          : t("Type text into guest", "在客體輸入文字"),
        `<div class="field"><label for="guest-text">${t("Text, up to 256 characters", "文字，最多 256 字元")}</label><textarea id="guest-text" name="text" maxlength="256" required></textarea></div><p class="muted">${clipboard ? t("Guest clipboard integration is required. Sending does not prove the guest accepted the update.", "需要客體剪貼簿整合，傳送不代表客體已接受。") : t("Text is sent to the currently focused guest control. Keyboard layout and guest support affect the result.", "文字會傳送到客體目前選取的控制，結果取決於鍵盤配置及客體支援。")}</p>`,
        t("Send text", "傳送文字"),
        async (f) => {
          if (!rfb || !consoleInput)
            throw new Error(
              t("Console input is unavailable.", "主控台輸入未能使用。"),
            );
          const value = f.get("text");
          if (clipboard) rfb.clipboardPasteFrom(value);
          else
            for (const char of value) {
              const cp = char.codePointAt(0);
              const keysym =
                cp === 10
                  ? 0xff0d
                  : cp === 9
                    ? 0xff09
                    : cp <= 255
                      ? cp
                      : 0x01000000 | cp;
              rfb.sendKey(keysym);
            }
          notify(
            t(
              "Text sent to the console; guest acceptance is not verified.",
              "文字已傳送至主控台，客體是否接受仍未驗證。",
            ),
          );
        },
      );
    }
    if (action === "console-reconnect") {
      if (rfb) rfb.disconnect();
      return connectConsole();
    }
  } catch (error) {
    notify(error.message);
  } finally {
    if (b.isConnected) b.disabled = false;
  }
});
document.addEventListener("change", (e) => {
  if (e.target.matches("[data-check]")) {
    e.target.checked
      ? checked.add(e.target.dataset.check)
      : checked.delete(e.target.dataset.check);
    $("#machine-results").innerHTML = views().machineResults();
  }
});
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
    e.preventDefault();
    $("#global-search")?.focus();
  }
});
async function boot() {
  try {
    session = await api("/session");
    applySettings();
    if (session.authenticated) await refresh();
    else render();
  } catch (error) {
    $("#app").innerHTML =
      `<main class="auth"><section class="card"><h1>Connection unavailable</h1><p>${escape(error.message)}</p><p>Check that this address matches the host’s PUBLIC_ORIGIN setting.</p></section></main>`;
  }
}
await boot();
setInterval(async () => {
  if (!session?.authenticated || document.hidden) return;
  try {
    const oldConsoleState = state?.machines.find(
      (m) => m.id === selected,
    )?.state;
    await refresh(false);
    if (
      page === "console" &&
      oldConsoleState !== state.machines.find((m) => m.id === selected)?.state
    )
      render();
    if (
      ["overview", "machines", "history"].includes(page) &&
      !$("#dialog").open &&
      !document.activeElement?.matches("input,select,textarea")
    )
      render();
  } catch (error) {
    if (error.message === "Sign in to continue.") {
      session = await api("/session");
      render();
    }
  }
}, 5000);

function views() {
  return createViews({
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
  });
}

document.addEventListener("submit", (event) => {
  if (event.target.id === "machine-form") {
    event.preventDefault();
    document
      .querySelector(
        `[data-action="${wizardStep === 8 ? "wizard-create" : "wizard-next"}"]`,
      )
      ?.click();
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "isoFile" && event.target.files[0])
    $("#isoName").value = event.target.files[0].name;
});

function updateConsoleControls() {
  for (const [action, value, text] of [
    [
      "console-scale",
      consoleScale,
      consoleScale
        ? t("Scaling: fit", "縮放：符合畫面")
        : t("Scaling: native", "縮放：原始大小"),
    ],
    [
      "console-release",
      consoleInput,
      consoleInput
        ? t("Guest input: on", "客體輸入：開啟")
        : t("Guest input: off", "客體輸入：關閉"),
    ],
  ]) {
    const control = document.querySelector(`[data-action="${action}"]`);
    if (control) {
      control.textContent = text;
      control.setAttribute("aria-pressed", String(value));
    }
  }
}
new ResizeObserver(() =>
  document.documentElement.style.setProperty(
    "--notice-height",
    matchMedia("(max-width:760px)").matches
      ? `${$("#notice").getBoundingClientRect().height}px`
      : "0px",
  ),
).observe($("#notice"));

async function requestPreview() {
  const sequence = ++previewSequence,
    form = $("#machine-form"),
    output = $("#command-preview");
  if (!form || !output) return;
  const config = { ...wizard, ...Object.fromEntries(new FormData(form)) };
  try {
    const plan = await api("/machine-preview", config);
    if (sequence !== previewSequence || !$("#command-preview")) return;
    $("#command-preview").textContent = [
      plan.executable,
      ...plan.args.map((value) => JSON.stringify(value)),
    ].join(" ");
  } catch (error) {
    if (sequence === previewSequence && $("#command-preview"))
      $("#command-preview").textContent = error.message;
  }
}
document.addEventListener("input", (event) => {
  if (event.target.closest("#machine-form")) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(requestPreview, 250);
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "arch" && page === "new") {
    wizard.arch = event.target.value;
    wizard.machineType = state.capabilities[wizard.arch]?.machine;
    wizard.accelerator = "tcg";
    saveDraft(
      localStorage,
      wizard,
      wizardStep,
      editing ? wizard.id : undefined,
    );
    render();
    $("#arch")?.focus();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.closest("#machine-form")) persistDraft();
});
document.addEventListener("change", (event) => {
  if (event.target.id === "auth-language" || event.target.id === "auth-theme") {
    const remembered = Object.fromEntries(new FormData($("#auth-form")));
    localStorage.setItem("mq-language", $("#auth-language").value);
    localStorage.setItem("mq-theme", $("#auth-theme").value);
    applySettings();
    renderAuth();
    for (const [name, value] of Object.entries(remembered)) {
      const input = $("#auth-form").elements.namedItem(name);
      if (input) input.value = value;
    }
    document.getElementById(event.target.id)?.focus();
  }
});

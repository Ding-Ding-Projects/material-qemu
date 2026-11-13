import { createViews } from "./views.js";
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
  value == null ? t("Unavailable","未能提供") : `${(value / 1073741824).toFixed(1)} GiB`;
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
  $("#notice").textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("#notice").textContent = ""), 6500);
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
  if (!state.setup.complete) {
    renderOnboarding();
    return;
  }
  $("#app").innerHTML =
    `<header class="topbar"><div class="brand"><span class="mark" aria-hidden="true">▧</span>Material QEMU</div><div class="search"><input id="global-search" aria-label="${t("Search machines", "搜尋機器")}" placeholder="${t("Search machines, folders and notes", "搜尋機器、資料夾和備註")}" value="${escape(query)}"></div><span class="spacer"></span><span class="pill healthy health">● ${t("Host connected", "主機已連線")}</span>${button("logout", t("Sign out", "登出"), "ghost")}</header><div class="shell"><nav aria-label="${t("Workspace", "工作區")}">${["overview", "machines", "new"].map((k) => button(`page:${k}`, `<span aria-hidden="true">${{ overview: "▦", machines: "▤", new: "＋" }[k]}</span><span>${label(k)}</span>`, page === k ? "active" : "")).join("")}<div class="group">${t("Machines", "機器")}</div>${state.machines.map((m) => button(`console:${m.id}`, `<span aria-hidden="true">▣</span><span class="nav-name">${escape(m.name)}</span>`, "machine-nav")).join("")}<div class="group">${t("Your workspace", "你的工作區")}</div>${["settings", "history", "docs"].map((k) => button(`page:${k}`, label(k), page === k ? "active" : "")).join("")}<div class="bottom">Material QEMU 0.1.0<br>${t("Built", "建置時間")} ${escape(state.updatedAt || t("unavailable", "未能提供"))}<br>${escape(state.owner.name)}</div></nav><main class="main" id="main" tabindex="-1">${({ overview: views().overview, machines: views().machines, new: machineWizard, settings: views().settings, history: views().history, docs: views().docs, console: views().consolePage }[page] || views().overview)()}</main></div>`;
  if (page === "console") connectConsole();
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
    `<header class="topbar"><div class="brand"><span class="mark">▧</span>Material QEMU</div><span class="spacer"></span><small>0.1.0 · ${escape(session.updatedAt || t("Build time unavailable", "未能提供建置時間"))}</small></header><main class="auth"><div class="card auth-card"><section class="auth-intro"><div class="mark" aria-hidden="true">▧</div><span class="pill">${t("Your machines. Your control.", "你的機器，由你掌控。")}</span><h1 style="margin-top:24px">${t("A quieter home for your virtual machines.", "虛擬機器的安心基地。")}</h1><p class="muted">${t("One workspace for QEMU. Manage, monitor and connect, with everything running on your own host.", "一個 QEMU 工作區，管理、監察及連線，全部在你的主機上運行。")}</p><p class="muted-line">${t("Private by default. No cloud account required.", "預設私人使用，毋須雲端帳戶。")}</p></section><section class="auth-form"><h2>${setup ? t("Welcome to your new workspace", "歡迎使用新工作區") : t("Welcome back", "歡迎回來")}</h2><p class="muted">${setup ? t("Create the owner account to begin guided setup.", "建立擁有人帳戶，開始設定。") : t("Unlock your local workspace.", "解鎖你的本機工作區。")}</p>${!setup ? button("passkey-login", t("Sign in with a passkey", "使用通行密鑰登入"), "primary", 'style="width:100%;margin-bottom:22px"') : ""}<form id="auth-form">${setup ? field("owner", t("Your name", "你的名字"), "", "text", 'required autocomplete="name"') + field("bootstrap", t("Setup authorization code", "設定授權碼"), "", "password", 'required autocomplete="off"') : ""}${field("password", t("Password", "密碼"), "", "password", `required minlength="12" maxlength="256" autocomplete="${setup ? "new-password" : "current-password"}"`)}<button class="${setup ? "primary" : ""}" type="submit" style="width:100%">${setup ? t("Create owner account", "建立擁有人帳戶") : t("Sign in with password", "使用密碼登入")}</button></form><p class="muted-line">${setup ? t("The setup authorization code is stored in the host data directory. Passwords need at least 12 characters.", "設定授權碼存於主機資料目錄，密碼最少需要十二個字元。") : t("Passkeys require HTTPS or localhost. Your password remains available as a recovery method.", "通行密鑰需要 HTTPS 或 localhost。密碼仍可用作復原登入。")}</p></section></div></main>`;
  $("#auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const values = new FormData(e.target);
    try {
      const result = await api(
        setup ? "/setup" : "/login",
        { name: values.get("owner"), password: values.get("password") },
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
    content = `<h3>${t("Bring your installation media", "準備安裝媒體")}</h3><p>${t("Place your trusted ISO files in the data volume’s media directory. The host operator manages these files. A blank machine can be created without an ISO.", "將可信的 ISO 放進資料空間的 media 目錄，由主機管理者處理。也可先建立沒有 ISO 的空白機器。")}</p><div class="help">${state.media.length ? state.media.map(escape).join("<br>") : t("No ISO files found. You can add them later.", "尚未找到 ISO，可稍後新增。")}</div>${button("refresh", t("Check again", "重新檢查"))}`;
  if (n === 7)
    content = `<h3>${t("Your first machine is next", "下一步，建立第一部機器")}</h3><p>${t("The machine wizard will help you choose a platform, CPU, memory, private disk, network and display. Finish setup first, or continue with an empty workspace.", "機器精靈會帶你選擇平台、處理器、記憶體、磁碟、網絡及顯示。先完成設定，再建立機器。")}</p><p class="help">${t("Nothing starts automatically. Starting a machine is always an explicit action.", "機器不會自行啟動，每次啟動都需要你的操作。")}</p>`;
  if (n === 8)
    content = `<div class="empty"><div class="empty-icon">✓</div><h2>${t("Your workspace is ready", "工作區已準備好")}</h2><p>${t("Your owner account and preferences are saved. You can register a passkey in Settings and create your first machine.", "帳戶和偏好已儲存，可在設定登記通行密鑰，再建立第一部機器。")}</p></div>`;
  $("#app").innerHTML =
    `<header class="topbar"><div class="brand"><span class="mark">▧</span>Material QEMU</div><span class="spacer"></span><span class="pill">${t("Setup saved automatically", "設定進度自動儲存")}</span></header><main class="main wizard">${views().heading(t("Make yourself at home", "設定你的工作區"), t("A few practical steps, then you are in.", "幾個實用步驟，完成即可開始。"))}${steps(setupNames, n)}<section class="card wizard-content"><h2>${t(...setupNames[n - 1])}</h2>${content}</section><div class="wizard-footer">${n > 2 ? button("setup-back", t("Back", "上一步")) : "<span></span>"}${button(n === 8 ? "setup-finish" : "setup-next", n === 8 ? t("Open workspace", "開啟工作區") : t("Save & continue", "儲存並繼續"), "primary")}</div></main>`;
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
    content = `${field("name", t("Machine name", "機器名稱"), wizard.name, "text", 'required maxlength="80"')}${select(
      "preset",
      t("Starting point", "起點"),
      [
        ["blank", t("Blank machine", "空白機器")],
        ["linux", t("Linux workstation", "Linux 工作站")],
        ["small", t("Lightweight server", "輕量伺服器")],
      ],
      wizard.preset || "blank",
    )}<p class="help">${t("Presets choose resource defaults only. No operating system is downloaded or installed automatically.", "預設只選擇資源，不會自動下載或安裝作業系統。")}</p>`;
  if (wizardStep === 2)
    content =
      select(
        "arch",
        t("Architecture", "架構"),
        Object.entries(state.capabilities)
          .filter(([, c]) => c.available)
          .map(([arch]) => [arch, arch]),
        wizard.arch,
      ) +
      `<div class="help">${t("Only installed system emulators are offered. This release uses TCG acceleration.", "只會列出已安裝的模擬器，目前版本使用 TCG 加速。")}</div>`;
  if (wizardStep === 3)
    content = `<div class="form-grid">${field("cpus", t("Virtual CPUs", "虛擬處理器"), wizard.cpus, "number", 'min="1" max="16" required')}${field("memory", t("Memory (MiB)", "記憶體（MiB）"), wizard.memory, "number", 'min="128" max="32768" step="128" required')}</div><p class="help">${t("Available host memory", "主機可用記憶體")}: ${bytes(state.metrics.memoryTotal - state.metrics.memoryUsed)}. ${t("Leave room for the host and other machines.", "請為主機和其他機器預留空間。")}</p>`;
  if (wizardStep === 4)
    content = `<h3>${wizard.arch === "aarch64" ? "UEFI" : "SeaBIOS"}</h3><p>${t("The supported firmware is selected by the platform. Secure Boot and TPM configuration are not implemented in this release.", "韌體按平台選定。此版本尚未提供安全啟動和 TPM 設定。")}</p><div class="help">${wizard.arch === "aarch64" ? "virt · cortex-a57 · UEFI" : "q35 · max CPU · SeaBIOS"}</div>`;
  if (wizardStep === 5)
    content = `${field("diskGiB", t("Virtual disk capacity (GiB)", "虛擬磁碟容量（GiB）"), wizard.diskGiB, "number", `min="1" max="256" required ${editing ? "readonly" : ""}`)}${select("iso", t("Installation ISO", "安裝 ISO"), [["", t("No installation media", "沒有安裝媒體")], ...state.media.map((f) => [f, f])], wizard.iso || "")}<p class="help">${t("A sparse QCOW2 disk is created inside managed storage. No existing host disk is touched. Disk resizing is not yet available.", "QCOW2 磁碟只會在管理空間內建立，不會觸碰現有主機磁碟。目前未提供調整容量。")}</p>`;
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
      [t("Platform", "平台"), wizard.arch],
      [t("CPU","處理器"), `${wizard.cpus} vCPU`],
      [t("Memory", "記憶體"), `${wizard.memory} MiB`],
      [t("Disk", "磁碟"), `${wizard.diskGiB} GiB · QCOW2`],
      [t("Network", "網絡"), enumLabel(wizard.network)],
      ["ISO", wizard.iso || t("None", "沒有")],
      [t("Folder", "資料夾"), wizard.folder || t("Unfiled", "未分類")],
    ]
      .map(([k, v]) => `<dt>${k}</dt><dd>${escape(v)}</dd>`)
      .join(
        "",
      )}</dl><div class="help">${t("Review before saving. The machine will remain stopped until you explicitly start it.", "儲存前請檢查。機器會保持停止，直至你親自啟動。")}</div>`;
  return (
    views().heading(
      editing ? t("Edit machine", "編輯機器") : label("new"),
      t(
        "Start with the essentials. Every choice belongs to this machine.",
        "由基本設定開始，每個選擇只屬於這部機器。",
      ),
    ) +
    `<div class="wizard">${steps(machineSteps, wizardStep)}<form id="machine-form"><section class="card wizard-content"><h2>${t(...machineSteps[wizardStep - 1])}</h2>${content}</section><div class="wizard-footer"><div class="actions">${button("page:machines", t("Cancel", "取消"), "ghost")}${wizardStep > 1 ? button("wizard-back", t("Back", "上一步")) : ""}</div>${button(wizardStep === 8 ? "wizard-create" : "wizard-next", wizardStep === 8 ? t("Save machine", "儲存機器") : t("Continue", "繼續"), "primary")}</div></form></div>`
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
    rfb.scaleViewport = true;
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
  wizardStep = 1;
  let draft = null;
  if (!machine) {
    try {
      draft = JSON.parse(localStorage.getItem("mq-machine-draft"));
    } catch {}
  }
  wizard = machine
    ? { ...machine }
    : draft || {
        name: "",
        arch:
          Object.keys(state.capabilities).find(
            (k) => state.capabilities[k].available,
          ) || "x86_64",
        cpus: 2,
        memory: 2048,
        diskGiB: 20,
        network: "none",
        iso: "",
        folder: "",
        notes: "",
      };
  page = "new";
  render();
}
function saveWizard() {
  const form = $("#machine-form");
  if (!form.reportValidity()) return false;
  const values = Object.fromEntries(new FormData(form));
  if (wizardStep === 1 && values.preset !== wizard.preset) {
    if (values.preset === "linux")
      Object.assign(wizard, { cpus: 2, memory: 4096, diskGiB: 32 });
    if (values.preset === "small")
      Object.assign(wizard, { cpus: 1, memory: 512, diskGiB: 8 });
  }
  Object.assign(wizard, values);
  localStorage.setItem("mq-machine-draft", JSON.stringify(wizard));
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
      await callback(new FormData(e.target));
      d.close();
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
    if (action.startsWith("page:")) {
      page = action.slice(5);
      if (page === "new") return startWizard();
      render();
      return;
    }
    if (action === "new") return startWizard();
    if (action === "refresh") return refresh();
    if (action === "logout") {
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
        },
      });
      return refresh();
    }
    if (action === "wizard-next") {
      if (saveWizard()) {
        wizardStep++;
        render();
      }
      return;
    }
    if (action === "wizard-back") {
      saveWizard();
      wizardStep--;
      render();
      return;
    }
    if (action === "wizard-create") {
      b.disabled = true;
      await api(editing ? `/machines/${wizard.id}` : "/machines", wizard);
      localStorage.removeItem("mq-machine-draft");
      page = "machines";
      await refresh();
      notify(t("Machine saved.", "機器已儲存。"));
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
            `${state.machines.find((m) => m.id === id)?.name}: ${t("requested","已請求")}`,
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
      if (rfb) {
        rfb.viewOnly = !rfb.viewOnly;
        notify(
          rfb.viewOnly
            ? t("Guest input released.", "客體輸入已解除。")
            : t("Guest input enabled.", "客體輸入已啟用。"),
        );
      }
      return;
    }
    if (action === "console-scale") {
      if (rfb) {
        rfb.scaleViewport = !rfb.scaleViewport;
        notify(t("Console scaling changed.", "主控台縮放已更改。"));
      }
      return;
    }
    if (action === "console-fullscreen")
      return $("#console-screen").requestFullscreen();
    if (action === "console-keys") {
      await api(`/machines/${selected}/keys`, { keys: "ctrlaltdel" });
      return;
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

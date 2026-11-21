import {
  SECTIONS,
  BUSES,
  NIC_MODELS,
  DISPLAYS,
  SOUNDS,
  totalCpus,
} from "./machine-form.js";

const unavailableV2 = ["Needs a newer server", "需要較新的伺服器"];
export function hostFlags(host) {
  const arr = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : x?.name)).filter(Boolean) : []);
  return {
    known: Boolean(host),
    uefi: Boolean(host?.firmware?.uefi),
    secureBoot: Boolean(host?.firmware?.secureBoot),
    tpm: Boolean(host?.swtpm),
    accelerators: arr(host?.accelerators),
    cpuModels: arr(host?.cpuModels),
    cpuFlags: arr(host?.cpuFlags),
    targets: arr(host?.targets),
  };
}
export function renderCreate(ctx) {
  const { state, t, escape, button, host, cfg, section, editing, onboarding } = ctx;
  const flags = hostFlags(host);
  const why = (ok, reasonEn, reasonYue) =>
    ok ? "" : `<p class="reason">${t(reasonEn, reasonYue)}</p>`;
  const f = (path, v, type = "") => `data-f="${path}" ${type ? `data-type="${type}"` : ""}`;
  const input = (path, title, value, type = "text", extra = "") =>
    `<div class="field"><label for="f-${path}">${title}</label><input id="f-${path}" ${f(path, value, type === "number" ? "number" : "")} type="${type}" value="${escape(value ?? "")}" ${extra}></div>`;
  const sel = (path, title, options, value, extra = "") =>
    `<div class="field"><label for="f-${path}">${title}</label><select id="f-${path}" ${f(path)} ${extra}>${options
      .map(([v, l, disabled]) => `<option value="${escape(v)}" ${v === value ? "selected" : ""} ${disabled ? "disabled" : ""}>${escape(l)}</option>`)
      .join("")}</select></div>`;
  const toggle = (path, label, on, disabled = false, reason = "") =>
    `<button type="button" data-action="cfg-toggle:${path}" aria-pressed="${on}" ${disabled ? "disabled" : ""} ${reason ? `title="${escape(reason)}"` : ""}>${label}</button>`;
  const caps = state.capabilities[cfg.arch];
  const archChoices = Object.entries(state.capabilities)
    .filter(([, c]) => c.available)
    .map(([a]) => [a, a]);
  const recipes = (caps?.selectableRecipes || []).map((r) => [
    r.machineType,
    `${r.machineType} · ${r.description}`,
  ]);
  if (cfg.machineType && !recipes.some(([v]) => v === cfg.machineType))
    recipes.unshift([cfg.machineType, cfg.machineType]);
  const accel = (caps?.accelerators || []).filter((a) => a.usable);
  const accelChoices = (accel.length ? accel.map((a) => a.name) : ["tcg"]).map((name) => [
    name,
    name.toUpperCase() + (name === "tcg" ? " (software)" : ""),
  ]);
  const sections = {
    system: () => `<h2>${t("System and firmware", "系統及韌體")}</h2><div class="form-grid">${sel("arch", t("Architecture", "架構"), archChoices, cfg.arch)}${sel("machineType", t("Machine type", "機器類型"), recipes, cfg.machineType)}${sel("accelerator", t("Accelerator", "加速方式"), accelChoices, cfg.accelerator)}${sel("firmware", t("Firmware", "韌體"), [["bios", "BIOS (SeaBIOS)"], ["uefi", flags.uefi ? "UEFI (OVMF)" : `UEFI (${t(...(flags.known ? ["not installed on this host", "此主機未安裝"] : unavailableV2))})`, !flags.uefi]], cfg.firmware)}</div>${why(flags.uefi, flags.known ? "UEFI firmware was not found on this host." : "Firmware choices come from the host and need a newer server.", flags.known ? "此主機找不到 UEFI 韌體。" : "韌體選項由主機提供，需要較新的伺服器。")}<div class="toggle-chips">${toggle("secureBoot", t("Secure Boot", "安全啟動"), cfg.secureBoot && cfg.firmware === "uefi", !flags.secureBoot || cfg.firmware !== "uefi", !flags.secureBoot ? t(...unavailableV2) : t("Needs UEFI", "需要 UEFI"))}${toggle("tpm", t("TPM 2.0", "TPM 2.0"), cfg.tpm, !flags.tpm, t(...unavailableV2))}</div>${why(flags.secureBoot && flags.tpm, "Secure Boot and TPM need UEFI, signed firmware variables and swtpm on the host.", "安全啟動及 TPM 需要主機有 UEFI、已簽署韌體變數和 swtpm。")}<div class="form-grid">${sel("firmwareImage", t("Firmware image", "韌體映像"), [["", cfg.firmware === "uefi" ? t("Built-in OVMF", "內建 OVMF") : t("Built-in", "內建")], ...(ctx.firmware?.images || []).map((f) => [f.name, f.name]), ...(cfg.firmwareImage && !(ctx.firmware?.images || []).some((f) => f.name === cfg.firmwareImage) ? [[cfg.firmwareImage, cfg.firmwareImage + " " + t("(missing)", "（不存在）")]] : [])], cfg.firmwareImage || "")}</div><p class="help">${t("Add your own images in Storage, Firmware. A custom image replaces SeaBIOS, or the UEFI code when the firmware is UEFI.", "可在「儲存空間」的「韌體」新增自訂映像。自訂映像會取代 SeaBIOS；韌體為 UEFI 時則取代 UEFI 程式碼。")}</p><p class="help">${t("Choices come from the installed QEMU. Hardware acceleration still needs a successful launch on this host.", "選項來自已安裝的 QEMU，硬件加速仍需在此主機成功啟動才算驗證。")}</p>`,
    cpu: () => {
      const models = flags.cpuModels.length ? flags.cpuModels : ["max", "host", "qemu64"];
      return `<h2>${t("CPU and memory", "處理器及記憶體")}</h2><div class="form-grid">${sel("cpuModel", t("CPU model", "處理器型號"), models.map((m) => [m, m]), cfg.cpuModel)}${input("memory", t("Memory (MiB)", "記憶體（MiB）"), cfg.memory, "number", 'min="128" max="1048576" step="128"')}</div><div class="form-grid">${input("sockets", t("Sockets", "插槽"), cfg.sockets, "number", 'min="1" max="8"')}${input("cores", t("Cores", "核心"), cfg.cores, "number", 'min="1" max="64"')}${input("threads", t("Threads", "執行緒"), cfg.threads, "number", 'min="1" max="4"')}</div><p class="muted-line"><strong id="vcpu-total">${totalCpus(cfg)}</strong> ${t("virtual CPUs in total", "個虛擬處理器")}</p><div class="toggle-chips" role="group" aria-label="${t("Memory presets", "記憶體預設")}">${[1024, 2048, 4096, 8192, 16384].map((m) => `<button type="button" data-action="cfg-mem:${m}" aria-pressed="${Number(cfg.memory) === m}">${m / 1024} GiB</button>`).join("")}</div><p class="muted-line">${t("Available host memory", "主機可用記憶體")}: ${ctx.bytes(state.metrics.memoryTotal - state.metrics.memoryUsed)}. ${t("Leave room for the host and other machines.", "請為主機和其他機器預留空間。")}</p><div class="toggle-chips" style="margin-top:12px">${toggle("balloon", t("Memory balloon", "記憶體氣球"), cfg.balloon)}</div><h3 class="sub">${t("NUMA", "NUMA")}</h3><div class="form-grid">${sel("numaNodes", t("NUMA nodes", "NUMA 節點"), [["0", t("Off (one node)", "關閉（單一節點）")], ...[2, 3, 4, 5, 6, 7, 8].map((n) => [String(n), t(`${n} nodes`, `${n} 個節點`), n > totalCpus(cfg) || n * 64 > Number(cfg.memory)])], String(cfg.numaNodes || 0))}</div><p class="help">${t("Memory and virtual CPUs are split evenly across the nodes. Each node needs at least one virtual CPU and 64 MiB.", "記憶體及虛擬處理器會平均分配到各節點，每個節點最少要一個虛擬處理器及 64 MiB。")}</p>${["x86_64", "i386"].includes(cfg.arch) ? `<h3 class="sub">${t("CPU flags", "處理器旗標")}</h3>${(cfg.cpuFlags || []).map((fl, i) => `<div class="item-row slim">${input(`cpuFlags.${i}.name`, t("Flag", "旗標"), fl.name, "text", `list="cpu-flag-names" maxlength="40" spellcheck="false" autocomplete="off"`)}${sel(`cpuFlags.${i}.on`, t("Setting", "設定"), [["true", t("On", "開啟")], ["false", t("Off", "關閉")]], String(fl.on !== false && fl.on !== "false"))}${button(`cfg-del-flag:${i}`, '<span class="icon" aria-hidden="true">delete</span>', "icon-btn", `aria-label="${escape(t("Remove flag ", "移除旗標 ") + fl.name)}"`)}</div>`).join("")}<datalist id="cpu-flag-names">${flags.cpuFlags.map((n) => `<option value="${escape(n)}"></option>`).join("")}</datalist><div class="actions">${button("cfg-add-flag", `<span class="icon" aria-hidden="true">add</span>${t("Add CPU flag", "新增處理器旗標")}`, "", (cfg.cpuFlags || []).length >= 24 ? "disabled" : "")}</div><p class="help">${flags.cpuFlags.length ? t(`Turn individual features on or off on top of the CPU model. This QEMU build recognizes ${flags.cpuFlags.length} flags.`, `在處理器型號之上開啟或關閉個別功能。此 QEMU 版本識別 ${flags.cpuFlags.length} 個旗標。`) : t("Turn individual features on or off on top of the CPU model.", "在處理器型號之上開啟或關閉個別功能。")}</p>` : ""}`;
    },
    disks: () => `<h2>${t("Disks", "磁碟")}</h2>${cfg.disks.map((d, i) => `<div class="item-row"><div class="field"><label for="f-disks.${i}.name">${t("Name", "名稱")}</label><input id="f-disks.${i}.name" ${f(`disks.${i}.name`)} value="${escape(d.name)}" maxlength="40"></div><div class="field"><label for="f-disks.${i}.sizeGiB">GiB</label><input id="f-disks.${i}.sizeGiB" type="number" ${f(`disks.${i}.sizeGiB`, 0, "number")} value="${escape(d.sizeGiB)}" min="1" max="65536"></div>${sel(`disks.${i}.bus`, t("Bus", "匯流排"), BUSES.map((b) => [b, b]), d.bus)}${sel(`disks.${i}.format`, t("Format", "格式"), [["qcow2", "qcow2"], ["raw", "raw"]], d.format)}${sel(`disks.${i}.cache`, t("Cache", "快取"), ["writeback", "writethrough", "none", "unsafe"].map((c) => [c, c]), d.cache)}<div class="field"><span>${t("Discard", "丟棄")}</span>${toggle(`disks.${i}.discard`, t("TRIM", "TRIM"), d.discard)}</div>${button(`cfg-del-disk:${i}`, `<span class="icon" aria-hidden="true">delete</span>`, "icon-btn", `aria-label="${t("Remove disk", "移除磁碟")} ${escape(d.name)}" ${cfg.disks.length < 2 ? "disabled" : ""}`)}</div>`).join("")}<div class="actions">${button("cfg-add-disk", `<span class="icon" aria-hidden="true">add</span>${t("Add disk", "新增磁碟")}`)}</div><h3 class="sub">${t("CD / DVD drives", "光碟機")}</h3>${cfg.cdroms.map((c, i) => `<div class="item-row slim"><div class="field"><label for="f-cdroms.${i}">${t("Image", "映像")}</label><select id="f-cdroms.${i}" ${f(`cdroms.${i}`)}>${[["", t("Empty drive", "空光碟機")], ...state.media.map((m) => [m, m])].map(([v, l]) => `<option value="${escape(v)}" ${v === c ? "selected" : ""}>${escape(l)}</option>`).join("")}</select></div>${button(`cfg-del-cd:${i}`, `<span class="icon" aria-hidden="true">delete</span>`, "icon-btn", `aria-label="${t("Remove drive", "移除光碟機")}"`)}</div>`).join("")}<div class="actions">${button("cfg-add-cd", `<span class="icon" aria-hidden="true">album</span>${t("Add CD / ISO", "新增光碟")}`)}${button("page:storage", t("Upload an ISO", "上傳 ISO"), "ghost")}</div><p class="help">${t("Bus: VirtIO, SATA, NVMe, SCSI or IDE. Format: qcow2 (snapshots, thin) or raw. Disks are created in managed storage only; no host disk is touched.", "匯流排：VirtIO、SATA、NVMe、SCSI 或 IDE。格式：qcow2（快照、精簡佈建）或 raw。磁碟只會在管理儲存空間內建立，不會觸碰主機磁碟。")}</p>`,
    network: () => `<h2>${t("Network", "網絡")}</h2><div class="form-grid">${sel("network.mode", t("Mode", "模式"), [["user", t("User (NAT, port forwards)", "使用者模式（NAT、端口轉送）")], ["none", t("None", "不連網")]], cfg.network.mode)}${sel("network.model", t("NIC model", "網卡型號"), NIC_MODELS.map((m) => [m, m]), cfg.network.model)}${input("network.mac", t("MAC address", "MAC 位址"), cfg.network.mac, "text", `placeholder="${t("Automatic", "自動")}" pattern="([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}|"`)}</div><h3 class="sub">${t("Port forwards", "端口轉送")}</h3>${cfg.network.forwards.map((fw, i) => `<div class="item-row">${sel(`network.forwards.${i}.proto`, t("Protocol", "協定"), [["tcp", "TCP"], ["udp", "UDP"]], fw.proto)}${input(`network.forwards.${i}.hostPort`, t("Host port", "主機端口"), fw.hostPort, "number", 'min="1" max="65535"')}${input(`network.forwards.${i}.guestPort`, t("Guest port", "客體端口"), fw.guestPort, "number", 'min="1" max="65535"')}${button(`cfg-del-fwd:${i}`, `<span class="icon" aria-hidden="true">delete</span>`, "icon-btn", `aria-label="${t("Remove port forward", "移除端口轉送")}"`)}</div>`).join("")}<div class="actions">${button("cfg-add-fwd", `<span class="icon" aria-hidden="true">add</span>${t("Add port forward", "新增端口轉送")}`, "", cfg.network.mode === "user" ? "" : "disabled")}</div>${cfg.network.mode === "user" ? "" : why(false, "Port forwards need user-mode networking.", "端口轉送需要使用者模式網絡。")}<p class="help">${t("Restricted user-mode networking blocks guest access to the host. Bridges are not offered.", "受限制使用者模式網絡會阻止客體存取主機，不提供橋接。")}</p>`,
    display: () => `<h2>${t("Display, sound and input", "顯示、音效及輸入")}</h2><div class="form-grid">${sel("display.adapter", t("Graphics", "顯示卡"), DISPLAYS.map((d) => [d, { virtio: "virtio-gpu", std: "std VGA", qxl: "QXL", ramfb: "ramfb", none: t("none (headless)", "無（無頭）") }[d]]), cfg.display.adapter)}${sel("sound", t("Sound", "音效"), SOUNDS.map((s) => [s, { none: t("None", "無"), hda: "Intel HDA", ac97: "AC97" }[s]]), cfg.sound)}</div><div class="toggle-chips">${toggle("usb.tablet", t("USB tablet (absolute mouse)", "USB 手寫板（絕對滑鼠）"), cfg.usb.tablet)}${toggle("usb.keyboard", t("USB keyboard", "USB 鍵盤"), cfg.usb.keyboard)}${toggle("serial", t("Serial console", "序列主控台"), cfg.serial)}${toggle("rng", t("VirtIO RNG", "VirtIO 亂數產生器"), cfg.rng)}</div><p class="help">${t("The browser console uses VNC inside the host and is proxied through your authenticated session.", "瀏覽器主控台使用主機內的 VNC，經已驗證的登入工作階段轉送。")}</p>`,
    boot: () => `<h2>${t("Boot and automation", "啟動及自動化")}</h2><h3 class="sub">${t("Boot order", "啟動次序")}</h3><ol class="boot-list">${cfg.bootOrder.map((d, i) => `<li><b>${i + 1}</b><span style="flex:1">${{ cdrom: t("CD / DVD", "光碟"), disk: t("Disk", "磁碟"), net: t("Network", "網絡") }[d]}</span>${button(`cfg-boot:${d}:-1`, `<span class="icon" aria-hidden="true">arrow_upward</span>`, "icon-btn", `aria-label="${t("Move up", "上移")}" ${i === 0 ? "disabled" : ""}`)}${button(`cfg-boot:${d}:1`, `<span class="icon" aria-hidden="true">arrow_downward</span>`, "icon-btn", `aria-label="${t("Move down", "下移")}" ${i === cfg.bootOrder.length - 1 ? "disabled" : ""}`)}</li>`).join("")}</ol><div class="toggle-chips" style="margin:16px 0">${toggle("bootMenu", t("Boot menu", "啟動選單"), cfg.bootMenu)}${toggle("autostart", t("Start with the host", "隨主機啟動"), cfg.autostart)}${editing ? "" : toggle("startAfterCreate", t("Start after creating", "建立後啟動"), cfg.startAfterCreate)}</div><div class="form-grid">${sel("folder", t("Folder", "資料夾"), [["", t("Unfiled", "未分類")], ...state.folders.map((x) => [x, x])], cfg.folder)}${input("notes", t("Notes", "備註"), cfg.notes, "text", 'maxlength="2000"')}${input("uuid", t("SMBIOS UUID", "SMBIOS UUID"), cfg.uuid, "text", `maxlength="36" spellcheck="false" pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" placeholder="${t("Automatic: the machine's own id", "自動：使用機器本身的 ID")}"`)}</div><p class="help">${t("Guests see this UUID in their firmware tables. Leave it empty to use the machine's own id, which stays the same for the life of the machine.", "客體會在韌體表看到這個 UUID。留空會使用機器本身的 ID，機器存在期間不會改變。")}</p>`,
  };
  const hints = {
    system: `${cfg.arch} · ${cfg.firmware === "uefi" ? "UEFI" : "BIOS"}`,
    cpu: `${totalCpus(cfg)} vCPU · ${cfg.memory} MiB`,
    disks: `${cfg.disks.length} · ${cfg.disks.reduce((n, d) => n + Number(d.sizeGiB || 0), 0)} GiB`,
    network: cfg.network.mode === "none" ? t("None", "無") : `${cfg.network.model}${cfg.network.forwards.length ? ` · ${cfg.network.forwards.length} ${t("forwards", "轉送")}` : ""}`,
    display: `${cfg.display.adapter} · ${cfg.sound}`,
    boot: cfg.bootOrder.join(" → "),
  };
  const names = {
    system: t("System and firmware", "系統及韌體"),
    cpu: t("CPU and memory", "處理器及記憶體"),
    disks: t("Disks", "磁碟"),
    network: t("Network", "網絡"),
    display: t("Display and devices", "顯示及裝置"),
    boot: t("Boot and automation", "啟動及自動化"),
  };
  const presets = [
    ["blank", t("Blank", "空白")],
    ["server", t("Linux server", "Linux 伺服器")],
    ["desktop", t("Linux desktop", "Linux 桌面")],
    ["windows", "Windows 11"],
  ];
  return `<form id="machine-form" class="create" novalidate><div class="create-head"><button type="button" class="icon-btn tonal" data-action="${onboarding ? "page:overview" : "page:machines"}" aria-label="${t("Back", "返回")}"><span class="icon" aria-hidden="true">arrow_back</span></button><div class="title"><div class="crumb">${editing ? t("Edit machine", "編輯機器") : t("New machine", "新增機器")}</div><label class="sr-only" for="f-name">${t("Machine name", "機器名稱")}</label><input id="f-name" ${f("name")} value="${escape(cfg.name)}" placeholder="${t("Machine name", "機器名稱")}" maxlength="80" required autocomplete="off"></div>${editing ? "" : `<div class="segmented" role="group" aria-label="${t("Preset", "預設")}">${presets.map(([id, label]) => `<button type="button" data-action="cfg-preset:${id}" aria-pressed="${cfg.preset === id}">${label}</button>`).join("")}</div>`}<div class="actions">${button(onboarding ? "page:overview" : "page:machines", t("Cancel", "取消"), "ghost")}${button("wizard-create", editing ? t("Save machine", "儲存機器") : t("Create", "建立"), "primary")}${editing ? "" : button("wizard-create-start", t("Create and start", "建立並啟動"), "")}</div></div><div class="create-body"><nav class="sections" aria-label="${t("Sections", "分區")}">${SECTIONS.map((s) => `<button type="button" data-action="cfg-section:${s}" aria-current="${section === s}"><span>${names[s]}</span><small>${escape(hints[s])}</small></button>`).join("")}</nav><section class="card pane" id="create-pane" aria-live="polite">${sections[section]()}</section><aside class="card preview-card"><h3>${t("Launch preview", "啟動預覽")}</h3><pre id="command-preview" aria-live="polite"></pre><p class="muted-line">${t("Generated by the server. Placeholders stand for private paths and ports assigned at launch. This preview executes nothing.", "由伺服器產生，佔位文字代表啟動時分配的私人路徑和端口，預覽不會執行任何指令。")}</p></aside></div></form>`;
}

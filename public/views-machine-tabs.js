// Machine page tabs beyond the overview: the full hardware list, read-only
// monitor queries, and the QEMU and serial logs. Data for Monitor and Log is
// fetched by app.js; these functions only draw what was received.

export const MACHINE_TABS = [
  ["overview", "Overview", "概覽", "dashboard"],
  ["hardware", "Hardware", "硬件", "memory"],
  ["monitor", "Monitor", "監察", "monitor_heart"],
  ["log", "Log", "記錄", "receipt_long"],
];

export const QUERY_LABELS = {
  status: ["Run state", "執行狀態"],
  version: ["QEMU version", "QEMU 版本"],
  cpus: ["Virtual CPUs", "虛擬處理器"],
  memory: ["Memory size", "記憶體大小"],
  balloon: ["Memory balloon", "記憶體氣球"],
  block: ["Block devices", "區塊裝置"],
  blockstats: ["Disk input and output", "磁碟讀寫"],
  chardev: ["Character devices", "字元裝置"],
  vnc: ["Display server", "顯示伺服器"],
  mice: ["Pointer devices", "指標裝置"],
  kvm: ["KVM acceleration", "KVM 加速"],
  iothreads: ["I/O threads", "I/O 執行緒"],
};

export function machineTabBar({ t, button }, tab) {
  return `<div class="chips machine-tabs" role="tablist" aria-label="${t("Machine views", "機器檢視")}">${MACHINE_TABS.map(([id, en, yue, icon]) =>
    button(`machine-tab:${id}`, `<span class="icon" aria-hidden="true">${icon}</span>${t(en, yue)}`, tab === id ? "selected" : "", `role="tab" aria-selected="${tab === id}" aria-controls="machine-tab-panel"`)).join("")}</div>`;
}

const yesNo = (t, v) => (v ? t("On", "開啟") : t("Off", "關閉"));

export function hardwareView({ t, escape }, m) {
  const rows = (pairs) => pairs.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `<div class="hw-row"><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  const section = (title, icon, pairs) => `<section class="card hw-card"><h2><span class="icon" aria-hidden="true">${icon}</span>${title}</h2><dl>${rows(pairs)}</dl></section>`;
  const disks = Array.isArray(m.disks) && m.disks.length ? m.disks : [{ name: "system", sizeGiB: m.diskGiB, format: "qcow2" }];
  const net = typeof m.network === "object" && m.network ? m.network : { mode: m.network || "user" };
  const cpus = m.sockets ? m.sockets * m.cores * (m.threads || 1) : m.cpus;
  const mono = (v) => `<code>${escape(String(v))}</code>`;
  return `<div class="hw-grid">
${section(t("System", "系統"), "developer_board", [
    [t("Architecture", "架構"), mono(m.arch || "")],
    [t("Machine type", "機器類型"), mono(m.machineType || "")],
    [t("Accelerator", "加速器"), escape(String(m.accelerator || "").toUpperCase())],
    [t("SMBIOS UUID", "SMBIOS UUID"), m.uuid ? mono(m.uuid) : `${mono(m.id)} <small class="muted">${t("(the machine ID)", "（機器編號）")}</small>`],
    [t("Start with the host", "隨主機啟動"), yesNo(t, m.autostart)],
  ])}
${section(t("Processor and memory", "處理器及記憶體"), "memory", [
    [t("Virtual CPUs", "虛擬處理器"), String(cpus)],
    [t("Topology", "拓撲"), m.sockets ? t(`${m.sockets} sockets × ${m.cores} cores × ${m.threads || 1} threads`, `${m.sockets} 插槽 × ${m.cores} 核心 × ${m.threads || 1} 執行緒`) : ""],
    [t("CPU model", "處理器型號"), mono(m.cpuModel || "default")],
    [t("Memory", "記憶體"), `${m.memory} MiB`],
    [t("Memory balloon", "記憶體氣球"), yesNo(t, m.balloon)],
  ])}
${section(t("Firmware", "韌體"), "shield", [
    [t("Firmware", "韌體"), m.firmware === "uefi" ? "UEFI" : "BIOS"],
    [t("Secure Boot", "安全開機"), yesNo(t, m.secureBoot)],
    [t("TPM 2.0", "TPM 2.0"), yesNo(t, m.tpm)],
    [t("Boot menu", "開機選單"), yesNo(t, m.bootMenu)],
    [t("Boot order", "開機次序"), escape((m.bootOrder || []).join(" → ") || t("Default", "預設"))],
  ])}
<section class="card hw-card wide"><h2><span class="icon" aria-hidden="true">hard_drive</span>${t("Disks and media", "磁碟及媒體")}</h2><div class="table-wrap"><table><thead><tr><th>${t("Name", "名稱")}</th><th>${t("Size", "容量")}</th><th>${t("Format", "格式")}</th><th>${t("Bus", "匯流排")}</th><th>${t("Cache", "快取")}</th></tr></thead><tbody>${disks.map((d) => `<tr><td>${escape(d.name || "")}</td><td>${escape(String(d.sizeGiB ?? ""))} GiB</td><td>${escape(d.format || "qcow2")}</td><td>${escape(d.bus || "virtio")}</td><td>${escape(d.cache || "writeback")}</td></tr>`).join("")}${(m.cdroms || (m.iso ? [m.iso] : [])).map((c) => `<tr><td><span class="icon small" aria-hidden="true">album</span> ${escape(c)}</td><td>–</td><td>ISO</td><td>${t("CD-ROM", "光碟機")}</td><td>–</td></tr>`).join("")}</tbody></table></div></section>
${section(t("Network", "網絡"), "lan", [
    [t("Mode", "模式"), escape(net.mode === "none" ? t("Disconnected", "已斷開") : net.restrict ? t("User mode, restricted (no outside access)", "用戶模式，受限（不可連外）") : t("User mode", "用戶模式"))],
    [t("Adapter", "網卡"), net.mode === "none" ? "" : mono(net.model || "virtio")],
    [t("MAC address", "MAC 位址"), net.mac ? mono(net.mac) : ""],
    [t("Port forwards", "連接埠轉發"), (net.forwards || []).length ? net.forwards.map((f) => mono(`${f.proto} ${f.hostPort} → ${f.guestPort}`)).join(" ") : net.mode === "none" ? "" : t("None", "沒有")],
  ])}
${section(t("Devices", "裝置"), "devices", [
    [t("Display adapter", "顯示卡"), mono(m.display?.adapter || m.display || "std")],
    [t("Sound", "音效"), mono(m.sound || "none")],
    [t("USB tablet", "USB 數位板"), yesNo(t, m.usb ? m.usb.tablet !== false : true)],
    [t("USB keyboard", "USB 鍵盤"), yesNo(t, m.usb?.keyboard)],
    [t("Serial console log", "序列主控台記錄"), yesNo(t, m.serial)],
    [t("Random number generator", "亂數產生器"), yesNo(t, m.rng)],
  ])}
</div><button type="button" data-action="edit:${escape(m.id)}"><span class="icon" aria-hidden="true">edit</span>${t("Edit hardware", "編輯硬件")}</button>`;
}

// Draws a QEMU monitor result as rows of key and value, readable without JSON.
export function formatMonitorValue(value, escape, depth = 0) {
  if (value === null || value === undefined) return `<span class="muted">–</span>`;
  if (typeof value !== "object") return escape(String(value));
  if (Array.isArray(value)) {
    if (!value.length) return `<span class="muted">[ ]</span>`;
    if (depth > 3) return escape(JSON.stringify(value).slice(0, 200));
    return `<ol class="mon-list">${value.slice(0, 64).map((v) => `<li>${formatMonitorValue(v, escape, depth + 1)}</li>`).join("")}</ol>${value.length > 64 ? `<span class="muted">… ${value.length - 64}</span>` : ""}`;
  }
  if (depth > 3) return escape(JSON.stringify(value).slice(0, 200));
  return `<dl class="mon-obj">${Object.entries(value).map(([k, v]) => `<div><dt>${escape(k)}</dt><dd>${formatMonitorValue(v, escape, depth + 1)}</dd></div>`).join("")}</dl>`;
}

export function monitorView({ t, escape, button }, m, view) {
  const running = ["running", "paused", "prelaunch", "starting"].includes(m.state);
  const chosen = view.query || "status";
  const queries = Object.keys(QUERY_LABELS);
  const r = view.results?.[chosen];
  const body = !running
    ? `<p class="muted-line">${t("Start the machine to query its monitor.", "啟動機器後即可查詢監察器。")}</p>`
    : !r ? `<p class="muted-line">${t("Asking QEMU…", "正在查詢 QEMU…")}</p>`
    : !r.ok ? `<p class="error-text" role="alert">${escape(r.error)}</p>`
    : `<div class="mon-result">${formatMonitorValue(r.result, escape)}</div><details class="mon-raw"><summary>${t("Raw reply", "原始回覆")}</summary><pre>${escape(JSON.stringify(r.result, null, 2))}</pre></details>`;
  return `<div class="monitor-layout"><nav class="card mon-nav" aria-label="${t("Monitor queries", "監察查詢")}"><p class="muted-line">${t("Read-only questions to QEMU. None of them change the machine.", "向 QEMU 查詢，唯讀，不會更改機器。")}</p><ul>${queries.map((q) => `<li>${button(`monitor-query:${q}`, `${t(...QUERY_LABELS[q])}<small class="mono">query-${q === "cpus" ? "cpus-fast" : q === "memory" ? "memory-size-summary" : q}</small>`, chosen === q ? "selected" : "", `aria-pressed="${chosen === q}"${running ? "" : " disabled"}`)}</li>`).join("")}</ul></nav><section class="card mon-out" aria-live="polite"><div class="toolbar"><h2>${t(...QUERY_LABELS[chosen])}</h2>${button(`monitor-query:${chosen}`, `<span class="icon" aria-hidden="true">refresh</span>${t("Ask again", "再次查詢")}`, "ghost", running ? "" : "disabled")}</div>${body}${r?.at ? `<p class="muted-line">${t("Answered at", "回覆時間")} <time>${escape(new Date(r.at).toLocaleTimeString())}</time></p>` : ""}</section></div>`;
}

export function logView({ t, escape, button, bytes }, m, log) {
  if (!log) return `<p class="muted-line">${t("Loading the log…", "正在載入記錄…")}</p>`;
  if (log.error) return `<p class="error-text" role="alert">${escape(log.error)}</p>`;
  const serial = !log.serialEnabled
    ? `<p class="muted-line">${t("Serial console logging is off for this machine. Turn it on in Edit hardware to keep the guest's console output here.", "此機器沒有開啟序列主控台記錄。可在「編輯硬件」開啟，以保留客體主控台輸出。")}</p>`
      : !log.serial || !log.serial.size ? `<p class="muted-line">${t("No serial output yet.", "暫時沒有序列輸出。")}</p>`
    : `<p class="muted-line">${log.serial.cut ? t(`Last 64 KiB of ${bytes(log.serial.size)}.`, `共 ${bytes(log.serial.size)}，顯示最後 64 KiB。`) : bytes(log.serial.size)} · ${t("updated", "更新於")} ${escape(new Date(log.serial.modified).toLocaleString())}</p><pre class="log-pre" tabindex="0" aria-label="${t("Serial console output", "序列主控台輸出")}">${escape(log.serial.text)}</pre>`;
  return `<div class="log-layout"><section class="card"><div class="toolbar"><h2>${t("QEMU messages", "QEMU 訊息")}</h2>${button("log-refresh", `<span class="icon" aria-hidden="true">refresh</span>${t("Refresh", "重新整理")}`, "ghost")}</div>${log.qemuOutput ? `<pre class="log-pre" tabindex="0" aria-label="${t("QEMU messages", "QEMU 訊息")}">${escape(log.qemuOutput)}</pre>` : `<p class="muted-line">${log.running ? t("QEMU has not reported any warnings or errors.", "QEMU 未有報告任何警告或錯誤。") : t("No messages from the last run.", "上次執行沒有訊息。")}</p>`}</section><section class="card"><h2>${t("Serial console", "序列主控台")}</h2>${serial}</section></div>`;
}

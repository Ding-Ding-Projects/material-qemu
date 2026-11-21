import { powerVerb } from "./views-machines.js";

export function snapshotTime(s) {
  const raw = s.createdAt || s.created || s.at || s.date;
  const d = raw ? new Date(typeof raw === "number" && raw < 1e12 ? raw * 1000 : raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : "";
}
export function renderMachinePage(ctx) {
  const { state, t, escape, button, pill, selected, consoleScale, consoleInput, snaps, empty, specOf } = ctx;
  const m = state.machines.find((x) => x.id === selected);
  if (!m) return empty();
  const verb = powerVerb(m),
    running = m.state === "running" || m.state === "paused" || m.state === "prelaunch" || m.state === "starting",
    cpus = m.sockets ? m.sockets * m.cores * (m.threads || 1) : m.cpus,
    cpuHistory = (state.metricHistory || []).map((s) => s.cpuPercent).filter(Number.isFinite).slice(-24),
    disks = m.disks?.length ? m.disks : [{ name: "system", sizeGiB: m.diskGiB }];
  const power = [
    button(`lifecycle:${m.id}:${verb}`, `<span class="icon" aria-hidden="true">${verb === "pause" ? "pause" : "play_arrow"}</span>${t(verb === "start" ? "Start" : verb === "resume" ? "Resume" : "Pause", verb === "start" ? "啟動" : verb === "resume" ? "繼續" : "暫停")}`, "primary"),
    running ? button("console-reset", `<span class="icon" aria-hidden="true">restart_alt</span>${t("Reset", "重設")}`) : "",
    running ? button(`lifecycle:${m.id}:shutdown`, `<span class="icon" aria-hidden="true">power_settings_new</span>${t("Shut down", "關機")}`) : "",
    running ? button(`lifecycle:${m.id}:stop`, `<span class="icon" aria-hidden="true">bolt</span>${t("Power off", "強制關機")}`, "danger") : "",
  ].join("");
  const tools = [
    ["console-cad", "keyboard_command_key", "Ctrl+Alt+Del", "Ctrl+Alt+Del"],
    ["console-keys", "keyboard", "Send keys", "傳送按鍵"],
    ["console-text", "text_fields", "Type text", "輸入文字"],
    ["console-clipboard", "content_paste", "Clipboard", "剪貼簿"],
    ["console-cd", "album", "Change CD", "更換光碟"],
    ["console-shot", "photo_camera", "Screenshot", "截圖"],
    ["console-fullscreen", "fullscreen", "Fullscreen", "全螢幕"],
  ]
    .map(([a, icon, en, yue]) => button(a, `<span class="icon" aria-hidden="true">${icon}</span>${t(en, yue)}`, "", running ? "" : "disabled"))
    .join("");
  const snapBody =
    snaps.status === "unavailable"
      ? `<p class="help">${t("Snapshots are not available yet on this server version.", "此伺服器版本尚未提供快照。")}</p>`
      : snaps.status === "loading"
        ? `<p class="muted">${t("Loading snapshots…", "正在載入快照…")}</p>`
        : snaps.items.length
          ? `<ol class="timeline">${snaps.items.map((s) => `<li><i aria-hidden="true"></i><div><strong>${escape(s.name)}</strong><small>${escape([snapshotTime(s), s.size ? ctx.bytes(s.size) : ""].filter(Boolean).join(" · "))}</small></div>${button(`snap-restore:${encodeURIComponent(s.name)}`, t("Restore", "還原"))}${button(`snap-delete:${encodeURIComponent(s.name)}`, `<span class="icon" aria-hidden="true">delete</span>`, "icon-btn", `aria-label="${t("Delete snapshot", "刪除快照")} ${escape(s.name)}"`)}</li>`).join("")}</ol>`
          : `<p class="muted">${t("No snapshots yet.", "暫時沒有快照。")}</p>`;
  const mine = state.events.filter((e) => e.message.startsWith(`${m.name}:`)).slice(0, 8);
  return `<div class="machine-head"><button type="button" class="icon-btn tonal" data-action="page:machines" aria-label="${t("Back to machines", "返回機器")}"><span class="icon" aria-hidden="true">arrow_back</span></button><div class="title"><h1>${escape(m.name)}</h1><p class="spec">${specOf(m)}${m.firmware === "uefi" ? " · UEFI" : ""}${m.tpm ? " · TPM" : ""}</p></div>${pill(m)}<div class="actions" role="group" aria-label="${t("Power", "電源")}">${power}</div></div><div class="machine-body"><section class="card console-card" aria-label="${t("Console", "主控台")}"><div class="console-toolbar"><div class="actions">${tools}</div><div class="actions">${button("console-scale", consoleScale ? t("Scaling: fit", "縮放：符合畫面") : t("Scaling: native", "縮放：原始大小"), "outlined", `aria-pressed="${consoleScale}"`)}${button("console-release", consoleInput ? t("Guest input: on", "客體輸入：開啟") : t("Guest input: off", "客體輸入：關閉"), "outlined", `aria-pressed="${consoleInput}"`)}${button("console-reconnect", t("Reconnect", "重新連線"), "ghost")}</div></div><div id="console-screen" class="console-screen">${m.state === "stopped" ? `<p>${t("This machine is stopped. Start it to connect to the live display.", "機器已停止，啟動後即可連接即時畫面。")}</p>` : '<div id="vnc"></div>'}</div><p id="console-status" class="muted-line" role="status">${t("Authenticated console. Guest input is sent only while connected.", "已驗證主控台，只會在連線時傳送操作。")}</p><div class="stats"><div class="stat"><span>${t("Virtual CPUs", "虛擬處理器")}</span><strong>${cpus}</strong><div class="bars" aria-hidden="true" title="${t("Host CPU samples for context; guest CPU is not available yet", "主機處理器樣本作參考，客體處理器用量尚未提供")}">${cpuHistory.map((v, i) => `<i style="height:${Math.max(6, v)}%;animation-delay:${i * 15}ms"></i>`).join("")}</div><small>${t("Bars show host CPU. Guest CPU is not available yet.", "圖表為主機處理器，客體用量尚未提供。")}</small></div><div class="stat"><span>${t("Memory", "記憶體")}</span><strong>${m.memory} MiB</strong><small>${m.balloon === false ? t("Balloon off", "氣球已關閉") : t("Allocated", "已分配")}</small></div><div class="stat"><span>${t("Disks", "磁碟")}</span><strong>${disks.reduce((n, d) => n + Number(d.sizeGiB || 0), 0)} GiB</strong><small>${disks.length} ${t("attached", "已連接")}</small></div></div></section><aside class="card" aria-labelledby="snap-h"><div class="toolbar"><h2 id="snap-h" style="margin:0">${t("Snapshots", "快照")}</h2>${button("snap-take", `<span class="icon" aria-hidden="true">add_a_photo</span>${t("Take snapshot", "建立快照")}`, "", snaps.status === "unavailable" ? "disabled" : "")}</div>${snapBody}<h3 style="margin-top:20px">${t("Recent activity", "最近活動")}</h3><ul class="activity">${mine.map((e) => `<li><span>${escape(e.message)}</span></li>`).join("") || `<li>${t("No activity for this machine yet.", "這部機器暫時沒有活動。")}</li>`}</ul></aside></div>`;
}

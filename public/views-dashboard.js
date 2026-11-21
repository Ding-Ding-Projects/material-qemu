import { renderJobs } from "./jobs-view.js";
import { historyChart } from "./charts.js";
import { filterMachines } from "./machine-filter.js";

const CIRC = 302;
function gauge({ icon, label, value, detail, pct, color, chart }) {
  const offset = pct == null ? CIRC : Math.round(CIRC * (1 - Math.max(0, Math.min(100, pct)) / 100));
  return `<article class="gauge"><div class="ring"><svg viewBox="0 0 112 112" aria-hidden="true"><circle class="track" cx="56" cy="56" r="48" fill="none" stroke-width="12"/>${pct == null ? "" : `<circle class="arc" cx="56" cy="56" r="48" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" transform="rotate(-90 56 56)" style="stroke-dashoffset:${offset}"/>`}</svg><span class="icon" aria-hidden="true">${icon}</span></div><div class="gauge-text"><span class="label">${label}</span><strong>${value}</strong><span class="detail">${detail}</span>${chart || ""}</div></article>`;
}
export function renderGauges({ state, t, bytes, escape }) {
  const m = state.metrics,
    running = state.machines.filter((x) => x.state === "running").length,
    memPct = m.memoryTotal ? (100 * m.memoryUsed) / m.memoryTotal : null,
    chart = (metric) =>
      historyChart(state.metricHistory || [], metric, t("recorded percentage samples", "實際百分比樣本"), escape);
  const hours = Math.floor(m.uptime / 3600);
  return `${state.metricError ? `<p class="banner">${t("Sampling is unavailable. Last recorded values remain visible.", "未能取樣，保留顯示上次記錄。")}</p>` : ""}<section class="gauges" aria-label="${t("Host", "主機")}">${gauge({
    icon: "speed",
    label: t("Host-visible CPU", "主機可見處理器"),
    value: m.cpuPercent == null ? t("Sampling…", "取樣中…") : `${m.cpuPercent}%`,
    detail: `${m.cpuCount ?? "—"} ${t("logical processors; not per-VM usage", "邏輯處理器，並非個別虛擬機器用量")}`,
    pct: m.cpuPercent,
    color: "var(--primary)",
    chart: chart("cpu"),
  })}${gauge({
    icon: "memory",
    label: t("Runtime-visible memory", "執行環境可見記憶體"),
    value: bytes(m.memoryUsed),
    detail: `${t("of", "共")} ${bytes(m.memoryTotal)} · ${m.memoryScope === "container" ? t("container usage", "容器用量") : t("host-visible usage", "主機可見用量")}`,
    pct: memPct,
    color: "var(--tertiary)",
    chart: chart("memory"),
  })}${gauge({
    icon: "dns",
    label: t("Machines", "機器"),
    value: String(state.machines.length),
    detail: `${running} ${t("running", "運行中")}`,
    pct: state.machines.length ? (100 * running) / state.machines.length : null,
    color: "var(--secondary)",
  })}${gauge({
    icon: "schedule",
    label: t("Host uptime", "主機運行時間"),
    value: `${hours}h ${Math.floor((m.uptime % 3600) / 60)}m`,
    detail: `${escape(m.platform)} · ${escape(m.arch)}`,
    pct: null,
  })}</section>`;
}
export function renderDashboard(ctx) {
  const { state, t, button, enumLabel, escape, machineCard, eventList, session } = ctx;
  const hour = new Date().getHours(),
    greeting =
      hour < 5 ? t("Good night", "夜深了") : hour < 12 ? t("Good morning", "早晨") : hour < 18 ? t("Good afternoon", "午安") : t("Good evening", "晚上好");
  const selectedState = state.settings.overviewState || "all",
    selectedArch = state.settings.overviewArch || "all";
  const order = { running: 0, paused: 1, starting: 2, prelaunch: 3, error: 4, stopped: 5 };
  const machines = filterMachines(state.machines, { state: selectedState })
    .filter((m) => selectedArch === "all" || m.arch === selectedArch)
    .sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9));
  const running = state.machines.filter((m) => m.state === "running").length;
  const architectures = [...new Set(state.machines.map((m) => m.arch))];
  const chips = `<div class="toolbar"><div class="chips" role="group" aria-label="${t("Machine state filter", "機器狀態篩選")}">${["all", "running", "paused", "stopped", "attention"].map((v) => button(`overview-state:${v}`, enumLabel(v), selectedState === v ? "selected" : "", `aria-pressed="${selectedState === v}"`)).join("")}</div><div class="chips" role="group" aria-label="${t("Architecture filter", "架構篩選")}">${button("overview-arch:all", t("All architectures", "所有架構"), selectedArch === "all" ? "selected" : "", `aria-pressed="${selectedArch === "all"}"`)}${architectures.map((v) => button(`overview-arch:${v}`, escape(v), selectedArch === v ? "selected" : "", `aria-pressed="${selectedArch === v}"`)).join("")}</div></div>`;
  const empty = `<section class="card empty"><div class="empty-icon" aria-hidden="true"><span class="icon">computer</span></div><h2>${t("A home for your first machine", "為第一部機器安個家")}</h2><p>${t("Create a machine with a private virtual disk, choose your resources, then open its live console. No sample machines are shown.", "建立私人虛擬磁碟，選擇資源，再打開即時主控台。這裡不會顯示假機器。")}</p>${button("new", t("New machine", "新增機器"), "primary")}</section>`;
  return `<div class="heading"><div><div class="crumb">${greeting}</div><h1>${t("Your machines", "你的機器")}</h1></div><div class="actions">${button("new", `<span class="icon" aria-hidden="true">add</span>${t("New machine", "新增機器")}`, "primary")}</div></div>${renderGauges(ctx)}<div class="toolbar"><div class="row"><h2>${t("Running now", "運行中")}</h2><span class="pill">${running} / ${state.machines.length}</span></div>${button("page:machines", t("All machines", "所有機器"), "ghost")}</div>${chips}${machines.length ? `<div class="grid">${machines.slice(0, 6).map((m) => machineCard(m)).join("")}</div>` : state.machines.length ? `<section class="card empty"><h2>${t("No machines match these filters", "沒有符合篩選的機器")}</h2>${button("overview-reset", t("Clear overview filters", "清除總覽篩選"))}</section>` : empty}<div class="lower">${renderJobs(state.jobs, ctx)}<section class="card"><h2>${t("Activity", "活動")}</h2>${eventList(5)}${button("page:history", t("Full activity", "完整活動記錄"), "ghost")}</section><section class="card quick"><h2>${t("Quick start", "快速開始")}</h2><p>${t("Pick an ISO, choose a preset, and the machine is running in seconds.", "揀好 ISO 同預設，幾秒內機器就開始運行。")}</p>${button("new", t("New machine", "新增機器"), "primary")}${button("page:storage", t("Upload an ISO", "上傳 ISO"), "ghost")}<small>${t("Runtime", "執行環境")}: ${escape(Object.entries(state.capabilities).filter(([, c]) => c.available).map(([a]) => a).join(", ") || t("Unavailable", "未能使用"))}</small></section></div>`;
}

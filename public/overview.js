import { historyChart } from "./charts.js";
import { filterMachines } from "./machine-filter.js";

export function renderMetrics({ state, t, bytes, escape }) {
  const m = state.metrics;
  const rows = [
    [
      t("Host-visible CPU", "主機可見處理器"),
      m.cpuPercent === null ? t("Sampling…", "取樣中…") : `${m.cpuPercent}%`,
      `${m.cpuCount ?? "—"} ${t("logical processors; not per-VM usage", "邏輯處理器，並非個別虛擬機器用量")}`,
      m.cpuPercent,
      "cpu",
    ],
    [
      t("Runtime-visible memory", "執行環境可見記憶體"),
      bytes(m.memoryUsed),
      `${t("of", "共")} ${bytes(m.memoryTotal)} · ${m.memoryScope === "container" ? t("container usage", "容器用量") : t("host-visible usage", "主機可見用量")}`,
      m.memoryTotal ? (100 * m.memoryUsed) / m.memoryTotal : null,
      "memory",
    ],
    [
      t("Machines", "機器"),
      state.machines.length,
      `${state.machines.filter((machine) => machine.state === "running").length} ${t("running", "運行中")}`,
      null,
      null,
    ],
    [
      t("Host uptime", "主機運行時間"),
      `${Math.floor(m.uptime / 3600)}h ${Math.floor((m.uptime % 3600) / 60)}m`,
      `${m.platform} · ${m.arch}`,
      null,
      null,
    ],
  ];
  return `${state.metricError ? `<p class="banner">${t("Sampling is unavailable. Last recorded values remain visible.", "未能取樣，保留顯示上次記錄。")}</p>` : ""}<div class="grid metrics">${rows.map(([name, value, sub, amount, metric]) => `<section class="card"><div class="card-title"><h3>${name}</h3><span class="pill">${state.metricError ? t("Last known", "上次記錄") : t("Live", "即時")}</span></div><div class="metric-value">${value}</div><p class="muted">${sub}</p>${amount !== null ? `<div class="meter"><span style="width:${Math.max(0, Math.min(100, amount))}%"></span></div>` : ""}${metric ? historyChart(state.metricHistory || [], metric, t("recorded percentage samples", "實際百分比樣本"), escape) : ""}</section>`).join("")}</div>`;
}
export function renderOverview(context) {
  const {
    state,
    t,
    button,
    enumLabel,
    heading,
    empty,
    machineCard,
    eventList,
    escape,
  } = context;
  const selectedState = state.settings.overviewState || "all",
    selectedArch = state.settings.overviewArch || "all";
  const machines = filterMachines(state.machines, {
    state: selectedState,
  }).filter(
    (machine) => selectedArch === "all" || machine.arch === selectedArch,
  );
  const architectures = [
    ...new Set(state.machines.map((machine) => machine.arch)),
  ];
  const filters = `<div class="toolbar"><div class="chips" aria-label="${t("Machine state filter", "機器狀態篩選")}">${["all", "running", "paused", "stopped", "attention"].map((value) => button(`overview-state:${value}`, enumLabel(value), selectedState === value ? "selected" : "", `aria-pressed="${selectedState === value}"`)).join("")}</div><div class="chips" aria-label="${t("Architecture filter", "架構篩選")}">${button("overview-arch:all", t("All architectures", "所有架構"), selectedArch === "all" ? "selected" : "", `aria-pressed="${selectedArch === "all"}"`)}${architectures.map((value) => button(`overview-arch:${value}`, escape(value), selectedArch === value ? "selected" : "", `aria-pressed="${selectedArch === value}"`)).join("")}</div></div>`;
  return (
    heading(
      t("Everything at a glance", "一眼掌握所有狀態"),
      t(
        "Recorded host-visible measurements and your actual machine state.",
        "已記錄的主機可見量度及實際機器狀態。",
      ),
      button("new", `＋ ${t("New machine", "新增機器")}`, "primary"),
    ) +
    renderMetrics(context) +
    `<div class="toolbar"><h2>${t("Machines", "機器")}</h2>${button("page:machines", t("View all machines", "查看所有機器"), "ghost")}</div>` +
    filters +
    (machines.length
      ? `<div class="grid">${machines.slice(0, 6).map(machineCard).join("")}</div>`
      : state.machines.length
        ? `<section class="card empty"><h2>${t("No machines match these filters", "沒有符合篩選的機器")}</h2>${button("overview-reset", t("Clear overview filters", "清除總覽篩選"))}</section>`
        : empty()) +
    `<div class="grid lower"><section class="card"><h2>${t("Recent activity", "最近活動")}</h2>${eventList(5)}</section><section class="card"><h2>${t("Runtime information", "執行環境資料")}</h2><dl><dt>QEMU</dt><dd>${
      Object.entries(state.capabilities)
        .filter(([, cap]) => cap.available)
        .map(([arch]) => arch)
        .join(", ") || t("Unavailable", "未能使用")
    }</dd><dt>${t("Sampling history", "取樣歷史")}</dt><dd>${t("Up to 90 actual samples, every 2 seconds", "每兩秒取樣，最多九十個實際樣本")}</dd><dt>${t("Last sample", "上次取樣")}</dt><dd>${escape(state.metrics.sampledAt || t("Unavailable", "未能提供"))}</dd><dt>${t("Disk and network rates", "磁碟及網絡速率")}</dt><dd>${t("Not collected", "尚未收集")}</dd></dl></section></div>`
  );
}

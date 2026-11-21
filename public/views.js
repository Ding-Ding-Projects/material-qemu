import { createMachines } from "./views-machines.js";
import { renderDashboard } from "./views-dashboard.js";
import { renderCreate } from "./views-create.js";
import { renderMachinePage } from "./views-machine.js";
import { renderStorage } from "./views-storage.js";
import { renderSettings } from "./views-settings.js";

export function createViews(context) {
  const { state, t, label, escape, button } = context;
  function heading(title, description, actions = "") {
    return `<div class="heading"><div><div class="crumb">${t("Workspace", "工作區")}</div><h1>${title}</h1><p>${description}</p></div><div class="actions">${actions}</div></div>`;
  }
  function empty() {
    return `<section class="card empty"><div class="empty-icon" aria-hidden="true"><span class="icon">computer</span></div><h2>${t("A home for your first machine", "為第一部機器安個家")}</h2><p>${t("Create a machine with a private virtual disk, choose your resources, then open its live console. No sample machines are shown.", "建立私人虛擬磁碟，選擇資源，再打開即時主控台。這裡不會顯示假機器。")}</p>${button("new", label("new"), "primary")}</section>`;
  }
  const machines = createMachines({ ...context, heading, empty });
  const base = { ...context, heading, empty, machineCard: machines.machineCard, specOf: machines.specOf };
  function eventList(limit = 200) {
    return `<ul class="activity">${
      state.events
        .slice(0, limit)
        .map((e) => `<li><span>${escape(e.message)}</span><time datetime="${e.at}">${new Date(e.at).toLocaleString()}</time></li>`)
        .join("") || `<li>${t("No activity yet.", "尚無活動。")}</li>`
    }</ul>`;
  }
  base.eventList = eventList;
  const history = () =>
    heading(label("history"), t("Actual actions and their timestamps.", "實際操作及時間記錄。")) +
    `<section class="card">${eventList()}</section>`;
  const docs = () =>
    heading(label("docs"), t("Practical workflows for your local QEMU workspace.", "本機 QEMU 工作區的實用指南。")) +
    `<div class="grid"><article class="card"><h2>${t("Create and start a machine", "建立和啟動機器")}</h2><ol><li>${t("Upload a trusted ISO in Storage, if installing an OS.", "如需安裝作業系統，先在儲存空間上傳可信 ISO。")}</li><li>${t("Open New machine, pick a preset and adjust the sections you care about.", "開啟新增機器，揀預設再調整你在意的分區。")}</li><li>${t("Check the launch preview, then Create or Create and start.", "檢查啟動預覽，再按建立或建立並啟動。")}</li><li>${t("Open the console to interact with the guest.", "開啟主控台操作客體。")}</li></ol>${button("new", label("new"), "primary")}</article><article class="card"><h2>${t("Control a running machine", "控制運行中的機器")}</h2><p>${t("Pause suspends virtual CPUs. Resume continues them. Shut down sends an ACPI power request, which the guest must handle. Power off immediately terminates the virtual machine and can lose unsaved guest data, so it needs the two-key confirmation.", "暫停會停止虛擬處理器，繼續會恢復運行。關機會傳送 ACPI 請求，由客體處理。強制關機會立即終止機器，可能失去未儲存資料，所以需要雙鑰匙確認。")}</p></article><article class="card"><h2>${t("Snapshots and storage", "快照與儲存")}</h2><p>${t("Snapshots live on qcow2 disks. Restoring replaces the current machine state, so it needs the two-key confirmation. Keep the persistent data volume: it holds accounts, machine definitions, disks and media. Never delete it to update the container.", "快照存放於 qcow2 磁碟。還原會取代機器目前狀態，所以需要雙鑰匙確認。請保留持久資料空間，內有帳戶、機器設定、磁碟和媒體，更新容器時切勿刪除。")}</p></article><article class="card"><h2>${t("Delivery scope", "目前交付範圍")}</h2><p>${t("Screens that need a newer server show a plain message instead of a fake result. Anything marked not available yet is not a shipped feature.", "需要較新伺服器的畫面會顯示清楚說明，不會顯示假結果。標示尚未提供的項目並非已交付功能。")}</p></article></div>`;
  return {
    heading,
    empty,
    overview: () => renderDashboard(base),
    machines: machines.machines,
    machineResults: machines.machineResults,
    machineCard: machines.machineCard,
    filtered: machines.filtered,
    details: machines.details,
    create: () => renderCreate(base),
    consolePage: () => renderMachinePage(base),
    storage: () => renderStorage(base),
    settings: () => renderSettings(base),
    eventList,
    history,
    docs,
  };
}

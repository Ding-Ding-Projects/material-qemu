import { localizeServerError } from "./server-errors.js";

// Running jobs card: long operations reported by the server, with upload
// progress when the size is known, and the outcome of recently finished ones.

const KIND = {
  "upload-iso": ["Uploading ISO", "上載 ISO", "upload"],
  "import-disk": ["Importing disk", "匯入磁碟", "move_to_inbox"],
  "resize-disk": ["Resizing disk", "調整磁碟容量", "open_in_full"],
  clone: ["Cloning machine", "複製機器", "content_copy"],
  "snapshot-create": ["Taking snapshot", "建立快照", "add_a_photo"],
  "snapshot-restore": ["Restoring snapshot", "還原快照", "restore"],
  "snapshot-delete": ["Deleting snapshot", "刪除快照", "delete"],
};

// Sizes in the unit that keeps a readable number, from bytes to GiB.
export function formatSize(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1048576) return `${(v / 1024).toFixed(1)} KiB`;
  if (v < 1073741824) return `${(v / 1048576).toFixed(1)} MiB`;
  return `${(v / 1073741824).toFixed(2)} GiB`;
}

export function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

export function renderJobs(jobs, { t, escape }) {
  const list = Array.isArray(jobs) ? jobs : [];
  const running = list.filter((j) => j.state === "running").length;
  const rows = list.slice(0, 8).map((j) => {
    const [en, yue, icon] = KIND[j.kind] || [j.kind, j.kind, "pending"];
    const state = j.state === "running"
      ? (j.fraction != null ? `${Math.round(j.fraction * 100)}% · ${formatSize(j.bytes)} / ${formatSize(j.totalBytes)}` : t("Working", "處理中"))
      : j.state === "done" ? t("Finished", "已完成") : t("Failed", "失敗");
    const bar = j.state === "running"
      ? `<div class="job-bar" role="progressbar" aria-label="${escape(t(en, yue) + " " + j.label)}" ${j.fraction != null ? `aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(j.fraction * 100)}"` : ""}><i class="${j.fraction == null ? "indeterminate" : ""}" style="${j.fraction != null ? `width:${(j.fraction * 100).toFixed(1)}%` : ""}"></i></div>`
      : "";
    return `<li class="job job-${j.state}"><span class="icon" aria-hidden="true">${j.state === "failed" ? "error" : j.state === "done" ? "check_circle" : icon}</span><div><strong>${escape(t(en, yue))}</strong><span class="job-label">${escape(j.label)}</span>${bar}<small>${escape(state)} · ${escape(formatDuration(j.elapsedMs))}${j.error ? ` · ${escape(localizeServerError(j.error, t))}` : ""}</small></div></li>`;
  });
  return `<section class="card jobs-card" aria-labelledby="jobs-h"><div class="row"><h2 id="jobs-h">${t("Running jobs", "執行中的工作")}</h2><span class="pill">${running}</span></div>${rows.length ? `<ul class="jobs" aria-live="polite">${rows.join("")}</ul>` : `<p class="muted-line">${t("Nothing is running. Uploads, imports, resizes, clones and snapshots show up here while they work, and stay for ten minutes after.", "暫時沒有工作。上載、匯入、調整容量、複製及快照進行時會在這裡顯示，完成後保留十分鐘。")}</p>`}</section>`;
}

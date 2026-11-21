export function renderStorage(ctx) {
  const { t, escape, button, storage, storageTab, upload, bytes } = ctx;
  const size = (v) => {
    if (v == null) return "—";
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    let n = Number(v), u = 0;
    while (n >= 1024 && u < units.length - 1) { n /= 1024; u++; }
    return `${n.toFixed(u && n < 10 ? 1 : 0)} ${units[u]}`;
  };
  const diskRows = storage.disks
    .map(
      (d, i) => `<div class="storage-row" style="animation-delay:${i * 30}ms"><div class="name"><strong>${escape(d.name)}</strong><small>${escape(d.machineName ? t("Attached to ", "連接至 ") + d.machineName : t("Unattached", "未連接"))}</small></div><span>${size(d.bytes)}</span><span>${escape(d.format)}</span><span>${d.usedBytes == null ? "—" : size(d.usedBytes)}</span><div class="acts">${button(`disk-resize:${encodeURIComponent(d.id)}`, t("Resize", "調整容量"))}${d.machineId ? button(`clone:${d.machineId}`, t("Clone", "複製")) : ""}${button("disk-convert", t("Convert", "轉換"), "", `disabled title="${escape(t("Disks are converted to qcow2 when imported", "磁碟在匯入時轉換為 qcow2"))}"`)}${d.machineId ? button(`edit:${d.machineId}`, t("Attach", "連接")) : ""}${button(`disk-delete:${encodeURIComponent(d.id)}`, t("Delete", "刪除"), "danger", d.machineId ? `disabled title="${escape(t("Remove the machine first; its disks are retained", "請先移除機器，磁碟會保留"))}"` : "")}</div></div>`,
    )
    .join("");
  const isoRows = storage.isos
    .map(
      (i, n) => `<div class="storage-row" style="animation-delay:${n * 30}ms"><div class="name"><strong>${escape(i.name)}</strong><small>${t("Installation media", "安裝媒體")}</small></div><span>${size(i.bytes)}</span><span>ISO</span><span>—</span><div class="acts">${button(`iso-use:${encodeURIComponent(i.name)}`, t("Use in new machine", "用於新機器"))}${button(`iso-delete:${encodeURIComponent(i.name)}`, t("Delete", "刪除"), "danger")}</div></div>`,
    )
    .join("");
  const active = upload && upload.active;
  return `${ctx.heading(t("Storage", "儲存空間"), t("ISO library and disk images in one place.", "ISO 媒體庫及磁碟映像集中管理。"), `<div class="tablist" role="tablist" aria-label="${t("Storage view", "儲存檢視")}">${[["disks", t("Disks", "磁碟")], ["isos", t("ISO library", "ISO 媒體庫")]].map(([id, label]) => `<button type="button" role="tab" data-action="storage-tab:${id}" aria-selected="${storageTab === id}">${label} (${id === "disks" ? storage.disks.length : storage.isos.length})</button>`).join("")}</div>`)}<div class="dropzone" id="dropzone"><span class="icon" aria-hidden="true" style="font-size:40px;width:40px;height:40px">upload_file</span><strong>${t("Drop an ISO or disk image here", "將 ISO 或磁碟映像拖放到這裡")}</strong><span class="muted">${t("ISO, qcow2, raw, VMDK, VDI and VHDX are accepted. Non-qcow2 disks are converted on import.", "支援 ISO、qcow2、raw、VMDK、VDI 及 VHDX，非 qcow2 磁碟會在匯入時轉換。")}</span><input id="storage-file" type="file" class="sr-only" accept=".iso,.qcow2,.raw,.img,.vmdk,.vdi,.vhdx" aria-label="${t("Choose a file to upload", "選擇要上傳的檔案")}"><button type="button" data-action="storage-browse" class="primary">${t("Choose file", "選擇檔案")}</button>${active ? `<div class="row" style="width:100%;max-width:560px;justify-content:space-between"><span>${escape(upload.name)} · ${bytes(upload.loaded)} / ${bytes(upload.total)}</span><strong>${upload.percent}%</strong></div><div class="upload-bar" role="progressbar" aria-valuenow="${upload.percent}" aria-valuemin="0" aria-valuemax="100"><div style="width:${upload.percent}%"></div></div>${button("upload-cancel", t("Cancel upload", "取消上傳"), "ghost")}` : ""}${upload && upload.message ? `<p role="status" class="${upload.error ? "error-text" : "muted"}">${escape(upload.message)}</p>` : ""}</div>${storage.source === "derived" ? `<p class="help">${t("This server does not report a storage inventory yet, so sizes come from machine definitions. Disk import, resize and ISO deletion appear as the server supports them.", "此伺服器尚未提供儲存清單，容量取自機器設定。磁碟匯入、調整容量及刪除 ISO 會在伺服器支援後啟用。")}</p>` : ""}<div class="rows">${(storageTab === "disks" ? diskRows : isoRows) || `<section class="card empty"><h2>${storageTab === "disks" ? t("No disks yet", "暫時沒有磁碟") : t("No ISO files yet", "暫時沒有 ISO")}</h2><p>${t("Drop a file above to add one.", "將檔案拖放到上方即可新增。")}</p></section>`}</div>`;
}

// Storage pools tab in Storage, and the Overview warning about pool health.

const size = (n) => {
  const v = Number(n) || 0;
  return v >= 1024 ** 4 ? `${(v / 1024 ** 4).toFixed(1)} TiB` : v >= 1024 ** 3 ? `${(v / 1024 ** 3).toFixed(1)} GiB` : `${(v / 1024 ** 2).toFixed(0)} MiB`;
};

export function poolsPanel({ t, escape, button, session }, pools) {
  const owner = !session?.user || session.user.role === "owner";
  const list = pools?.pools;
  if (!list) return `<p class="muted-line">${t("Loading storage pools…", "正在載入儲存池…")}</p>`;
  const rows = list.map((p, i) => {
    const used = p.healthy ? 1 - p.freeBytes / p.totalBytes : 0;
    return `<div class="storage-row pool-row" style="animation-delay:${i * 30}ms"><div class="name"><strong>${escape(p.builtIn ? t("Managed storage", "管理儲存空間") : p.name)}</strong><small class="mono">${escape(p.builtIn ? t("Material QEMU's own data folder", "Material QEMU 自己的資料夾") : p.path)}</small></div>${p.healthy ? `<div class="pool-bar" role="meter" aria-label="${escape(t("Space used in ", "已用空間：") + (p.builtIn ? t("Managed storage", "管理儲存空間") : p.name))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(used * 100)}"><i style="width:${(used * 100).toFixed(1)}%" class="${used > 0.9 ? "low" : ""}"></i></div><span>${escape(t(`${size(p.freeBytes)} free of ${size(p.totalBytes)}`, `${size(p.totalBytes)} 中尚餘 ${size(p.freeBytes)}`))}</span>` : `<span class="error-text">${escape(t(p.error === "The folder is missing; is the drive connected?" ? "The folder is missing; is the drive connected?" : "The folder cannot be read.", p.error === "The folder is missing; is the drive connected?" ? "找不到資料夾，磁碟機已連接嗎？" : "無法讀取資料夾。"))}</span><span></span>`}<span>${escape(t(`${p.disks} disk${p.disks === 1 ? "" : "s"}`, `${p.disks} 個磁碟`))}</span><div class="acts">${!p.builtIn && owner ? button(`pool-remove:${p.id}`, t("Remove", "移除"), "danger", p.disks ? `disabled title="${escape(t("Move or remove its machines first.", "請先移走或移除其機器。"))}"` : "") : ""}</div></div>`;
  }).join("");
  const form = owner
    ? `<form class="card pool-form" id="pool-form" novalidate><h3>${t("Add a storage pool", "新增儲存池")}</h3><p class="muted-line">${t("A folder on this host, such as another drive, where new disks can be kept. Disks go into a material-qemu-disks folder inside it, so nothing already there is touched.", "此主機上的資料夾，例如另一個磁碟機，用來存放新磁碟。磁碟會放在其中的 material-qemu-disks 資料夾，不會影響原有內容。")}</p><div class="form-grid"><div class="field"><label for="pool-name">${t("Name", "名稱")}</label><input id="pool-name" maxlength="60" autocomplete="off"></div><div class="field"><label for="pool-path">${t("Folder (full path)", "資料夾（完整路徑）")}</label><input id="pool-path" class="mono" maxlength="400" spellcheck="false" autocomplete="off" placeholder="D:\\VMs"></div></div>${button("pool-add", `<span class="icon" aria-hidden="true">add</span>${t("Add pool", "新增儲存池")}`, "primary")}<p id="pool-status" class="muted-line" role="status"></p></form>`
    : "";
  return `<div class="rows">${rows}</div>${form}`;
}

// Overview: say so when a pool is missing or nearly full.
export function poolWarning({ t, escape }, pools) {
  const bad = (pools?.pools || []).filter((p) => !p.healthy || p.freeBytes / p.totalBytes < 0.1);
  if (!bad.length) return "";
  return `<p class="banner" role="status"><span class="icon" aria-hidden="true">warning</span>${bad.map((p) => escape(!p.healthy ? t(`${p.name}: the folder is missing or cannot be read.`, `${p.name}：找不到或無法讀取資料夾。`) : t(`${p.builtIn ? "Managed storage" : p.name} has under 10% free space.`, `${p.builtIn ? "管理儲存空間" : p.name} 可用空間少於 10%。`))).join(" ")} ${`<button type="button" data-action="page:storage" class="ghost">${t("Open Storage", "開啟儲存空間")}</button>`}</p>`;
}

export const poolChoices = (t, pools) => [["", t("Managed storage", "管理儲存空間")], ...((pools?.pools || []).filter((p) => !p.builtIn).map((p) => [p.id, p.name]))];

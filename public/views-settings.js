import { SEEDS } from "./md3-color.js";
import { hostFlags } from "./views-create.js";

export function renderSettings(ctx) {
  const { state, t, escape, button, appearance, host, heading, label } = ctx;
  const flags = hostFlags(host);
  const sw = (id, title, help, on) =>
    `<div class="setting-row"><span><strong id="sw-${id}">${title}</strong><small class="muted">${help}</small></span><button type="button" id="${id}" class="switch" role="switch" aria-checked="${on}" aria-labelledby="sw-${id}" data-action="switch:${id}"><span></span></button></div>`;
  const facts = [
    ["QEMU", host?.qemuVersion || Object.values(state.capabilities).find((c) => c.version)?.version || t("Unavailable", "未能提供")],
    [t("Accelerators", "加速方式"), flags.accelerators.join(", ") || [...new Set(Object.values(state.capabilities).flatMap((c) => (c.accelerators || []).filter((a) => a.usable).map((a) => a.name)))].join(", ") || "tcg"],
    [t("System targets", "系統目標"), flags.targets.join(", ") || Object.entries(state.capabilities).filter(([, c]) => c.available).map(([a]) => a).join(", ") || "—"],
    ["UEFI", host ? (flags.uefi ? t("Installed", "已安裝") : t("Not found", "找不到")) : t("Needs a newer server", "需要較新的伺服器")],
    ["Secure Boot", host ? (flags.secureBoot ? t("Available", "可用") : t("Not available", "不可用")) : "—"],
    ["swtpm (TPM)", host ? (flags.tpm ? t("Installed", "已安裝") : t("Not found", "找不到")) : "—"],
    [t("Platform", "平台"), `${escape(state.metrics.platform)} · ${escape(state.metrics.arch)}`],
    [t("Version", "版本"), escape(state.version || "—")],
    ...hardwareRows(host?.hardware, t),
  ];
  const seedLabel = (s) => t(s[2], s[3]);
  return `${heading(label("settings"), t("Make this workspace yours. Changes are saved to your account.", "打造你的工作區，變更會儲存至帳戶。"))}<div class="settings-stack"><section class="card" aria-labelledby="look"><h2 id="look">${t("Appearance", "外觀")}</h2><div class="setting-row"><span><strong id="seed-label">${t("Colour seed", "主題顏色")}</strong><small class="muted">${t("The whole palette is generated from this colour and kept readable.", "整個色彩配搭由此顏色產生，並保持清晰易讀。")}</small></span><div class="swatches" role="group" aria-labelledby="seed-label">${SEEDS.map((s) => `<button type="button" class="swatch" data-action="seed:${s[0]}" aria-pressed="${appearance.seed === s[0]}" aria-label="${escape(seedLabel(s))}" title="${escape(seedLabel(s))}" style="background:${s[1]}"></button>`).join("")}<label class="swatch" style="display:grid;place-items:center;background:var(--surface-container-highest);overflow:hidden;cursor:pointer" title="${t("Custom colour", "自訂顏色")}"><span class="icon" aria-hidden="true">palette</span><input id="seed-custom" type="color" value="${escape(/^#/.test(appearance.seed) ? appearance.seed : "#ff8a4c")}" class="sr-only" aria-label="${t("Custom colour seed", "自訂主題顏色")}"></label></div></div><div class="setting-row"><span><strong id="theme-label">${t("Theme", "主題")}</strong></span><div class="chips" role="group" aria-labelledby="theme-label">${[["dark", t("Dark", "深色")], ["light", t("Light", "淺色")], ["system", t("Follow device", "跟隨裝置")]].map(([v, l]) => button(`theme:${v}`, l, state.settings.theme === v ? "selected" : "", `${state.settings.theme === v ? 'id="theme" ' : ""}aria-pressed="${state.settings.theme === v}"`)).join("")}</div></div><div class="setting-row"><span><strong><label for="language">${t("Language", "語言")}</label></strong></span><select id="language" style="max-width:260px">${[["en", "English"], ["yue", "廣東話"], ["both", "English + 廣東話"]].map(([v, l]) => `<option value="${v}" ${state.settings.language === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>${sw("motion", t("Interface motion", "介面動畫"), t("Entrance, gauge and button animation. Your device's reduced-motion preference always wins.", "進場、儀表及按鈕動畫。裝置的減少動畫設定永遠優先。"), state.settings.motion !== false)}${sw("transitions", t("Screen transitions", "畫面轉場"), t("Animate between screens when the browser supports it.", "瀏覽器支援時，畫面之間會有轉場。"), appearance.transitions)}${sw("thumbs", t("Live thumbnails", "即時縮圖"), t("Show a refreshed console picture on running machine cards.", "運行中機器卡片顯示定時更新的主控台畫面。"), appearance.thumbs)}</section><section class="card" aria-labelledby="sec"><h2 id="sec">${t("Sign-in and security", "登入及安全")}</h2><div class="setting-row"><span><strong>${t("Passkeys", "通行密鑰")}</strong><small class="muted">${state.owner.passkeys} ${t("registered passkeys", "個已登記通行密鑰")} · ${escape(state.owner.name)}</small></span>${button("register-passkey", t("Add a passkey", "新增通行密鑰"), "primary")}</div><div class="setting-row"><span><strong>${t("Password sign-in", "密碼登入")}: ${state.owner.passwordEnabled === false ? t("Disabled", "已停用") : t("Enabled", "已啟用")}</strong><small class="muted">${t("Every change needs a fresh passkey check; the saved password is retained.", "每次更改都要重新驗證通行密鑰，已儲存密碼會保留。")}</small></span>${button("password-mode", state.owner.passwordEnabled === false ? t("Enable password sign-in", "啟用密碼登入") : t("Disable password sign-in", "停用密碼登入"), "", state.owner.passkeys ? "" : "disabled")}</div><p class="help">${t("Passkeys need HTTPS or localhost and a compatible browser. Register a passkey first.", "通行密鑰需要 HTTPS 或 localhost 及相容瀏覽器，請先登記通行密鑰。")}</p></section><section class="card" aria-labelledby="host-h"><h2 id="host-h">${t("Host", "主機")}</h2><div class="facts">${facts.map(([k, v]) => `<div><span>${k}</span><strong>${escape(String(v)).replace(/&amp;middot;/g, "·")}</strong></div>`).join("")}</div>${host ? "" : `<p class="help">${t("Detailed host facts need a newer server. Showing what this server reports.", "詳細主機資料需要較新的伺服器，目前只顯示此伺服器提供的內容。")}</p>`}</section>${updateCard(ctx)}</div>`;
}

// Shown only on the Material QEMU appliance, where the host can pull a new release.
function updateCard(ctx) {
  const u = ctx.applianceUpdate;
  if (!u?.supported) return "";
  const { t, escape, button } = ctx;
  const busy = u.pending || ["downloading", "restarting"].includes(u.state);
  const states = {
    current: t("You are on the latest release.", "已是最新版本。"),
    available: t("A newer release is available.", "有較新的版本。"),
    downloading: t("Downloading the new release.", "正在下載新版本。"),
    restarting: t("Restarting on the new release.", "正在以新版本重新啟動。"),
    updated: t("Updated. Machines, disks and settings were kept.", "已更新，機器、磁碟和設定都已保留。"),
    error: t("The last update check or update did not finish.", "上次檢查或更新未能完成。"),
  };
  const line = u.pending ? t("Waiting for the appliance to pick up the request.", "等待設備處理請求。") : states[u.state] || t("Not checked yet.", "尚未檢查。");
  const fact = (k, v) => `<div><span>${k}</span><strong>${escape(v)}</strong></div>`;
  return `<section class="card" aria-labelledby="upd-h"><h2 id="upd-h">${t("Appliance updates", "設備更新")}</h2><div class="facts">${fact(t("Installed", "已安裝"), u.current || "—")}${fact(t("Latest release", "最新版本"), u.latest || "—")}${fact(t("Last checked", "上次檢查"), u.checkedAt ? new Date(u.checkedAt).toLocaleString() : "—")}</div><p class="muted-line" role="status">${line}${u.state === "error" && u.message ? " " + escape(u.message) : ""}</p><div class="actions">${button("update-check", t("Check now", "立即檢查"), "", busy ? "disabled" : "")}${u.state === "available" ? button("update-apply", t("Update and restart", "更新並重新啟動"), "primary", busy ? "disabled" : "") : ""}</div><p class="help">${t("The appliance checks once a day. Updating pulls the new container image and keeps the data volume; if the new release does not start, the current one is restored.", "設備每日檢查一次。更新會下載新的容器映像並保留資料空間；如新版本未能啟動，會還原目前版本。")}</p></section>`;
}

// Rows for the read-only hardware discovery reported by /api/host.
function hardwareRows(hw, t) {
  if (!hw) return [];
  if (!hw.checked) return [[t("Hardware features", "硬件功能"), t("Not checked on this host platform", "此主機平台不檢查")]];
  const yes = t("Yes", "有"), no = t("No", "沒有"), unknown = t("Unknown", "未知");
  const yn = (v) => (v === true ? yes : v === false ? no : unknown);
  const hp = hw.hugepages || {};
  const conf = hw.confidential || {};
  const confidential = [conf.sev && "SEV", conf.sevEs && "SEV-ES", conf.sevSnp && "SEV-SNP", conf.tdx && "TDX"].filter(Boolean);
  return [
    ["IOMMU", hw.iommu?.enabled ? t(`On · ${hw.iommu.groups ?? "?"} groups`, `開啟 · ${hw.iommu.groups ?? "?"} 個群組`) : t("Off or not visible", "關閉或不可見")],
    [t("Hugepages", "大頁記憶體"), hp.total ? t(`${hp.free}/${hp.total} free × ${hp.sizeKiB} KiB`, `${hp.total} 個中 ${hp.free} 個可用 × ${hp.sizeKiB} KiB`) + (hp.transparent ? ` · THP ${hp.transparent}` : "") : t("None reserved", "未預留") + (hp.transparent ? ` · THP ${hp.transparent}` : "")],
    ["VFIO", hw.vfio?.device ? t("Available", "可用") : hw.vfio?.module ? t("Module loaded, device not visible", "已載入模組，裝置不可見") : t("Not available", "不可用")],
    [t("Nested virtualization", "巢狀虛擬化"), yn(hw.nestedVirtualization)],
    [t("Confidential computing", "機密運算"), confidential.length ? confidential.join(", ") : conf.cpuAdvertises?.length ? t(`CPU supports ${conf.cpuAdvertises.join(", ")}; not enabled in KVM`, `處理器支援 ${conf.cpuAdvertises.join(", ")}；KVM 未啟用`) : t("Not available", "不可用")],
  ];
}

// People card in Settings (owner only): add operators and viewers, change a
// role, reset a password, remove someone. The server enforces the roles.

export const ROLE_LABELS = {
  owner: ["Owner", "擁有者"],
  operator: ["Operator", "操作員"],
  viewer: ["Viewer", "檢視者"],
};
const ROLE_HELP = {
  operator: ["Creates, runs and changes machines and storage, and uses consoles. Cannot manage people, sign-in security or appliance updates.", "建立、運行及更改機器和儲存空間，亦可使用主控台；不可管理人員、登入安全或設備更新。"],
  viewer: ["Sees machines, storage and activity. Cannot change anything and has no console, since a console can type into the guest.", "可查看機器、儲存空間及活動；不可更改任何內容，亦沒有主控台，因為主控台可在客體內輸入。"],
};

export function peopleCard({ t, escape, button }, people) {
  const list = people?.users || [];
  const rows = list.map((u) => `<li class="person"><span class="avatar" aria-hidden="true">${escape((u.name || u.username).slice(0, 1).toUpperCase())}</span><div><strong>${escape(u.name)}</strong><small class="muted mono">${escape(u.username)}</small></div><label class="sr-only" for="role-${u.id}">${t("Role for ", "角色：") + escape(u.name)}</label><select id="role-${u.id}" data-person-role="${u.id}">${["operator", "viewer"].map((r) => `<option value="${r}" ${u.role === r ? "selected" : ""}>${escape(t(...ROLE_LABELS[r]))}</option>`).join("")}</select>${button(`person-password:${u.id}`, t("Reset password", "重設密碼"), "ghost")}${button(`person-remove:${u.id}`, `<span class="icon" aria-hidden="true">person_remove</span>`, "icon-btn", `aria-label="${escape(t("Remove ", "移除 ") + u.name)}"`)}</li>`).join("");
  return `<section class="card people-card" aria-labelledby="people-h"><h2 id="people-h">${t("People", "人員")}</h2><p class="muted-line">${t("Everyone signs in with their own name and password. You stay the owner.", "每人以自己的名稱和密碼登入，你仍是擁有者。")}</p>${list.length ? `<ul class="people">${rows}</ul>` : `<p class="muted-line">${t("Only you can sign in so far.", "目前只有你可以登入。")}</p>`}<form id="person-form" class="person-form" novalidate><h3>${t("Add a person", "新增人員")}</h3><div class="form-grid"><div class="field"><label for="person-name">${t("Name", "名稱")}</label><input id="person-name" maxlength="80" autocomplete="off"></div><div class="field"><label for="person-username">${t("Sign-in name", "登入名稱")}</label><input id="person-username" maxlength="40" autocomplete="off" spellcheck="false"></div><div class="field"><label for="person-password">${t("Password (12 characters or more)", "密碼（最少 12 個字元）")}</label><input id="person-password" type="password" minlength="12" maxlength="256" autocomplete="new-password"></div><div class="field"><label for="person-role">${t("Role", "角色")}</label><select id="person-role">${["operator", "viewer"].map((r) => `<option value="${r}">${escape(t(...ROLE_LABELS[r]))}</option>`).join("")}</select></div></div><ul class="role-help">${["operator", "viewer"].map((r) => `<li><strong>${escape(t(...ROLE_LABELS[r]))}</strong> ${escape(t(...ROLE_HELP[r]))}</li>`).join("")}</ul>${button("person-add", `<span class="icon" aria-hidden="true">person_add</span>${t("Add person", "新增人員")}`, "primary")}<p id="person-status" class="muted-line" role="status"></p></form></section>`;
}

// Header badge with the signed-in person and their role (not shown to the owner).
export function accountBadge({ t, escape }, user) {
  if (!user || user.role === "owner") return "";
  return `<span class="pill account-pill" title="${escape(t("Signed in as ", "登入身分：") + user.name)}" aria-label="${escape(t("Signed in as ", "登入身分：") + user.name + " · " + t(...ROLE_LABELS[user.role]))}"><span class="icon" aria-hidden="true">${user.role === "viewer" ? "visibility" : "manage_accounts"}</span>${escape(t(...ROLE_LABELS[user.role]))}</span>`;
}

export function viewerNote({ t }, user) {
  if (user?.role !== "viewer") return "";
  return `<p class="banner viewer-banner" role="note"><span class="icon" aria-hidden="true">visibility</span>${t("You can view this workspace but not change it. Ask the owner for the operator role to run machines.", "你可以查看這個工作區，但不可更改。如需運行機器，請向擁有者申請操作員角色。")}</p>`;
}

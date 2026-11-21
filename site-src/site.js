// Documentation site behaviour: language and theme, search with a regular
// expression builder, and screenshot guides that remember your step.
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
const base = document.body.dataset.root || "";

// Language: English, Cantonese or both side by side, for the site's own words.
let lang = store.get("mq-docs-lang", "en");
const say = (en, yue) => (lang === "yue" ? yue : lang === "both" ? `${en} · ${yue}` : en);
function applyLanguage() {
  document.documentElement.lang = lang === "yue" ? "yue-Hant-HK" : "en";
  for (const el of $$("[data-i18n]")) el.textContent = say(el.dataset.i18n, el.dataset.yue || el.dataset.i18n);
  for (const el of $$("[data-i18n-placeholder]")) el.placeholder = say(el.dataset.i18nPlaceholder, el.dataset.yuePlaceholder || el.dataset.i18nPlaceholder);
  const select = $("#lang");
  if (select) select.value = lang;
}
$("#lang")?.addEventListener("change", (e) => { lang = e.target.value; store.set("mq-docs-lang", lang); applyLanguage(); runSearch(); });

// Theme: system, light or dark.
const themes = ["system", "light", "dark"];
function applyTheme() {
  const t = store.get("mq-docs-theme", "system");
  document.documentElement.dataset.theme = t === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : t;
  const b = $("#theme");
  if (b) { b.setAttribute("aria-label", say(`Theme: ${t}`, `主題：${{ system: "跟隨裝置", light: "淺色", dark: "深色" }[t]}`)); b.title = b.getAttribute("aria-label"); }
}
$("#theme")?.addEventListener("click", () => {
  const next = themes[(themes.indexOf(store.get("mq-docs-theme", "system")) + 1) % themes.length];
  store.set("mq-docs-theme", next);
  applyTheme();
});

// Search with a regular expression builder.
let index = null;
const q = $("#q"), rx = $("#rx"), results = $("#results"), toggle = $("#regex-toggle"), builder = $("#regex-builder"), status = $("#rx-status");
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const regexMode = () => toggle?.getAttribute("aria-pressed") === "true";
function buildPattern() {
  if (!regexMode()) {
    const text = q.value.trim();
    if (!text) return null;
    return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  }
  const source = rx.value;
  if (!source) return null;
  const flags = "g" + ($("#flag-i").checked ? "i" : "") + ($("#flag-m").checked ? "m" : "") + ($("#flag-s").checked ? "s" : "");
  return new RegExp(source, flags);
}
function snippet(text, re) {
  re.lastIndex = 0;
  const m = re.exec(text);
  if (!m) return escapeHtml(text.slice(0, 160));
  const start = Math.max(0, m.index - 60), end = Math.min(text.length, m.index + m[0].length + 100);
  return (start ? "…" : "") + escapeHtml(text.slice(start, m.index)) + `<mark>${escapeHtml(m[0] || " ")}</mark>` + escapeHtml(text.slice(m.index + m[0].length, end)) + (end < text.length ? "…" : "");
}
async function runSearch() {
  if (!results) return;
  let re;
  try {
    re = buildPattern();
    rx?.removeAttribute("aria-invalid");
  } catch (error) {
    rx?.setAttribute("aria-invalid", "true");
    status.textContent = say(`Invalid pattern: ${error.message}`, `樣式無效：${error.message}`);
    results.hidden = true;
    return;
  }
  if (!re) { results.hidden = true; if (status) status.textContent = ""; return; }
  index ||= await fetch(`${base}search-index.json`).then((r) => r.json()).catch(() => []);
  const titlesOnly = regexMode() && $("#scope-title")?.checked;
  const started = performance.now();
  const hits = [];
  let total = 0;
  for (const item of index) {
    if (performance.now() - started > 250) break; // keep a slow pattern from freezing the page
    const hay = titlesOnly ? item.title : `${item.title} ${item.text}`;
    re.lastIndex = 0;
    let count = 0, m;
    while ((m = re.exec(hay)) && count < 500) { count++; if (m[0] === "") re.lastIndex++; }
    if (count) { hits.push({ item, count }); total += count; }
  }
  hits.sort((a, b) => b.count - a.count);
  if (status) status.textContent = regexMode() ? say(`Valid · ${total} matches in ${hits.length} pages`, `有效 · ${hits.length} 頁共 ${total} 個配對`) : "";
  results.hidden = false;
  results.innerHTML = hits.length
    ? hits.slice(0, 30).map(({ item, count }) => `<a href="${base}${item.url}"><span class="kind">${escapeHtml(item.section)} · ${count}</span><strong>${escapeHtml(item.title)}</strong><span class="muted">${snippet(item.text, re)}</span></a>`).join("")
    : `<p class="muted">${say("Nothing matched.", "沒有配對結果。")}</p>`;
}
toggle?.addEventListener("click", () => {
  const on = !regexMode();
  toggle.setAttribute("aria-pressed", String(on));
  builder.hidden = !on;
  if (on && !rx.value && q.value) rx.value = q.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  (on ? rx : q).focus();
  runSearch();
});
for (const el of [q, rx, $("#flag-i"), $("#flag-m"), $("#flag-s"), $("#scope-title")]) el?.addEventListener("input", runSearch);
for (const b of $$(".token")) b.addEventListener("click", () => {
  const tok = b.dataset.token === "( )" ? "()" : b.dataset.token === "[ ]" ? "[]" : b.dataset.token;
  const at = rx.selectionStart ?? rx.value.length;
  rx.value = rx.value.slice(0, at) + tok + rx.value.slice(rx.selectionEnd ?? at);
  rx.focus();
  const caret = at + (tok.length === 2 && "([".includes(tok[0]) ? 1 : tok.length);
  rx.setSelectionRange(caret, caret);
  runSearch();
});

// Screenshot guides.
const guide = $(".guide");
if (guide) {
  const key = `mq-docs-guide-${guide.dataset.guide}`;
  const count = Number(guide.dataset.count);
  const buttons = $$(".steps button", guide);
  const figures = $$(".step", guide);
  let current = Math.min(count - 1, Math.max(0, Number(new URLSearchParams(location.search).get("step") ?? store.get(key, 0)) || 0));
  const show = (i, focus) => {
    current = Math.min(count - 1, Math.max(0, i));
    figures.forEach((f, n) => (f.hidden = n !== current));
    buttons.forEach((b, n) => { b.toggleAttribute("aria-current", n === current); if (n === current) b.setAttribute("aria-current", "step"); b.parentElement.classList.toggle("done", n < current); });
    $("[data-move='-1']", guide).disabled = current === 0;
    const next = $("[data-move='1']", guide);
    next.disabled = current === count - 1;
    store.set(key, String(current));
    if (focus) figures[current].querySelector("figcaption").scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  buttons.forEach((b, n) => b.addEventListener("click", () => show(n, true)));
  for (const b of $$("[data-move]", guide)) b.addEventListener("click", () => show(current + Number(b.dataset.move), true));
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input,select,textarea")) return;
    if (e.key === "ArrowRight") show(current + 1, true);
    if (e.key === "ArrowLeft") show(current - 1, true);
  });
  show(current, false);
}

applyLanguage();
applyTheme();

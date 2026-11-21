import {
  readTabs,
  syncTabs,
  activateTab,
  closeTab,
  pinTab,
  openAllTabs,
  initialTab,
} from "./workspace-tabs.js";
import { rememberFocus, restoreFocus } from "./focus.js";
import { commandInventory, searchCommands } from "./commands.js";
import { formatBuildTimestamp } from "./provenance.js";
import { loadDraft, saveDraft, clearDraft } from "./drafts.js";
import { platformFields } from "./capability-view.js";
import { createViews } from "./views.js";
import { uploadIso, uploadFile } from "./upload.js";
import { applyScheme, SEEDS, seedHex } from "./md3-color.js";
import { showGate } from "./confirm-ui.js";
import {
  defaultConfig,
  applyPreset,
  normalizeMachine,
  toV2Payload,
  toLegacyPayload,
  setPath,
  coerce,
  addForward,
  newDisk,
  moveBoot,
  validateConfig,
  totalCpus,
} from "./machine-form.js";
import { normalizeStorage, kindOfUpload } from "./storage-model.js";
import { localizeServerError } from "./server-errors.js";
import { createReleaseChord } from "./input-release.js";
import { createConsoleTools } from "./console-tools.js";
import { compileSearch, SEARCH_FIELDS, MAX_PATTERN } from "./search-pattern.js";
import { createNotificationLog } from "./notifications.js";
import { explainPattern, createLibrary } from "./regex-tools.js";
import { runBounded } from "./regex-runner.js";
import { flavourReport, generateCode, LANGUAGES } from "./regex-convert.js";
import { searchEverywhere } from "./search-everywhere.js";
import { accountBadge, viewerNote } from "./people-view.js";

// Help articles as plain text, rebuilt when the language changes, so the
// header search can find them.
let docsIndexCache = { key: "", items: [] };
function docsIndex() {
  const key = state.settings.language;
  if (docsIndexCache.key === key) return docsIndexCache.items;
  const doc = new DOMParser().parseFromString(views().docs(), "text/html");
  const items = [...doc.querySelectorAll("article")].map((a) => ({ title: a.querySelector("h2")?.textContent.trim() || "", text: a.textContent.replace(/\s+/g, " ").trim() }));
  docsIndexCache = { key, items };
  return items;
}
function drawSearchElsewhere() {
  const holder = document.querySelector("#search-elsewhere");
  if (!holder) return;
  const found = searchEverywhere(currentSearch(), { storage, docs: docsIndex() });
  if (!found) { holder.innerHTML = ""; return; }
  if (!found.storageKnown) loadStorage().then(() => storage && document.querySelector("#search-elsewhere") && drawSearchElsewhere());
  // Highlight the hit in the field it was found in.
  const mark = (value, x, field) => {
    const v = String(value ?? "");
    if (x.field !== field) return escape(v);
    const [s, e] = x.span;
    return `${escape(v.slice(0, s))}<mark>${escape(v.slice(s, e))}</mark>${escape(v.slice(e))}`;
  };
  const snip = (x) => `${x.cutStart ? "…" : ""}${escape(x.before)}<mark>${escape(x.hit)}</mark>${escape(x.after)}${x.cutEnd ? "…" : ""}`;
  const entry = (action, icon, title, sub) => `<li>${button(action, `<span class="icon" aria-hidden="true">${icon}</span><span><strong>${title}</strong>${sub ? `<small>${sub}</small>` : ""}</span>`, "elsewhere-entry")}</li>`;
  const group = (title, items, row) => items.length ? `<h3>${title} <span class="muted">${items.length}</span></h3><ul class="elsewhere-list">${items.map(row).join("")}</ul>` : "";
  holder.innerHTML = `<section class="card search-elsewhere" aria-label="${t("Also found", "其他結果")}"><h2>${t("Also found", "其他結果")}</h2>${found.total ? "" : `<p class="muted-line">${found.storageKnown ? t("No disks, ISOs or help articles match.", "沒有符合的磁碟、ISO 或說明文章。") : t("Checking storage…", "正在檢查儲存空間…")}</p>`}${group(t("Disk images", "磁碟映像"), found.disks, (d) => entry("page:storage", "hard_drive", mark(d.name, d, "name"), [d.machineName ? t("Machine ", "機器 ") + mark(d.machineName, d, "machineName") : "", mark(d.format, d, "format")].filter(Boolean).join(" · ")))}${group(t("ISO images", "ISO 映像"), found.isos, (i) => entry("page:storage", "album", mark(i.name, i, "name"), ""))}${group(t("Help articles", "說明文章"), found.articles, (x) => entry(`open-doc:${x.index}`, "menu_book", mark(x.title, x, "title"), x.snippet ? snip(x.snippet) : ""))}</section>`;
}

// Regex builder tabs: explain, test bench, replace, split and the saved library.
const regexLibrary = createLibrary();
let regexTab = "explain", regexSample = null, regexReplacement = "", regexRun = 0, regexLast = { key: "", html: "" };
let regexDebug = null, regexDebugStep = 0, regexCodeLang = "JavaScript", regexFiles = [];
let regexFileReplace = false, regexFileReplacement = "", regexFileResults = [];
// Machine page tab and the data its Monitor and Log tabs have fetched.
// Storage pools with their health, used by Storage, the create form and the Overview.
let poolsList = null, poolsLoadedAt = 0, poolsLoading = false;
// Health changes (a drive can be unplugged), so it is fetched again after 30 seconds.
const poolsStale = () => poolsList === null || Date.now() - poolsLoadedAt > 30000;
async function loadPools() {
  if (poolsLoading) return;
  poolsLoading = true;
  const r = await tryApi("/pools").finally(() => { poolsLoading = false; });
  poolsLoadedAt = Date.now();
  poolsList = r.ok ? r.data : { pools: [] };
  if (["storage", "new", "overview"].includes(page) && session?.authenticated) rerenderQuiet();
}
// People who can sign in besides the owner (owner only).
let peopleList = null;
async function loadPeople() {
  if (session?.user && session.user.role !== "owner") return;
  const r = await tryApi("/users");
  peopleList = r.ok ? r.data : { users: [] };
  if (page === "settings" && session?.authenticated) rerenderQuiet();
}
// Custom firmware images in managed storage, and the last upload's outcome.
let firmwareList = null, firmwareUpload = null;
async function loadFirmware() {
  const r = await tryApi("/firmware");
  firmwareList = r.ok ? r.data : { images: [] };
  if (["storage", "new"].includes(page) && session?.authenticated) rerenderQuiet();
}
let machineTab = "overview", machineView = { id: null, query: "status", results: {}, log: null };
function machineViewFor(id) {
  if (machineView.id !== id) machineView = { id, query: "status", results: {}, log: null, agentQuery: "os", agentResults: {} };
  return machineView;
}
async function loadMonitorQuery(name) {
  const id = selected;
  const view = machineViewFor(id);
  view.query = name;
  delete view.results[name];
  if (page === "console" && machineTab === "monitor") rerenderQuiet();
  const r = await tryApi(`/machines/${id}/monitor/${name}`);
  if (machineView.id !== id) return;
  view.results[name] = r.ok ? { ...r.data, error: r.data.ok ? null : localizeServerError(r.data.error, t), at: Date.now() } : { ok: false, error: localizeServerError(r.error?.message || String(r.error), t), at: Date.now() };
  if (page === "console" && machineTab === "monitor") rerenderQuiet();
}
async function loadGuestQuery(name) {
  const id = selected;
  const view = machineViewFor(id);
  view.agentQuery = name;
  delete view.agentResults[name];
  if (page === "console" && machineTab === "agent") rerenderQuiet();
  const r = await tryApi(`/machines/${id}/agent/${name}`);
  if (machineView.id !== id) return;
  view.agentResults[name] = r.ok ? { ...r.data, error: r.data.ok ? null : localizeServerError(r.data.error, t), at: Date.now() } : { ok: false, error: localizeServerError(r.error?.message || String(r.error), t), at: Date.now() };
  if (page === "console" && machineTab === "agent") rerenderQuiet();
}
async function loadMachineLog() {
  const id = selected;
  const view = machineViewFor(id);
  const r = await tryApi(`/machines/${id}/log`);
  if (machineView.id !== id) return;
  view.log = r.ok ? r.data : { error: localizeServerError(r.error?.message || String(r.error), t) };
  if (page === "console" && machineTab === "log") rerenderQuiet();
}
// Gives the browser a changed file to save. Nothing on disk is changed in place.
function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const REGEX_FILE_LIMIT = 20, REGEX_FILE_BYTES = 2 * 1024 * 1024;
const regexFilesKey = () => regexFiles.map((x) => `${x.name}:${x.text.length}:${x.modified}`).join("|");
function regexStepLabel(e) {
  const kinds = { start: ["Start a new attempt", "開始新一輪嘗試"], try: ["Try", "嘗試"], match: ["Matched", "符合"], fail: ["Failed", "不符合"], backtrack: ["Back up and try another way", "回溯，改試另一種方法"], found: ["Match found", "找到配對"] };
  return t(...kinds[e.kind]);
}
function drawDebug() {
  const out = document.querySelector("#regex-output");
  const d = regexDebug?.result;
  if (!out || !d) return;
  const sample = regexDebug.sample;
  let html;
  if (d.unsupported) html = `<p class="muted-line">${escape(t(`The debugger cannot step through ${d.unsupported}. The Test tab still runs the pattern with the browser's engine.`, `除錯器無法逐步執行${d.unsupported === "look-behind" ? "後顧" : "Unicode 屬性"}。測試分頁仍會用瀏覽器引擎執行此樣式。`))}</p>`;
  else if (!d.ok) html = `<p class="error-text" role="alert">${escape(localizeServerError(d.error || "", t))}</p>`;
  else {
    const n = d.trace.length;
    regexDebugStep = Math.max(0, Math.min(regexDebugStep, n - 1));
    const e = d.trace[regexDebugStep];
    const summary = d.aborted ? t(`Stopped after ${d.steps.toLocaleString()} steps: this pattern backtracks too much.`, `${d.steps.toLocaleString()} 步後已停止：此樣式回溯太多。`)
      : d.match ? t(`Match “${d.match.text}” at ${d.match.index}–${d.match.end} after ${d.steps.toLocaleString()} steps.`, `經過 ${d.steps.toLocaleString()} 步，在 ${d.match.index}–${d.match.end} 找到配對「${d.match.text}」。`)
      : t(`No match after ${d.steps.toLocaleString()} steps.`, `經過 ${d.steps.toLocaleString()} 步，沒有配對。`);
    const pos = Math.min(e.pos, sample.length);
    const textView = `${escape(sample.slice(0, pos))}<span class="caret" aria-hidden="true"></span>${escape(sample.slice(pos))}`;
    const pat = e.end > e.start ? `${escape(query.slice(0, e.start))}<mark>${escape(query.slice(e.start, e.end))}</mark>${escape(query.slice(e.end))}` : escape(query);
    const from = Math.max(0, regexDebugStep - 5), to = Math.min(n, regexDebugStep + 7);
    const near = d.trace.slice(from, to).map((x, k) => `<li class="step-${x.kind}${from + k === regexDebugStep ? " current" : ""}"><span class="num">${from + k + 1}</span><span>${escape(regexStepLabel(x))}</span><code>${escape(query.slice(x.start, x.end)) || "&nbsp;"}</code><span class="muted">@${x.pos}</span></li>`).join("");
    html = `<p class="muted-line" id="regex-debug-summary">${escape(summary)}${d.truncated ? " " + escape(t(`Showing the first ${n.toLocaleString()} steps.`, `只顯示首 ${n.toLocaleString()} 步。`)) : ""}${d.textCut ? " " + escape(t("Only the first 2,000 characters of the sample are stepped.", "只逐步執行範例的首 2,000 個字元。")) : ""}</p>
<div class="regex-row debug-controls">${button("regex-step:first", '<span class="icon" aria-hidden="true">first_page</span>', "icon-btn", `aria-label="${t("First step", "第一步")}"`)}${button("regex-step:prev", '<span class="icon" aria-hidden="true">chevron_left</span>', "icon-btn", `aria-label="${t("Previous step", "上一步")}"`)}<input type="range" id="regex-step-range" min="1" max="${n}" value="${regexDebugStep + 1}" aria-label="${t("Step", "步驟")}">${button("regex-step:next", '<span class="icon" aria-hidden="true">chevron_right</span>', "icon-btn", `aria-label="${t("Next step", "下一步")}"`)}${button("regex-step:last", '<span class="icon" aria-hidden="true">last_page</span>', "icon-btn", `aria-label="${t("Last step", "最後一步")}"`)}<span id="regex-step-label" class="mono">${regexDebugStep + 1} / ${n}</span></div>
<p class="debug-now" aria-live="polite"><strong>${escape(regexStepLabel(e))}</strong> ${t("at position", "位置")} ${e.pos}</p>
<div class="debug-views"><div><span class="label">${t("Pattern", "樣式")}</span><pre class="regex-preview">${pat}</pre></div><div><span class="label">${t("Text", "文字")}</span><pre class="regex-preview">${textView}</pre></div></div>
<ol class="debug-steps">${near}</ol>`;
  }
  regexLast = { key: regexDebug.key, html };
  out.innerHTML = html;
}
const regexFlagString = () => `${searchOpts.flags.i ? "i" : ""}${searchOpts.flags.m ? "m" : ""}${searchOpts.flags.s ? "s" : ""}${searchOpts.flags.u ? "u" : ""}`;
function regexSampleText() {
  return regexSample ?? state.machines.map((m) => `${m.name}\t${m.arch}\t${m.folder || ""}\t${(m.tags || []).join(" ")}\t${m.notes || ""}`).join("\n");
}
function regexTabBody() {
  const tab = (id, en, yue) => button(`regex-tab:${id}`, t(en, yue), regexTab === id ? "selected" : "", `role="tab" aria-selected="${regexTab === id}" aria-controls="regex-tab-body"`);
  const tabs = `<div class="chips regex-tabs" role="tablist" aria-label="${t("Builder tools", "建構工具")}">${tab("explain", "Explain", "解釋")}${tab("test", "Test", "測試")}${tab("replace", "Replace", "取代")}${tab("split", "Split", "分割")}${tab("library", "Library", "樣式庫")}${tab("debug", "Debug", "除錯")}${tab("flavours", "Other flavours", "其他語法")}${tab("code", "Code", "程式碼")}${tab("files", "Search files", "搜尋檔案")}</div>`;
  let body = "";
  if (regexTab === "explain") {
    const s = currentSearch();
    body = !query ? `<p class="muted-line">${t("Type a pattern to see what each part means.", "輸入樣式，即可看到每部分的意思。")}</p>`
      : !s.ok ? `<p class="muted-line">${t("Fix the pattern first.", "請先修正樣式。")}</p>`
      : `<ol class="explain">${explainPattern(query).map((p) => `<li style="--depth:${p.depth}"><code>${escape(p.text)}</code><span>${escape(t(p.en, p.yue))}</span></li>`).join("")}</ol>`;
  } else if (regexTab === "flavours") {
    const s = currentSearch();
    body = !query || !s.ok ? `<p class="muted-line">${t("Type a valid pattern to compare flavours.", "輸入有效樣式，即可比較各種語法。")}</p>`
      : `<div class="table-wrap"><table class="regex-flavours"><thead><tr><th>${t("Engine", "引擎")}</th><th>${t("Result", "結果")}</th><th>${t("Notes", "備註")}</th></tr></thead><tbody>${flavourReport(query, regexFlagString()).map((r) => `<tr><td>${escape(r.name)}</td><td><span class="pill ${r.ok ? "healthy" : "error"}">${r.ok ? (r.notes.length ? t("Works, with differences", "可用，但有差異") : t("Works as written", "照寫可用")) : t("Does not work", "不能使用")}</span></td><td>${r.notes.map((x) => `<div>${escape(t(...x))}</div>`).join("") || "–"}${r.converted ? `<div>${t("Converted:", "轉換後：")} <code>${escape(r.converted)}</code></div>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
  } else if (regexTab === "code") {
    const s = currentSearch();
    body = `<div class="chips" role="radiogroup" aria-label="${t("Language", "程式語言")}">${LANGUAGES.map((l) => button(`regex-lang:${l}`, escape(l), regexCodeLang === l ? "selected" : "", `role="radio" aria-checked="${regexCodeLang === l}"`)).join("")}</div>${!query || !s.ok ? `<p class="muted-line">${t("Type a valid pattern to generate code.", "輸入有效樣式，即可產生程式碼。")}</p>` : `<pre class="regex-preview" id="regex-code">${escape(generateCode(query, regexFlagString(), regexCodeLang))}</pre>${button("regex-copy", `<span class="icon" aria-hidden="true">content_copy</span>${t("Copy code", "複製程式碼")}`)}`}`;
  } else if (regexTab === "files") {
    body = `<p class="muted-line">${t(`Pick up to ${REGEX_FILE_LIMIT} text files of at most 2 MiB each. They are read in this browser only and never uploaded.`, `最多選擇 ${REGEX_FILE_LIMIT} 個文字檔，每個最多 2 MiB。檔案只在此瀏覽器讀取，不會上載。`)}</p><div class="regex-row"><label class="pick-files"><span class="icon" aria-hidden="true">folder_open</span>${t("Choose files", "選擇檔案")}<input type="file" id="regex-files" multiple accept=".txt,.log,.md,.csv,.json,.xml,.yaml,.yml,.ini,.conf,.cfg,.sh,.ps1,.js,.py,text/*" class="sr-only"></label>${regexFiles.length ? button("regex-files-clear", t("Clear files", "清除檔案"), "ghost") : ""}<span class="muted">${regexFiles.map((x) => escape(x.name)).join(", ")}</span></div><div class="regex-row"><label class="chip-check"><input type="checkbox" id="regex-file-replace" ${regexFileReplace ? "checked" : ""}> ${t("Replace in files", "在檔案中取代")}</label>${regexFileReplace ? `<label class="field grow"><span>${t("Replace with ($1, $&lt;name&gt;, $&amp; are allowed)", "取代為（可用 $1、$&lt;name&gt;、$&amp;）")}</span><input id="regex-file-replacement" class="mono" value="${escape(regexFileReplacement)}" spellcheck="false"></label>` : ""}</div>${regexFileReplace ? `<p class="muted-line">${t("Your files are not changed. Review the changes, then download the changed copies.", "不會更改你的檔案。檢查變更後，下載已更改的副本。")}</p>` : ""}<div id="regex-output" class="regex-output" aria-live="polite"></div>`;
  } else if (regexTab === "test" || regexTab === "replace" || regexTab === "split" || regexTab === "debug") {
    body = `<label class="field"><span>${t("Sample text (starts as your machines, one per line)", "範例文字（預設為你的機器，每行一部）")}</span><textarea id="regex-sample" rows="4" spellcheck="false" class="mono">${escape(regexSampleText())}</textarea></label>${regexTab === "replace" ? `<label class="field"><span>${t("Replace with ($1, $&lt;name&gt;, $&amp; are allowed)", "取代為（可用 $1、$&lt;name&gt;、$&amp;）")}</span><input id="regex-replacement" class="mono" value="${escape(regexReplacement)}" spellcheck="false"></label>` : ""}<div id="regex-output" class="regex-output" aria-live="polite"></div>`;
  } else if (regexTab === "library") {
    const items = regexLibrary.list();
    body = `<div class="regex-row"><input id="regex-lib-name" maxlength="60" placeholder="${t("Name this pattern", "為此樣式命名")}" aria-label="${t("Pattern name", "樣式名稱")}">${button("regex-save", t("Save current pattern", "儲存目前樣式"), "", query ? "" : "disabled")}</div>${items.length ? `<ul class="regex-library">${items.map((p, i) => `<li><span><strong>${escape(p.name)}</strong><code>/${escape(p.pattern)}/${escape(p.flags)}</code></span>${button(`regex-use:${i}`, t("Use", "使用"))}${button(`regex-delete:${i}`, '<span class="icon" aria-hidden="true">delete</span>', "icon-btn", `aria-label="${escape(t("Delete ", "刪除 ") + p.name)}"`)}</li>`).join("")}</ul>` : `<p class="muted-line">${t("No saved patterns yet.", "暫時沒有已儲存的樣式。")}</p>`}`;
  }
  return `${tabs}<div id="regex-tab-body" role="tabpanel">${body}</div><p class="muted-line flavour">${t("JavaScript (ECMAScript) flavour: look-ahead and look-behind, named groups, Unicode properties with u. No possessive quantifiers, atomic groups or recursion. Test runs stop after one second.", "JavaScript（ECMAScript）語法：支援前瞻及後顧、具名群組、u 旗標下的 Unicode 屬性；不支援佔有量詞、原子群組或遞迴。測試超過一秒會停止。")}</p>`;
}
async function refreshRegexOutput() {
  const out = document.querySelector("#regex-output");
  if (!out) return;
  const s = currentSearch();
  if (!query) { out.innerHTML = `<p class="muted-line">${t("Type a pattern in the search box.", "請在搜尋框輸入樣式。")}</p>`; return; }
  if (!s.ok) { out.innerHTML = `<p class="muted-line">${t("Fix the pattern first.", "請先修正樣式。")}</p>`; return; }
  const sample = regexSampleText();
  const flags = regexFlagString();
  if (regexTab === "files" && !regexFiles.length) { out.innerHTML = `<p class="muted-line">${t("No files chosen yet.", "尚未選擇檔案。")}</p>`; return; }
  const key = JSON.stringify([regexTab, query, flags, regexTab === "files" ? regexFilesKey() : sample, regexTab === "files" ? [regexFileReplace, regexFileReplacement] : regexReplacement]);
  if (key === regexLast.key) { out.innerHTML = regexLast.html; return; }
  const run = ++regexRun;
  if (regexTab === "debug") {
    out.innerHTML = `<p class="muted-line">${t("Running…", "執行中…")}</p>`;
    const r = await runBounded("debugMatch", [query, flags, sample], { limit: 3000 });
    if (run !== regexRun) return;
    regexDebug = { key, sample: sample.slice(0, 2000), result: r.ok ? r.result : { ok: false, error: r.timedOut ? "The debugger ran out of time." : r.error } };
    regexDebugStep = 0;
    drawDebug();
    return;
  }
  if (regexTab === "files" && regexFileReplace) {
    out.innerHTML = `<p class="muted-line">${t("Replacing…", "取代中…")}</p>`;
    const r = await runBounded("replaceFiles", [query, flags, regexFiles.map(({ name, text }) => ({ name, text })), regexFileReplacement], { limit: 3000 });
    if (run !== regexRun) return;
    let html;
    if (!r.ok) { regexFileResults = []; html = `<p class="error-text" role="alert">${escape(r.timedOut ? t("Stopped after three seconds: this pattern backtracks too much on these files.", "三秒後已停止：此樣式在這些檔案上回溯太多。") : localizeServerError(r.error, t))}</p>`; }
    else {
      regexFileResults = r.result;
      const changedFiles = regexFileResults.filter((x) => x.count);
      const total = changedFiles.reduce((n, x) => n + x.count, 0);
      html = `<p class="muted-line">${t(`${total.toLocaleString()} replacements in ${changedFiles.length} of ${regexFileResults.length} files`, `${regexFileResults.length} 個檔案中有 ${changedFiles.length} 個會更改，共 ${total.toLocaleString()} 處取代`)} <span class="muted">${r.ms} ms</span></p>${changedFiles.length > 1 ? button("regex-file-download:all", `<span class="icon" aria-hidden="true">download</span>${t("Download all changed files", "下載所有已更改檔案")}`) : ""}${regexFileResults.map((x, i) => x.count ? `<details open class="file-hits"><summary><span class="mono">${escape(x.name)}</span> <span class="muted">${t(`${x.count} replacements`, `${x.count} 處取代`)}</span></summary>${button(`regex-file-download:${i}`, `<span class="icon" aria-hidden="true">download</span>${t("Download changed copy", "下載已更改副本")}`, "ghost", `aria-label="${escape(t("Download changed copy of ", "下載已更改副本：") + x.name)}"`)}${x.linesChanged ? `<p class="muted-line">${t("The number of lines changes, so lines are not compared one by one.", "行數有變，因此不逐行比較。")}</p>` : `<ol class="file-lines diff">${x.changed.map((l) => `<li><span class="num">${l.line}</span><span class="pair"><code class="before">${escape(l.before)}</code><code class="after">${escape(l.after)}</code></span></li>`).join("")}</ol>`}</details>` : "").join("")}`;
    }
    regexLast = { key, html };
    const el = document.querySelector("#regex-output");
    if (el) el.innerHTML = html;
    return;
  }
  if (regexTab === "files") {
    out.innerHTML = `<p class="muted-line">${t("Searching…", "搜尋中…")}</p>`;
    const r = await runBounded("searchFiles", [query, flags, regexFiles.map(({ name, text }) => ({ name, text }))], { limit: 3000 });
    if (run !== regexRun) return;
    let html;
    if (!r.ok) html = `<p class="error-text" role="alert">${escape(r.timedOut ? t("Stopped after three seconds: this pattern backtracks too much on these files.", "三秒後已停止：此樣式在這些檔案上回溯太多。") : localizeServerError(r.error, t))}</p>`;
    else {
      const res = r.result;
      const mark = (line) => { let h = "", at = 0; for (const [a, b] of line.ranges) { if (a < at || a > line.text.length) continue; h += escape(line.text.slice(at, a)) + `<mark>${escape(line.text.slice(a, b)) || "|"}</mark>`; at = b; } return h + escape(line.text.slice(at)); };
      html = `<p class="muted-line">${t(`${res.total.toLocaleString()} matching lines in ${res.files.filter((x) => x.count).length} of ${res.files.length} files`, `${res.files.length} 個檔案中有 ${res.files.filter((x) => x.count).length} 個符合，共 ${res.total.toLocaleString()} 行`)}${res.truncated ? " " + t("(first 500 lines shown)", "（只顯示首 500 行）") : ""} <span class="muted">${r.ms} ms</span></p>${res.files.filter((x) => x.lines.length).map((x) => `<details open class="file-hits"><summary><span class="mono">${escape(x.name)}</span> <span class="muted">${t(`${x.count} matches`, `${x.count} 個配對`)}</span></summary><ol class="file-lines">${x.lines.map((l) => `<li><span class="num">${l.line}</span><code>${mark(l)}</code></li>`).join("")}</ol></details>`).join("")}`;
    }
    regexLast = { key, html };
    const el = document.querySelector("#regex-output");
    if (el) el.innerHTML = html;
    return;
  }
  const op = regexTab === "replace" ? ["previewReplace", [query, flags, sample, regexReplacement]] : regexTab === "split" ? ["previewSplit", [query, flags, sample]] : ["findMatches", [query, flags, sample]];
  out.innerHTML = `<p class="muted-line">${t("Running…", "執行中…")}</p>`;
  const r = await runBounded(op[0], op[1]);
  if (run !== regexRun) return;
  const show = (html) => { regexLast = { key, html }; const el = document.querySelector("#regex-output"); if (el) el.innerHTML = html; };
  if (!r.ok) { show(`<p class="error-text" role="alert">${escape(r.timedOut ? t("Stopped after one second: this pattern backtracks too much on this text.", "一秒後已停止：此樣式在這段文字上回溯太多。") : localizeServerError(r.error, t))}</p>`); return; }
  const ms = `<span class="muted">${r.ms} ms</span>`;
  if (regexTab === "replace") { show(`<p class="muted-line">${t("Preview, nothing is changed:", "預覽，不會更改任何內容：")} ${ms}</p><pre class="regex-preview">${escape(r.result)}</pre>`); return; }
  if (regexTab === "split") { show(`<p class="muted-line">${t(`${r.result.length} parts`, `共 ${r.result.length} 部分`)} ${ms}</p><ol class="regex-parts">${r.result.map((p) => `<li><code>${escape(p) || "∅"}</code></li>`).join("")}</ol>`); return; }
  const { matches, truncated } = r.result;
  let html = "", at = 0;
  for (const m of matches) { html += escape(sample.slice(at, m.index)) + `<mark>${escape(m.text) || "|"}</mark>`; at = m.end; }
  html += escape(sample.slice(at));
  show(`<p class="muted-line">${t(`${matches.length}${truncated ? "+" : ""} matches`, `${matches.length}${truncated ? "+" : ""} 個配對`)} ${ms}</p><pre class="regex-preview">${html}</pre>${matches.length ? `<div class="table-wrap"><table class="regex-matches"><thead><tr><th>#</th><th>${t("Match", "配對")}</th><th>${t("Position", "位置")}</th><th>${t("Groups", "群組")}</th></tr></thead><tbody>${matches.slice(0, 50).map((m, i) => `<tr><td>${i + 1}</td><td><code>${escape(m.text)}</code></td><td>${m.index}–${m.end}</td><td>${m.groups.map((g) => `<code>${g.number}:${g.value === null ? "–" : escape(g.value)}</code>`).join(" ")}${Object.entries(m.named).map(([k, v]) => ` <code>${escape(k)}=${escape(v ?? "–")}</code>`).join("")}</td></tr>`).join("")}</tbody></table></div>` : ""}`);
}
function updateRegexTools() {
  const holder = document.querySelector("#regex-tools");
  if (!holder) return;
  const focusId = document.activeElement?.id;
  if (!["regex-sample", "regex-replacement", "regex-lib-name", "regex-step-range", "regex-file-replacement"].includes(focusId)) holder.innerHTML = regexTabBody();
  refreshRegexOutput();
}

// Every notice is also kept in the notifications center (this browser only).
const notificationLog = createNotificationLog();
function notificationBadge() {
  const n = notificationLog.unread();
  const b = document.querySelector('[data-action="notifications"]');
  if (!b) return;
  b.setAttribute("aria-label", n ? t(`Notifications, ${n} unread`, `通知，${n} 則未讀`) : t("Notifications", "通知"));
  const badge = b.querySelector(".badge");
  if (badge) {
    badge.textContent = n > 99 ? "99+" : String(n);
    badge.hidden = !n;
  }
}
function notificationPanel() {
  let panel = document.querySelector("#notification-panel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "notification-panel";
    panel.className = "notification-panel";
    panel.hidden = true;
    panel.setAttribute("aria-labelledby", "notification-title");
    document.body.append(panel);
  }
  return panel;
}
function drawNotifications() {
  const panel = notificationPanel();
  const items = notificationLog.list();
  const time = (at) => new Date(at).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false, month: "short", day: "numeric" });
  panel.innerHTML = `<div class="notification-head"><h2 id="notification-title" tabindex="-1">${t("Notifications", "通知")}</h2>${button("notifications-read", t("Mark all read", "全部標為已讀"), "ghost", items.some((n) => !n.read) ? "" : "disabled")}${button("notifications-clear", t("Clear", "清除"), "ghost", items.length ? "" : "disabled")}${button("notifications-close", '<span class="icon" aria-hidden="true">close</span>', "icon-btn", `aria-label="${escape(t("Close notifications", "關閉通知"))}"`)}</div>${items.length ? `<ul class="notification-list">${items.map((n) => `<li class="${n.read ? "" : "unread"}"><span>${escape(n.message)}</span><time datetime="${escape(n.at)}">${escape(time(n.at))}</time></li>`).join("")}</ul>` : `<p class="muted-line">${t("No notifications yet. Messages about your actions appear here.", "暫時沒有通知，操作訊息會在這裡顯示。")}</p>`}`;
}
function toggleNotifications(open) {
  const panel = notificationPanel();
  const show = open ?? panel.hidden;
  const trigger = document.querySelector('[data-action="notifications"]');
  if (show) {
    drawNotifications();
    panel.hidden = false;
    trigger?.setAttribute("aria-expanded", "true");
    panel.querySelector("#notification-title")?.focus();
  } else {
    if (!panel.hidden) notificationLog.markAllRead();
    panel.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
    notificationBadge();
    if (panel.contains(document.activeElement) || document.activeElement === document.body) trigger?.focus();
  }
}
const { startRegistration, startAuthentication } = window.SimpleWebAuthnBrowser;

const $ = (selector) => document.querySelector(selector);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const bytes = (value) =>
  value == null
    ? t("Unavailable", "未能提供")
    : `${(value / 1073741824).toFixed(1)} GiB`;
let session,
  state,
  page = "overview",
  query = "",
  searchOpts = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem("mq-search") || "{}");
      return { regex: saved.regex === true, flags: { i: saved.flags?.i !== false, m: saved.flags?.m === true, s: saved.flags?.s === true, u: saved.flags?.u === true }, fields: Array.isArray(saved.fields) && saved.fields.length ? saved.fields.filter((f) => SEARCH_FIELDS.includes(f)) : [...SEARCH_FIELDS] };
    } catch {
      return { regex: false, flags: { i: true, m: false, s: false, u: false }, fields: [...SEARCH_FIELDS] };
    }
  })(),
  filter = "all",
  folder = "",
  selected = "",
  checked = new Set(),
  editing = false,
  host = null,
  hostLoaded = false,
  applianceUpdate = null,
  updateTimer = null,
  snapshotStore = {},
  storage = null,
  storageTab = "disks",
  upload = null,
  createCfg = null,
  createSection = "system",
  silentRender = false,
  rfb,
  noticeTimer,
  dialogOpener,
  dialogOpenerAction;
let onboardingMachine = false;
let workspace = readTabs(localStorage),
  catalogMode = "commands",
  catalogEntries = [];
let workspaceRestored = false;
let previewTimer,
  previewSequence = 0;
let consoleScale = localStorage.getItem("mq-console-scale") !== "false";
let consoleInput = localStorage.getItem("mq-console-input") !== "false";
const readFlag = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "true";
  } catch {
    return fallback;
  }
};
const appearance = {
  seed: (() => {
    try {
      return localStorage.getItem("mq-seed") || "ember";
    } catch {
      return "ember";
    }
  })(),
  thumbs: readFlag("mq-thumbs", true),
  transitions: readFlag("mq-transitions", true),
};
const thumbs = { enabled: appearance.thumbs, failed: new Map(), tick: 0 };
const names = {
  overview: ["Overview", "總覽"],
  machines: ["All machines", "所有機器"],
  storage: ["Storage", "儲存空間"],
  new: ["New machine", "新增機器"],
  settings: ["Settings", "設定"],
  docs: ["Help & documentation", "說明文件"],
  history: ["Activity", "活動記錄"],
  console: ["Console", "主控台"],
};
function t(en, yue = en) {
  const mode =
    state?.settings.language || localStorage.getItem("mq-language") || "en";
  return mode === "yue"
    ? yue
    : mode === "both" && en !== yue
      ? `${en} · ${yue}`
      : en;
}
function label(key) {
  return t(...names[key]);
}
function enumLabel(value) {
  const labels = {
    all: ["All", "全部"],
    favourites: ["Favourites", "最愛"],
    attention: ["Needs attention", "需要處理"],
    recent: ["Recently used", "最近使用"],
    running: ["Running", "運行中"],
    paused: ["Paused", "已暫停"],
    stopped: ["Stopped", "已停止"],
    starting: ["Starting", "啟動中"],
    error: ["Error", "錯誤"],
    prelaunch: ["Ready to resume", "準備繼續"],
    cards: ["Cards", "卡片"],
    list: ["List", "清單"],
    compact: ["Compact", "緊密"],
    platform: ["Platform", "平台"],
    memory: ["Memory", "記憶體"],
    cpu: ["CPU", "處理器"],
    none: ["Disconnected", "不連網"],
    user: ["Restricted user network", "受限制使用者網絡"],
  };
  return labels[value] ? t(...labels[value]) : value;
}
function notify(message) {
  notificationLog.add(message);
  notificationBadge();
  if (!notificationPanel().hidden) drawNotifications();
  const text = document.createElement("span");
  text.textContent = message;
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = t("Dismiss", "關閉通知");
  dismiss.onclick = () => $("#notice").replaceChildren();
  $("#notice").replaceChildren(text, dismiss);
  clearTimeout(noticeTimer);
  if (!matchMedia("(max-width:760px)").matches)
    noticeTimer = setTimeout(() => $("#notice").replaceChildren(), 6500);
}
async function api(route, body, options = {}) {
  const response = await fetch(`/api${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            "X-CSRF-Token": session?.csrf || "",
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(data.error ? localizeServerError(data.error, t) : t("Request failed.", "請求失敗。"));
    error.status = response.status;
    throw error;
  }
  return data;
}
// Endpoints the server may not have yet answer 404 or 501; report that instead of throwing.
async function tryApi(route, body) {
  try {
    return { ok: true, data: await api(route, body) };
  } catch (error) {
    if ([404, 405, 501].includes(error.status) || error.message === "Not found.")
      return { ok: false, unavailable: true, error };
    return { ok: false, unavailable: false, error };
  }
}
async function apiDelete(route) {
  const response = await fetch(`/api${route}`, {
    method: "DELETE",
    headers: { "X-CSRF-Token": session?.csrf || "" },
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(data.error ? localizeServerError(data.error, t) : t("Request failed.", "請求失敗。"));
    error.status = response.status;
    throw error;
  }
  return data;
}
async function loadUpdate() {
  const result = await tryApi("/appliance/update");
  applianceUpdate = result.ok ? result.data : { supported: false };
  clearTimeout(updateTimer);
  const busy = applianceUpdate.pending || ["downloading", "restarting"].includes(applianceUpdate.state);
  if (busy) updateTimer = setTimeout(() => loadUpdate().then(() => page === "settings" && rerenderQuiet()), 4000);
}
async function loadHost() {
  hostLoaded = true;
  const result = await tryApi("/host");
  host = result.ok ? result.data : null;
}
async function refresh(renderPage = true) {
  state = await api("/state");
  session.csrf = state.csrf;
  applySettings();
  if (renderPage) render();
}
function applySettings() {
  if (state?.settings) {
    localStorage.setItem("mq-language", state.settings.language);
    localStorage.setItem("mq-theme", state.settings.theme);
  }
  const theme =
    state?.settings.theme || localStorage.getItem("mq-theme") || "dark";
  const resolved =
    theme === "system"
      ? matchMedia("(prefers-color-scheme:dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.dataset.theme = resolved;
  applyScheme(document.documentElement, appearance.seed, resolved);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#171211",
    );
  document.documentElement.dataset.motion =
    state?.settings.motion === false ? "off" : "on";
  document.documentElement.lang =
    state?.settings.language === "yue" ? "zh-HK" : "en";
}
function field(name, title, value = "", type = "text", extra = "") {
  return `<div class="field"><label for="${name}">${title}</label><input id="${name}" name="${name}" type="${type}" value="${escape(value)}" ${extra}></div>`;
}
function select(name, title, options, value) {
  return `<div class="field"><label for="${name}">${title}</label><select id="${name}" name="${name}">${options.map(([v, l]) => `<option value="${escape(v)}" ${v === value ? "selected" : ""}>${escape(l)}</option>`).join("")}</select></div>`;
}
function button(action, text, cls = "", extra = "") {
  return `<button type="button" data-action="${action}" class="${cls}" ${extra}>${text}</button>`;
}
function pill(machine) {
  return `<span class="pill ${machine.state}">${escape(enumLabel(machine.state))}</span>`;
}
let lastPage = null;
const railItems = [
  ["overview", "dashboard", ["Overview", "總覽"]],
  ["machines", "dns", ["Machines", "機器"]],
  ["storage", "hard_drive", ["Storage", "儲存"]],
  ["history", "history", ["Activity", "活動"]],
  ["settings", "settings", ["Settings", "設定"]],
  ["docs", "menu_book", ["Help", "說明"]],
];
function pageHtml() {
  const v = views();
  if (page === "new") {
    if (!createCfg) initializeWizard();
    return v.create();
  }
  return (
    {
      overview: v.overview,
      machines: v.machines,
      storage: v.storage,
      settings: v.settings,
      history: v.history,
      docs: v.docs,
      console: v.consolePage,
    }[page] || v.overview
  )();
}
function railHtml() {
  const current = page === "new" ? "machines" : page === "console" ? "machines" : page;
  return `<nav class="rail" aria-label="${t("Main", "主要")}"><div class="rail-mark" aria-hidden="true">Q</div>${button("new", '<span class="icon" aria-hidden="true">add</span>', "fab", `aria-label="${escape(label("new"))}" title="${escape(label("new"))}"`)}<div class="rail-items">${railItems
    .map(
      ([id, icon, name]) =>
        `<button type="button" class="rail-item ${current === id ? "active" : ""}" data-action="page:${id}" ${current === id ? 'aria-current="page"' : ""}><span class="rail-pill"><span class="icon ${current === id ? "fill" : ""}" aria-hidden="true">${icon}</span></span>${t(...name)}</button>`,
    )
    .join("")}</div></nav>`;
}
function render() {
  const focus = rememberFocus();
  if (rfb) {
    try { rfb.disconnect(); } catch { /* already closed */ }
    rfb = null;
  }
  if (!session?.authenticated) {
    renderAuth();
    restoreFocus(focus);
    return;
  }
  if (!state.setup.complete && !onboardingMachine) {
    renderOnboarding();
    restoreFocus(focus);
    return;
  }
  if (page === "settings" && peopleList === null) loadPeople();
  if (["storage", "new", "overview"].includes(page) && poolsStale()) loadPools();
  if (page === "settings" && !applianceUpdate)
    loadUpdate().then(() => page === "settings" && session?.authenticated && rerenderQuiet());
  if (!hostLoaded)
    loadHost().then(() => {
      if (["new", "settings"].includes(page) && session?.authenticated) render();
    });
  const tabs = workspaceNavigation();
  const paint = () => {
    document.documentElement.toggleAttribute("data-silent", silentRender);
    $("#app").innerHTML =
      `<div class="shell">${railHtml()}<div class="content"><header class="appbar"><div class="brand"><span class="mark" aria-hidden="true"><span class="icon">memory</span></span>Material QEMU</div>${buildMetadata()}<label class="searchbar"><span class="icon" aria-hidden="true">search</span><input id="global-search" type="search" maxlength="${MAX_PATTERN}" spellcheck="false" aria-label="${searchOpts.regex ? t("Search machines with a regular expression", "用正規表達式搜尋機器") : t("Search machines", "搜尋機器")}" placeholder="${searchOpts.regex ? t("Regular expression, for example ^(debian|win)", "正規表達式，例如 ^(debian|win)") : t("Search machines, folders and notes", "搜尋機器、資料夾和備註")}" value="${escape(query)}"${searchOpts.regex ? ' class="mono"' : ""}${currentSearch().ok ? "" : " aria-invalid"}><kbd>Ctrl+Shift+F</kbd></label>${button("regex-toggle", '<span class="mono" aria-hidden="true">.*</span>', "regex-toggle", `aria-pressed="${searchOpts.regex}" aria-controls="regex-panel" aria-label="${escape(t("Regular expression search", "正規表達式搜尋"))}" title="${escape(t("Regular expression search", "正規表達式搜尋"))}"`)}<span class="spacer"></span><span class="pill healthy health">${t("Host connected", "主機已連線")}</span>${accountBadge({ t, escape }, session?.user)}${button("notifications", `<span class="icon" aria-hidden="true">notifications</span><span class="badge"${notificationLog.unread() ? "" : " hidden"}>${Math.min(notificationLog.unread(), 99)}</span>`, "icon-btn bell", `aria-expanded="false" aria-controls="notification-panel" aria-label="${escape(t("Notifications", "通知"))}" title="${escape(t("Notifications", "通知"))}"`)}${button("commands", `<span class="icon" aria-hidden="true">terminal</span>${t("Commands", "指令")}`, "ghost")}${button("logout", t("Sign out", "登出"), "ghost")}</header>${regexPanel()}${viewerNote({ t }, session?.user)}${tabs}<main class="main" id="main" tabindex="-1" role="tabpanel" aria-labelledby="workspace-tab-${encodeURIComponent(currentTabId())}">${pageHtml()}</main></div></div>`;
    if (page === "console") {
      updateConsoleControls();
      connectConsole();
      loadSnapshots(selected);
    }
    if (page === "storage") loadStorage();
    if (searchOpts.regex) refreshRegexOutput();
    drawSearchElsewhere();
    restoreFocus(focus);
    if (page === "new") requestPreview();
    const search = $("#global-search");
    search?.addEventListener("input", (e) => {
      query = e.target.value;
      updateRegexStatus();
      if (page !== "machines") {
        page = "machines";
        render();
        $("#global-search").focus();
      } else $("#machine-results").innerHTML = views().machineResults();
    });
  };
  const animate =
    !silentRender &&
    lastPage !== null &&
    lastPage !== page &&
    appearance.transitions &&
    state?.settings.motion !== false &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    typeof document.startViewTransition === "function";
  lastPage = page;
  if (animate) document.startViewTransition(paint);
  else paint();
}
function renderAuth() {
  const setup = session?.setupRequired;
  $("#app").innerHTML =
    `<div class="auth-split"><section class="auth-hero"><div class="mark" aria-hidden="true"><span class="icon">memory</span></div><span class="pill">${t("Your machines. Your control.", "你的機器，由你掌控。")}</span><h1>${t("A quieter home for your virtual machines.", "虛擬機器的安心基地。")}</h1><p>${t("One workspace for QEMU. Manage, monitor and connect, with everything running on your own host.", "一個 QEMU 工作區，管理、監察及連線，全部在你的主機上運行。")}</p><p class="muted-line" style="color:inherit;opacity:.85">${t("Private by default. No cloud account required.", "預設私人使用，毋須雲端帳戶。")}</p>${buildMetadata()}</section><main class="auth-panel"><div class="auth-controls">${select(
      "auth-language",
      t("Language", "語言"),
      [
        ["en", "English"],
        ["yue", "廣東話"],
        ["both", "English + 廣東話"],
      ],
      localStorage.getItem("mq-language") || "en",
    )}${select(
      "auth-theme",
      t("Theme", "主題"),
      [
        ["dark", t("Dark", "深色")],
        ["light", t("Light", "淺色")],
        ["system", t("Follow device", "跟隨裝置")],
      ],
      localStorage.getItem("mq-theme") || "dark",
    )}</div><section class="auth-form"><h2 style="font-size:28px">${setup ? t("Welcome to your new workspace", "歡迎使用新工作區") : t("Welcome back", "歡迎回來")}</h2><p class="muted">${setup ? t("Create the owner account to begin guided setup. The first account created becomes the owner.", "建立擁有人帳戶，開始設定。第一個建立的帳戶會成為擁有人。") : t("Unlock your local workspace.", "解鎖你的本機工作區。")}</p>${!setup ? button("passkey-login", `<span class="icon" aria-hidden="true">passkey</span>${t("Sign in with a passkey", "使用通行密鑰登入")}`, "primary", 'style="width:100%"') + `<div class="divider">${t("or", "或")}</div>` : ""}<form id="auth-form"><fieldset class="auth-fieldset" ${!setup && session.passwordEnabled === false ? "disabled" : ""}>${setup ? field("owner", t("Owner username", "擁有人使用者名稱"), "", "text", 'required autocomplete="name"') : ""}${!setup ? field("username", t("Username", "使用者名稱"), "", "text", 'required autocomplete="username" maxlength="80"') : ""}${field("password", t("Password", "密碼"), "", "password", `required minlength="12" maxlength="256" autocomplete="${setup ? "new-password" : "current-password"}"`)}<button class="${setup ? "primary" : ""}" type="submit" style="width:100%">${setup ? t("Create owner account", "建立擁有人帳戶") : t("Sign in with password", "使用密碼登入")}</button></fieldset></form>${!setup && session.passwordEnabled === false ? `<p class="help">${t("Password sign-in is disabled. Use a registered passkey. The saved password is retained for explicit re-enabling after passkey verification.", "密碼登入已停用，請使用已登記通行密鑰。密碼會保留，驗證通行密鑰後才可重新啟用。")}</p>` : ""}<p class="muted-line">${setup ? t("Passwords need at least 12 characters.", "密碼最少需要十二個字元。") : t("Passkeys require HTTPS or localhost. Password availability follows your account setting. After five unsuccessful attempts, wait fifteen minutes.", "通行密鑰需要 HTTPS 或 localhost。密碼是否可用會跟隨帳戶設定，五次不成功後請等十五分鐘。")}</p></section></main></div>`;
  $("#auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const values = new FormData(e.target);
    try {
      const result = await api(setup ? "/setup" : "/login", {
        name: values.get("owner"),
        password: values.get("password"),
        username: values.get("username"),
        preferences: {
          language: localStorage.getItem("mq-language") || "en",
          theme: localStorage.getItem("mq-theme") || "dark",
        },
      });
      session = { ...session, authenticated: true, csrf: result.csrf };
      await refresh();
    } catch (error) {
      notify(error.message);
    }
  };
}


const setupNames = [
  ["Owner", "擁有人"],
  ["Language", "語言"],
  ["Hardware", "硬件"],
  ["Storage", "儲存空間"],
  ["Network", "網絡"],
  ["ISO library", "ISO 媒體"],
  ["First machine", "第一部機器"],
  ["Ready", "準備完成"],
];
function steps(labels, current) {
  return `<div class="steps" aria-label="Progress">${labels.map((s, i) => `<div class="step ${current === i + 1 ? "active" : current > i + 1 ? "done" : ""}" ${current === i + 1 ? 'aria-current="step"' : ""}><b>${current > i + 1 ? "✓" : i + 1}</b>${t(...s)}</div>`).join("")}</div>`;
}
function renderOnboarding() {
  const n = state.setup.step;
  let content = "";
  if (n === 2)
    content =
      select(
        "setup-language",
        t("Workspace language", "工作區語言"),
        [
          ["en", "English"],
          ["yue", "廣東話"],
          ["both", "English + 廣東話"],
        ],
        state.settings.language,
      ) +
      select(
        "setup-theme",
        t("Appearance", "外觀"),
        [
          ["dark", t("Dark", "深色")],
          ["light", t("Light", "淺色")],
          ["system", t("Follow device", "跟隨裝置")],
        ],
        state.settings.theme,
      );
  if (n === 3)
    content = `<div class="grid">${Object.entries(state.capabilities)
      .map(
        ([arch, c]) =>
          `<div class="card"><h3>${arch}</h3><span class="pill ${c.available ? "healthy" : "error"}">${c.available ? t("Ready", "可用") : t("Unavailable", "未能使用")}</span><p class="muted" style="margin-top:15px">${escape(c.version || c.reason)}</p></div>`,
      )
      .join(
        "",
      )}</div><p class="help">${t("TCG software emulation works without passing host virtualization devices into the container. No host firmware or security settings are changed.", "TCG 使用模擬運行，不需將虛擬化裝置交給容器，也不會更改主機韌體或安全設定。")}</p>`;
  if (n === 4)
    content = `<h3>${t("Private managed storage", "私人管理儲存空間")}</h3><p>${t("Machine disks are created as sparse QCOW2 images in the persistent data volume. Existing host disks are never selected or erased.", "機器使用持久資料空間中的 QCOW2 磁碟，不會選取或清除現有主機磁碟。")}</p><dl><dt>${t("Disk format", "磁碟格式")}</dt><dd>QCOW2</dd><dt>${t("Storage scope", "儲存範圍")}</dt><dd>${t("Managed data volume only", "只限管理資料空間")}</dd></dl>`;
  if (n === 5)
    content = `<h3>${t("Private networking", "私人網絡")}</h3><p>${t("Machines use user-mode networking (NAT), restricted networking or no network. You can forward chosen host ports to a machine; bridges are not offered.", "機器使用使用者模式網絡（NAT）、受限制網絡或完全不連網。你可以把指定主機端口轉送到機器，不提供網絡橋接。")}</p><div class="help">${escape(location.origin)}<br>${t("This is your current connection, not a claim of LAN reachability. Use an HTTPS reverse proxy before remote access.", "這是目前連線地址，並不代表區域網絡已可連線。遠端存取前請設定 HTTPS 代理。")}</div>`;
  if (n === 6)
    content = `<h3>${t("Bring your installation media", "準備安裝媒體")}</h3><p>${t("Place your trusted ISO files in the data volume’s media directory. The host operator manages these files. A blank machine can be created without an ISO.", "將可信的 ISO 放進資料空間的 media 目錄，由主機管理者處理。也可先建立沒有 ISO 的空白機器。")}</p><div class="help">${state.media.length ? state.media.map(escape).join("<br>") : t("No ISO files found. You can add them later.", "尚未找到 ISO，可稍後新增。")}</div>${button("import-iso", t("Import ISO", "匯入 ISO"), "primary")}${button("refresh", t("Check again", "重新檢查"))}`;
  if (n === 7)
    content = `<h3>${t("Your first machine is next", "下一步，建立第一部機器")}</h3><p>${t("The machine wizard will help you choose a platform, CPU, memory, private disk, network and display. Create it here, or continue with an empty workspace.", "機器精靈會帶你選擇平台、處理器、記憶體、磁碟、網絡及顯示。可以在這裡建立，也可以先使用空白工作區。")}</p><p class="help">${t("Create a machine now, or skip this optional step. Startup happens only when you select it.", "可以現在建立機器，或跳過這個可選步驟，只有選取啟動才會開機。")}</p>${button("setup-create", t("Create first machine", "建立第一部機器"), "primary")}`;
  if (n === 8)
    content = `<div class="empty"><div class="empty-icon">✓</div><h2>${t("Your workspace is ready", "工作區已準備好")}</h2><p>${t("Your owner account and preferences are saved. You can register a passkey in Settings and create your first machine.", "帳戶和偏好已儲存，可在設定登記通行密鑰，再建立第一部機器。")}</p></div>`;
  $("#app").innerHTML =
    `<header class="appbar onboarding-bar"><div class="brand"><span class="mark" aria-hidden="true"><span class="icon">memory</span></span>Material QEMU</div>${buildMetadata()}<span class="spacer"></span><span class="pill">${t("Setup saved automatically", "設定進度自動儲存")}</span></header><main class="main wizard">${views().heading(t("Make yourself at home", "設定你的工作區"), t("A few practical steps, then you are in.", "幾個實用步驟，完成即可開始。"))}${steps(setupNames, n)}<section class="card wizard-content"><h2>${t(...setupNames[n - 1])}</h2>${content}</section><div class="wizard-footer"><div class="actions">${button("setup-save", t("Save and finish later", "儲存並稍後繼續"))}${[4, 5, 6, 7].includes(n) ? button("setup-skip", t("Skip this step", "跳過此步驟"), "ghost") : ""}</div>${n > 2 ? button("setup-back", t("Back", "上一步")) : "<span></span>"}${button(n === 8 ? "setup-finish" : "setup-next", n === 8 ? t("Open workspace", "開啟工作區") : t("Save & continue", "儲存並繼續"), "primary")}</div></main>`;
}
const machineWizard = () => views().create();

// A render can call this again while the viewer module is still loading; only
// the latest call may attach, so viewers never stack inside one console.
let consoleAttempt = 0;
// The recording and annotation tools read the viewer's canvas through one object
// per connection; a new connection gets a new object so a running recording stops.
let consoleConnection = null;
function consoleTools() {
  consoleTools.instance ||= createConsoleTools({
    getConnection: () => consoleConnection,
    getName: () => state?.machines.find((m) => m.id === selected)?.name,
    t,
    notify,
    modal,
    field,
    button,
    escape,
    changed: updateMediaControls,
    releaseInput: () => {},
  });
  return consoleTools.instance;
}
function updateMediaControls() {
  const s = consoleTools().status();
  const record = document.querySelector('[data-action="console-record"]');
  if (record) {
    record.innerHTML = `<span class="icon" aria-hidden="true">${s.recording ? "stop_circle" : "fiber_manual_record"}</span>${s.recording ? t("Stop recording", "停止錄影") : t("Record", "錄影")}`;
    record.setAttribute("aria-pressed", String(s.recording));
  }
  const download = document.querySelector('[data-action="console-record-download"]');
  if (download) download.hidden = !s.downloadAvailable;
  const annotate = document.querySelector('[data-action="console-annotate"]');
  if (annotate && consoleConnection) annotate.disabled = !s.canAnnotate;
  const line = document.querySelector("#console-media-status");
  if (line) line.textContent = s.text;
}
function dropConsoleConnection() {
  if (consoleConnection) consoleTools().beforeDisconnect();
  consoleConnection = null;
}
async function connectConsole() {
  if (!$("#vnc")) return;
  const attempt = ++consoleAttempt;
  try {
    const { default: RFB } = await import("/vendor/novnc/core/rfb.js");
    if (attempt !== consoleAttempt || !$("#vnc")) return;
    if (rfb) {
      try { rfb.disconnect(); } catch { /* already closed */ }
      rfb = null;
    }
    $("#vnc").replaceChildren();
    rfb = new RFB(
      $("#vnc"),
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/console/${selected}`,
      { shared: true },
    );
    rfb.scaleViewport = consoleScale;
    rfb.viewOnly = !consoleInput;
    rfb.resizeSession = false;
    rfb.addEventListener("connect", () => {
      $("#console-status").textContent = t(
        "Connected to the live QEMU display.",
        "已連接 QEMU 即時畫面。",
      );
    });
    const canvasReader = {
      getImageData() {
        const c = document.querySelector("#vnc canvas");
        if (!c) throw new Error(t("The console display is not available.", "主控台畫面不可用。"));
        return c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
      },
    };
    rfb.addEventListener("connect", () => {
      consoleConnection = canvasReader;
      updateMediaControls();
    });
    rfb.addEventListener("disconnect", () => {
      if (consoleConnection === canvasReader) dropConsoleConnection();
      updateMediaControls();
      if ($("#console-status"))
        $("#console-status").textContent = t(
          "Console disconnected. Reconnect or check the machine state.",
          "主控台已中斷，請重新連線或檢查機器狀態。",
        );
    });
  } catch (e) {
    notify(e.message);
  }
}
function initializeWizard(machine) {
  editing = Boolean(machine);
  const draft = loadDraft(localStorage, machine?.id);
  const arch =
    machine?.arch ||
    Object.keys(state.capabilities).find((key) => state.capabilities[key].available) ||
    "x86_64";
  let cfg = machine
    ? normalizeMachine(machine)
    : defaultConfig(arch, state.capabilities[arch]?.machine || "");
  if (draft?.data?.configJson) {
    try {
      cfg = { ...cfg, ...normalizeMachine({ ...cfg, ...JSON.parse(draft.data.configJson) }) };
    } catch {
      /* a damaged draft is ignored */
    }
  }
  createCfg = cfg;
  createSection = "system";
}
function startWizard(machine) {
  initializeWizard(machine);
  loadFirmware();
  page = "new";
  render();
}
function persistDraft() {
  if (!createCfg) return;
  try {
    saveDraft(localStorage, { configJson: JSON.stringify(createCfg) }, 1, editing ? createCfg.id : undefined);
  } catch {
    notify(t("Draft could not be saved in this browser.", "此瀏覽器未能儲存草稿。"));
  }
}
function saveWizard() {
  const problems = validateConfig(createCfg);
  if (problems.includes("name")) {
    section_focus("name");
    notify(t("Give the machine a name first.", "請先為機器命名。"));
    return false;
  }
  if (problems.includes("forward")) {
    createSection = "network";
    render();
    notify(t("Two port forwards use the same host port.", "兩個端口轉送使用相同的主機端口。"));
    return false;
  }
  persistDraft();
  return true;
}
function section_focus(name) {
  document.getElementById(`f-${name}`)?.focus();
}
function machinePayload() {
  return host ? toV2Payload(createCfg) : toLegacyPayload(createCfg);
}

function modal(title, content, confirm, callback) {
  const d = $("#dialog");
  if (!d.open) {
    dialogOpener = document.activeElement;
    dialogOpenerAction = dialogOpener?.closest("[data-action]")?.dataset.action;
  }
  const opener = dialogOpener,
    openerAction = dialogOpenerAction;
  d.innerHTML = `<h2 id="dialog-title">${title}</h2><form id="dialog-form">${content}<div class="actions">${button("dialog-close", t("Cancel", "取消"), "ghost")}<button class="primary" type="submit">${confirm}</button></div></form>`;
  d.setAttribute("aria-labelledby", "dialog-title");
  d.onclose = () => {
    const target = opener?.isConnected
      ? opener
      : openerAction
        ? document.querySelector(`[data-action="${CSS.escape(openerAction)}"]`)
        : null;
    (target || $("#main"))?.focus();
  };
  d.showModal();
  $("#dialog-form").onsubmit = async (e) => {
    e.preventDefault();
    const submit = e.target.querySelector("[type=submit]");
    submit.disabled = true;
    try {
      const close = await callback(new FormData(e.target));
      if (close !== false) d.close();
    } catch (error) {
      notify(error.message);
    } finally {
      submit.disabled = false;
    }
  };
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const action = b.dataset.action;
  try {
    if (await handleExtra(action, b)) return;
    if (action === "dialog-close") return $("#dialog").close();
    if (action === "import-iso") {
      if ($("#machine-form") && !saveWizard()) return;
      return modal(
        t("Import installation ISO", "匯入安裝 ISO"),
        `${field("isoFile", t("Choose a trusted ISO", "選擇可信 ISO"), "", "file", 'required accept=".iso"')}${field("isoName", t("Stored filename", "儲存檔名"), "", "text", 'required maxlength="155"')}<p class="muted">${t("Maximum 2 GiB and 15 minutes per upload, with two concurrent uploads. Existing filenames are never overwritten. Uploading checks transfer integrity, not whether an image is safe or bootable.", "每次上限 2 GiB 和 15 分鐘，最多同時兩個上傳，不會覆寫現有檔名。上傳只檢查傳輸完整性，不代表映像安全或可以啟動。")}</p><progress id="upload-progress" max="100" value="0" style="width:100%"></progress><p id="upload-status" role="status"></p>`,
        t("Upload ISO", "上傳 ISO"),
        async (f) => {
          const file = f.get("isoFile");
          if (!file?.size || file.size > state.mediaMaxBytes)
            throw new Error(
              t(
                "Choose an ISO between 1 byte and 2 GiB.",
                "請選擇介乎 1 byte 和 2 GiB 的 ISO。",
              ),
            );
          const transfer = uploadIso(
            file,
            f.get("isoName"),
            session.csrf,
            (loaded, total) => {
              const percent = Math.round((100 * loaded) / total);
              if ($("#upload-progress")) $("#upload-progress").value = percent;
              if ($("#upload-status"))
                $("#upload-status").textContent = t(
                  `${percent}% transferred; verifying after upload.`,
                  `${percent}% 已傳送，上傳後會核對。`,
                );
            },
          );
          const dialog = $("#dialog"),
            abort = () => transfer.abort();
          dialog.addEventListener("close", abort, { once: true });
          try {
            const result = await transfer.promise;
            await refresh();
            notify(
              t(
                `Imported ${result.name} (${result.bytes} bytes).`,
                `已匯入 ${result.name}（${result.bytes} bytes）。`,
              ) +
                (result.auditRecorded === false
                  ? " " +
                    t(
                      "The file is saved, but activity history could not be recorded.",
                      "檔案已儲存，但未能記錄活動歷史。",
                    )
                  : ""),
            );
          } finally {
            dialog.removeEventListener("close", abort);
          }
        },
      );
    }
    if (action.startsWith("page:")) {
      if (onboardingMachine && action !== "page:new") {
        persistDraft();
        onboardingMachine = false;
        render();
        return;
      }
      if (page === "new" && $("#machine-form")) persistDraft();
      page = action.slice(5);
      if (page === "new") return startWizard();
      render();
      return;
    }
    if (action === "new") return startWizard();
    if (action === "refresh") return refresh();
    if (action === "commands" || action === "new-tab") {
      showCatalog(action === "commands" ? "commands" : "tabs");
      return;
    }
    if (action === "open-all-tabs") {
      workspace = openAllTabs(
        workspace,
        workspaceModels().map((model) => model.id),
      );
      saveWorkspace();
      render();
      return;
    }
    if (action.startsWith("pin-tab:")) {
      workspace = pinTab(workspace, decodeURIComponent(action.slice(8)));
      saveWorkspace();
      render();
      return;
    }
    if (action.startsWith("close-tab:")) {
      const id = decodeURIComponent(action.slice(10));
      const outcome = closeTab(workspace, id);
      if (outcome.error) {
        notify(
          outcome.error === "pinned"
            ? t(
                "Unpin this tab before closing it.",
                "請先取消固定，才關閉分頁。",
              )
            : t(
                "Keep at least one workspace tab open.",
                "至少保留一個工作區分頁。",
              ),
        );
        return;
      }
      workspace = outcome.state;
      saveWorkspace();
      if (currentTabId() === id) navigateWorkspace(workspace.open[0]);
      else render();
      return;
    }
    if (action.startsWith("command-run:")) {
      const command = catalogEntries.find(
        (entry) => entry.id === decodeURIComponent(action.slice(12)),
      );
      if (!command) return;
      $("#dialog").close();
      if (command.unavailable) {
        notify(command.unavailable);
        return;
      }
      if (command.select) selected = command.select;
      navigateWorkspace(command.route);
      if (command.focus) {
        document.getElementById(command.focus)?.focus();
        return;
      }
      if (command.action) {
        const target = document.querySelector(
          `[data-action="${CSS.escape(command.action)}"]`,
        );
        if (target) target.click();
        else
          notify(
            t(
              "This control is not available in the current state.",
              "目前狀態未能使用此控制。",
            ),
          );
      }
      return;
    }
    if (action === "logout") {
      if (consoleTools().hasUnsaved() && !confirm(t("A recording or annotation has not been downloaded. Sign out and discard it?", "有錄影或標註尚未下載，要登出並捨棄嗎？"))) return;
      consoleTools().discard();
      onboardingMachine = false;
      peopleList = null;
      await api("/logout", {});
      session = await api("/session");
      state = null;
      render();
      return;
    }
    if (action === "passkey-login") {
      const result = await api("/passkey/login-options", {});
      const response = await startAuthentication({
        optionsJSON: result.options,
      });
      const login = await api("/passkey/login", { id: result.id, response });
      session = { authenticated: true, csrf: login.csrf };
      return refresh();
    }
    if (action === "password-mode") {
      const enabled = state.owner.passwordEnabled === false;
      return modal(
        enabled
          ? t("Enable password sign-in", "啟用密碼登入")
          : t("Disable password sign-in", "停用密碼登入"),
        `<p>${enabled ? t("A fresh passkey verification is required before enabling the saved owner password.", "重新驗證通行密鑰後，才可啟用已儲存擁有人密碼。") : t("After this change, new sign-ins require a registered passkey. The saved password and existing sessions are preserved. No password-only recovery route is provided.", "更改後，新登入需要已登記通行密鑰，已儲存密碼及現有工作階段會保留，不提供只靠密碼的復原途徑。")}</p>`,
        t("Verify passkey and change", "驗證通行密鑰並更改"),
        async () => {
          const challenge = await api("/passkey/login-options", {});
          const response = await startAuthentication({
            optionsJSON: challenge.options,
          });
          const verified = await api("/passkey/login", {
            id: challenge.id,
            response,
          });
          session.csrf = verified.csrf;
          await api("/security", { passwordEnabled: enabled });
          await refresh();
          notify(
            t(
              "Sign-in setting saved after passkey verification.",
              "已在通行密鑰驗證後儲存登入設定。",
            ),
          );
        },
      );
    }
    if (action === "register-passkey") {
      const { options } = await api("/passkey/register-options", {});
      const response = await startRegistration({ optionsJSON: options });
      await api("/passkey/register", { response });
      await refresh();
      notify(t("Passkey added.", "通行密鑰已新增。"));
      return;
    }
    if (action === "setup-create") {
      onboardingMachine = true;
      return startWizard();
    }
    if (action === "setup-save") {
      const step = state.setup.step;
      if (step === 2)
        await api("/preferences", {
          settings: {
            language: $("#setup-language").value,
            theme: $("#setup-theme").value,
          },
        });
      await api("/preferences", { setup: { step, complete: false } });
      await api("/logout", {});
      session = await api("/session");
      state = null;
      render();
      return;
    }
    if (action.startsWith("setup-")) {
      let step = state.setup.step;
      if (step === 2) {
        await api("/preferences", {
          settings: {
            language: $("#setup-language").value,
            theme: $("#setup-theme").value,
          },
        });
      }
      await api("/preferences", {
        setup: {
          step:
            action === "setup-back"
              ? step - 1
              : action === "setup-finish"
                ? 8
                : step + 1,
          complete: action === "setup-finish",
          skipStep: action === "setup-skip" ? step : undefined,
        },
      });
      if (action === "setup-finish") page = "overview";
      return refresh();
    }
    if (action.startsWith("overview-state:")) {
      await api("/preferences", {
        settings: { overviewState: action.slice(15) },
      });
      return refresh();
    }
    if (action.startsWith("overview-arch:")) {
      await api("/preferences", {
        settings: { overviewArch: action.slice(14) },
      });
      return refresh();
    }
    if (action === "overview-reset") {
      await api("/preferences", {
        settings: { overviewState: "all", overviewArch: "all" },
      });
      return refresh();
    }
    if (action.startsWith("filter:")) {
      filter = action.slice(7);
      render();
      return;
    }
    if (action.startsWith("folder-filter:")) {
      folder = action.slice(14);
      render();
      return;
    }
    if (action.startsWith("layout:")) {
      await api("/preferences", { settings: { layout: action.slice(7) } });
      return refresh();
    }
    if (action.startsWith("view:")) {
      const view = state.views.find((v) => v.id === action.slice(5));
      query = view.query;
      filter = view.state;
      folder = view.folder || "";
      render();
      return;
    }
    if (action === "save-view")
      return modal(
        t("Save this view", "儲存此檢視"),
        field(
          "viewName",
          t("View name", "檢視名稱"),
          "",
          "text",
          'required maxlength="80"',
        ),
        t("Save", "儲存"),
        async (f) => {
          await api("/preferences", {
            view: { name: f.get("viewName"), query, state: filter, folder },
          });
          await refresh();
        },
      );
    if (action.startsWith("delete-view:")) {
      const view = state.views.find((v) => v.id === action.slice(12));
      return modal(
        t("Delete saved view", "刪除已儲存檢視"),
        `<p>${t("Delete", "刪除")} <strong>${escape(view.name)}</strong>?</p><p class="muted">${t("Only the saved filter is removed. Machines and folders stay unchanged.", "只會刪除已儲存篩選，機器和資料夾不會改變。")}</p>`,
        t("Delete view", "刪除檢視"),
        async () => {
          await api("/preferences", { deleteView: view.id });
          await refresh();
        },
      );
    }
    if (action === "manage-folders")
      return modal(
        t("Manage folders", "管理資料夾"),
        `<div class="organization-list">${state.folders.map((name) => `<section><strong>${escape(name)}</strong><span class="muted">${state.machines.filter((m) => m.folder === name).length} ${t("assigned", "已分類")}</span><div class="actions">${button(`rename-folder:${escape(name)}`, t("Rename", "重新命名"))}${button(`delete-folder:${escape(name)}`, t("Remove", "移除"), "danger")}</div></section>`).join("") || `<p>${t("No folders yet. Create one from the machine toolbar.", "尚無資料夾，請從機器工具列建立。")}</p>`}</div>`,
        t("Close", "關閉"),
        async () => {},
      );
    if (action.startsWith("rename-folder:")) {
      const from = action.slice(14);
      return modal(
        t("Rename folder", "重新命名資料夾"),
        field(
          "folderName",
          t("New name", "新名稱"),
          from,
          "text",
          'required maxlength="80"',
        ) +
          `<p class="muted">${t("Machine assignments and saved folder filters follow the new name.", "機器分類和已儲存篩選會跟隨新名稱。")}</p>`,
        t("Rename", "重新命名"),
        async (f) => {
          const to = f.get("folderName").trim();
          await api("/preferences", { renameFolder: { from, to } });
          if (folder === from) folder = to;
          await refresh();
        },
      );
    }
    if (action.startsWith("delete-folder:")) {
      const name = action.slice(14),
        count = state.machines.filter((m) => m.folder === name).length;
      return modal(
        t("Remove folder", "移除資料夾"),
        `<p><strong>${escape(name)}</strong></p><p>${t(`${count} assigned ${count === 1 ? "machine moves" : "machines move"} to Unfiled. No machine or disk will be deleted. Saved views using this folder will include all folders.`, `${count} 部已分類機器會移至未分類，不會刪除任何機器或磁碟。使用此資料夾的已儲存檢視將包含所有資料夾。`)}</p>${field("confirmName", t("Type the exact folder name", "輸入完整資料夾名稱"), "", "text", 'required maxlength="80"')}<label class="check"><input name="unfiled" type="checkbox" required>${t("Keep all machines in Unfiled", "將所有機器保留在未分類")}</label>`,
        t("Remove folder", "移除資料夾"),
        async (f) => {
          await api("/preferences", {
            deleteFolder: {
              name,
              mode: f.get("unfiled") ? "unfiled" : "",
              confirmName: f.get("confirmName"),
            },
          });
          if (folder === name) folder = "";
          await refresh();
        },
      );
    }
    if (action === "folder")
      return modal(
        t("New folder", "新增資料夾"),
        field(
          "folderName",
          t("Folder name", "資料夾名稱"),
          "",
          "text",
          'required maxlength="80"',
        ),
        t("Create", "建立"),
        async (f) => {
          await api("/preferences", { folder: f.get("folderName") });
          await refresh();
        },
      );
    if (action === "columns")
      return modal(
        t("Visible columns", "顯示欄位"),
        ["platform", "memory", "cpu"]
          .map(
            (c) =>
              `<label class="check"><input type="checkbox" name="columns" value="${c}" ${state.settings.columns.includes(c) ? "checked" : ""}>${enumLabel(c)}</label>`,
          )
          .join(""),
        t("Apply", "套用"),
        async (f) => {
          await api("/preferences", {
            settings: { columns: f.getAll("columns") },
          });
          await refresh();
        },
      );
    if (action === "select-all") {
      views()
        .filtered()
        .forEach((m) => checked.add(m.id));
      render();
      return;
    }
    if (action.startsWith("details:")) {
      selected = action.slice(8);
      page = "machines";
      render();
      return;
    }
    if (action.startsWith("console:")) {
      if (page === "new" && $("#machine-form")) persistDraft();
      selected = action.slice(8);
      page = "console";
      render();
      return;
    }
    if (action === "clear-selected") {
      checked.clear();
      render();
      return;
    }
    if (action.startsWith("toggle-folder:")) {
      const name = decodeURIComponent(action.slice(14)),
        collapsed = new Set(state.settings.collapsedFolders || []);
      collapsed.has(name) ? collapsed.delete(name) : collapsed.add(name);
      await api("/preferences", {
        settings: { collapsedFolders: [...collapsed] },
      });
      return refresh();
    }
    if (action.startsWith("tags:")) {
      const machine = state.machines.find(
        (value) => value.id === action.slice(5),
      );
      return modal(
        t("Edit machine tags", "編輯機器標籤"),
        field(
          "tags",
          t("Tags separated by commas", "以逗號分隔標籤"),
          (machine.tags || []).join(", "),
          "text",
          'maxlength="2048"',
        ) +
          `<p class="muted">${t("Up to 16 tags, each at most 32 characters. Tags can change while the machine runs.", "最多十六個標籤，每個最多三十二字元，機器運行時亦可更改。")}</p>`,
        t("Save tags", "儲存標籤"),
        async (f) => {
          await api(`/machines/${machine.id}`, { tags: f.get("tags") });
          await refresh();
        },
      );
    }
    if (action === "removed-machines")
      return modal(
        t("Retained machine definitions", "保留的機器設定"),
        `<p>${t("Disks remain in managed storage. Restoring returns a stopped machine to the workspace.", "磁碟保留在管理儲存空間，還原會將已停止機器放回工作區。")}</p><div class="organization-list">${(state.removedMachines || []).map((machine) => `<section><strong>${escape(machine.name)}</strong><small>${escape(machine.arch)} · ${machine.diskGiB} GiB</small>${button(`restore:${machine.id}`, t("Restore", "還原"))}</section>`).join("") || `<p>${t("No retained definitions.", "沒有保留設定。")}</p>`}</div>`,
        t("Close", "關閉"),
        async () => {},
      );
    if (action.startsWith("restore:")) {
      await api(`/removed-machines/${action.slice(8)}/restore`, {});
      await refresh();
      $("#dialog").close();
      notify(
        t(
          "Machine restored with its retained disk.",
          "機器已連同保留磁碟還原。",
        ),
      );
      return;
    }
    if (action === "bulk-snapshot") {
      const ids = [...checked];
      const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
      return modal(
        t("Snapshot selected machines", "為已選機器建立快照"),
        field("bulkSnapName", t("Snapshot name", "快照名稱"), `snap-${stamp}`, "text", 'required maxlength="64" pattern="[A-Za-z0-9][A-Za-z0-9._-]*"') +
          `<p class="muted">${t(`${ids.length} machines. Running machines are snapshotted live; stopped machines snapshot every qcow2 disk.`, `共 ${ids.length} 部機器。運行中的機器會即時建立快照；已停止的機器會為每個 qcow2 磁碟建立快照。`)}</p>`,
        t("Take snapshots", "建立快照"),
        async (f) => {
          const name = String(f.get("bulkSnapName") || "").trim();
          const outcomes = [];
          let saved = 0;
          for (const id of ids) {
            const machine = state.machines.find((m) => m.id === id)?.name || id;
            const result = await tryApi(`/machines/${id}/snapshots`, { name });
            if (result.ok) saved++;
            outcomes.push(`${machine}: ${result.ok ? t("snapshot saved", "已建立快照") : result.unavailable ? unavailableMessage() : result.error.message}`);
            delete snapshotStore[id];
          }
          await refresh();
          notify(t(`Snapshot ${name}: ${saved} of ${ids.length} saved.`, `快照 ${name}：${ids.length} 部中已建立 ${saved} 部。`));
          modal(t("Snapshot results", "快照結果"), `<ul>${outcomes.map((value) => `<li>${escape(value)}</li>`).join("")}</ul>`, t("Close", "關閉"), async () => {});
          return false;
        },
      );
    }
    if (action.startsWith("move:") || action === "bulk-move") {
      const ids = action === "bulk-move" ? [...checked] : [action.slice(5)];
      return modal(
        t("Move machines to folder", "將機器移至資料夾"),
        select(
          "destination",
          t("Destination folder", "目的資料夾"),
          [
            ["", t("Unfiled", "未分類")],
            ...state.folders.map((name) => [name, name]),
          ],
          "",
        ) +
          `<p class="muted">${t("Only organization changes. Machine state and disks are preserved.", "只更改分類，機器狀態及磁碟會保留。")}</p>`,
        t("Move", "移動"),
        async (f) => {
          const outcomes = [];
          for (const id of ids) {
            const name = state.machines.find((m) => m.id === id)?.name || id;
            try {
              await api(`/machines/${id}`, { folder: f.get("destination") });
              outcomes.push(`${name}: ${t("moved", "已移動")}`);
            } catch (error) {
              outcomes.push(`${name}: ${error.message}`);
            }
          }
          await refresh();
          modal(
            t("Move results", "移動結果"),
            `<ul>${outcomes.map((value) => `<li>${escape(value)}</li>`).join("")}</ul>`,
            t("Close", "關閉"),
            async () => {},
          );
          return false;
        },
      );
    }
    if (action.startsWith("edit:"))
      return startWizard(state.machines.find((m) => m.id === action.slice(5)));
    if (action.startsWith("favourite:")) {
      const m = state.machines.find((m) => m.id === action.slice(10));
      await api(`/machines/${m.id}`, { favourite: !m.favourite });
      return refresh();
    }
    if (action.startsWith("lifecycle:")) {
      const [, id, verb] = action.split(":");
      b.disabled = true;
      await api(`/machines/${id}/action`, { action: verb });
      await refresh();
      notify(
        t(
          "Action requested. The displayed state reflects the host.",
          "操作已請求，顯示狀態由主機回報。",
        ),
      );
      return;
    }
    if (action.startsWith("bulk:")) {
      const verb = action.slice(5),
        outcomes = [];
      for (const id of checked) {
        try {
          await api(`/machines/${id}/action`, { action: verb });
          outcomes.push(
            `${state.machines.find((m) => m.id === id)?.name}: ${t("requested", "已請求")}`,
          );
        } catch (err) {
          outcomes.push(
            `${state.machines.find((m) => m.id === id)?.name}: ${err.message}`,
          );
        }
      }
      await refresh();
      return modal(
        t("Bulk action results", "批次操作結果"),
        `<ul>${outcomes.map((v) => `<li>${escape(v)}</li>`).join("")}</ul>`,
        t("Close", "關閉"),
        async () => {},
      );
    }
    if (action === "save-settings") {
      await api("/preferences", {
        settings: {
          theme: $("#theme").value,
          language: $("#language").value,
          motion: $("#motion").checked,
        },
      });
      localStorage.setItem("mq-theme", $("#theme").value);
      localStorage.setItem("mq-language", $("#language").value);
      await refresh();
      notify(t("Preferences saved.", "偏好已儲存。"));
      return;
    }
    if (action === "console-release") {
      consoleInput = !consoleInput;
      localStorage.setItem("mq-console-input", String(consoleInput));
      if (rfb) rfb.viewOnly = !consoleInput;
      updateConsoleControls();
      return;
    }
    if (action === "console-scale") {
      consoleScale = !consoleScale;
      localStorage.setItem("mq-console-scale", String(consoleScale));
      if (rfb) rfb.scaleViewport = consoleScale;
      updateConsoleControls();
      return;
    }
    if (action === "console-fullscreen")
      return $("#console-screen").requestFullscreen();
    if (action === "console-keys")
      return modal(
        t("Send keys", "傳送按鍵"),
        select(
          "sequence",
          t("Key sequence", "按鍵組合"),
          [
            ["ctrlaltdel", "Ctrl + Alt + Del"],
            ["ctrlaltf1", "Ctrl + Alt + F1"],
            ["ctrlaltf2", "Ctrl + Alt + F2"],
            ["escape", "Escape"],
            ["enter", "Enter"],
            ["print", "Print Screen"],
            ["meta", t("System key", "系統鍵")],
          ],
          "ctrlaltdel",
        ),
        t("Send", "傳送"),
        async (f) => {
          await api(`/machines/${selected}/keys`, { keys: f.get("sequence") });
        },
      );
    if (action === "console-reset")
      return modal(
        t("Reset this machine?", "重設這部機器？"),
        `<p>${t("Reset restarts the guest immediately. Unsaved guest work may be lost.", "重設會立即重新啟動客體，未儲存的工作可能遺失。")}</p>`,
        t("Reset machine", "重設機器"),
        async () => {
          await api(`/machines/${selected}/action`, { action: "reset" });
          await refresh();
        },
      );
    if (action === "console-text" || action === "console-clipboard") {
      if (!rfb || !consoleInput)
        throw new Error(
          t(
            "Connect the console and enable guest input first.",
            "請先連接主控台並啟用客體輸入。",
          ),
        );
      const clipboard = action === "console-clipboard";
      return modal(
        clipboard
          ? t("Send clipboard text", "傳送剪貼簿文字")
          : t("Type text into guest", "在客體輸入文字"),
        `<div class="field"><label for="guest-text">${t("Text, up to 256 characters", "文字，最多 256 字元")}</label><textarea id="guest-text" name="text" maxlength="256" required></textarea></div><p class="muted">${clipboard ? t("Guest clipboard integration is required. Sending does not prove the guest accepted the update.", "需要客體剪貼簿整合，傳送不代表客體已接受。") : t("Text is sent to the currently focused guest control. Keyboard layout and guest support affect the result.", "文字會傳送到客體目前選取的控制，結果取決於鍵盤配置及客體支援。")}</p>`,
        t("Send text", "傳送文字"),
        async (f) => {
          if (!rfb || !consoleInput)
            throw new Error(
              t("Console input is unavailable.", "主控台輸入未能使用。"),
            );
          const value = f.get("text");
          if (clipboard) rfb.clipboardPasteFrom(value);
          else
            for (const char of value) {
              const cp = char.codePointAt(0);
              const keysym =
                cp === 10
                  ? 0xff0d
                  : cp === 9
                    ? 0xff09
                    : cp <= 255
                      ? cp
                      : 0x01000000 | cp;
              rfb.sendKey(keysym);
            }
          notify(
            t(
              "Text sent to the console; guest acceptance is not verified.",
              "文字已傳送至主控台，客體是否接受仍未驗證。",
            ),
          );
        },
      );
    }
    if (action === "console-reconnect") {
      if (rfb) { try { rfb.disconnect(); } catch { /* already closed */ } }
      return connectConsole();
    }
  } catch (error) {
    notify(error.message);
  } finally {
    if (b.isConnected) b.disabled = false;
  }
});
document.addEventListener("change", (e) => {
  if (e.target.matches("[data-check]")) {
    const focus = rememberFocus();
    e.target.checked
      ? checked.add(e.target.dataset.check)
      : checked.delete(e.target.dataset.check);
    $("#machine-results").innerHTML = views().machineResults();
    restoreFocus(focus);
  }
});
// Ctrl+Alt on its own hands the keyboard and mouse back from the guest, like a
// hypervisor's host key. Listening in the capture phase sees the keys before the
// console viewer forwards them.
const releaseChord = createReleaseChord(() => {
  if (page !== "console" || !consoleInput || !rfb) return;
  consoleInput = false;
  localStorage.setItem("mq-console-input", "false");
  rfb.viewOnly = true;
  rfb.blur?.();
  document.activeElement?.blur?.();
  updateConsoleControls();
  notify(t("Keyboard and mouse released from the guest. Choose Guest input to capture them again.", "已從客體釋放鍵盤和滑鼠，按「客體輸入」可再次控制。"));
});
let regexInputTimer = null;
document.addEventListener("input", (e) => {
  if (e.target.id === "regex-step-range") { regexDebugStep = Number(e.target.value) - 1; drawDebug(); document.querySelector("#regex-step-range")?.focus(); return; }
  if (e.target.id === "regex-file-replacement") { regexFileReplacement = e.target.value; clearTimeout(regexInputTimer); regexInputTimer = setTimeout(refreshRegexOutput, 250); return; }
  if (e.target.id === "regex-sample") regexSample = e.target.value;
  else if (e.target.id === "regex-replacement") regexReplacement = e.target.value;
  else return;
  clearTimeout(regexInputTimer);
  regexInputTimer = setTimeout(refreshRegexOutput, 250);
});
document.addEventListener("change", async (e) => {
  if (e.target.id === "regex-file-replace") {
    regexFileReplace = e.target.checked;
    updateRegexTools();
    document.querySelector("#regex-file-replace")?.focus();
    return;
  }
  if (e.target.id === "regex-files") {
    const picked = [...e.target.files].slice(0, REGEX_FILE_LIMIT);
    const skipped = [...e.target.files].length - picked.length + picked.filter((x) => x.size > REGEX_FILE_BYTES).length;
    regexFiles = await Promise.all(picked.filter((x) => x.size <= REGEX_FILE_BYTES).map(async (x) => ({ name: x.name, text: await x.text(), modified: x.lastModified })));
    if (skipped) notify(t(`${skipped} files were skipped: at most ${REGEX_FILE_LIMIT} files of 2 MiB each.`, `已略過 ${skipped} 個檔案：最多 ${REGEX_FILE_LIMIT} 個，每個 2 MiB。`));
    updateRegexTools();
    return;
  }
  consoleTools().change(e);
  const flag = e.target.dataset?.searchFlag, field = e.target.dataset?.searchField;
  if (!flag && !field) return;
  if (flag) searchOpts.flags[flag] = e.target.checked;
  if (field) {
    const set = new Set(searchOpts.fields);
    e.target.checked ? set.add(field) : set.delete(field);
    searchOpts.fields = SEARCH_FIELDS.filter((f) => set.has(f));
  }
  saveSearchOpts();
  updateRegexStatus();
  if (page === "machines" && $("#machine-results")) $("#machine-results").innerHTML = views().machineResults();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !notificationPanel().hidden) { e.preventDefault(); toggleNotifications(false); }
});
document.addEventListener("click", (e) => {
  const panel = document.querySelector("#notification-panel");
  if (panel && !panel.hidden && !panel.contains(e.target) && !e.target.closest('[data-action="notifications"]')) toggleNotifications(false);
});
// Drag a machine card onto a folder group or folder chip to move it there.
// The same request as Move to folder: only the organization changes.
let draggedMachine = null;
const dropFolderOf = (el) => {
  const group = el.closest?.("[data-drop-folder]");
  if (group) return group.dataset.dropFolder;
  const chip = el.closest?.('[data-action^="folder-filter:"]');
  return chip ? chip.dataset.action.slice("folder-filter:".length) : null;
};
document.addEventListener("dragstart", (e) => {
  const card = e.target.closest?.("[data-drag-machine]");
  if (!card) return;
  draggedMachine = card.dataset.dragMachine;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", draggedMachine);
  card.classList.add("dragging");
});
document.addEventListener("dragend", (e) => {
  e.target.closest?.("[data-drag-machine]")?.classList.remove("dragging");
  document.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
  draggedMachine = null;
});
document.addEventListener("dragover", (e) => {
  if (!draggedMachine || dropFolderOf(e.target) === null) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const zone = e.target.closest("[data-drop-folder]") || e.target.closest('[data-action^="folder-filter:"]');
  document.querySelectorAll(".drop-target").forEach((el) => el !== zone && el.classList.remove("drop-target"));
  zone?.classList.add("drop-target");
});
document.addEventListener("drop", async (e) => {
  const folderName = dropFolderOf(e.target);
  const id = draggedMachine || e.dataTransfer.getData("text/plain");
  if (folderName === null || !id) return;
  e.preventDefault();
  document.querySelectorAll(".drop-target").forEach((el) => el.classList.remove("drop-target"));
  const machine = state.machines.find((m) => m.id === id);
  if (!machine || (machine.folder || "") === folderName) return;
  try {
    await api(`/machines/${id}`, { folder: folderName });
    await refresh();
    notify(t(`${machine.name} moved to ${folderName || "Unfiled"}.`, `${machine.name} 已移至${folderName || "未分類"}。`));
  } catch (error) {
    notify(localizeServerError(error.message, t));
  }
});
window.addEventListener("beforeunload", (e) => {
  if (consoleTools.instance?.hasUnsaved()) e.preventDefault();
});
document.addEventListener("keydown", (e) => releaseChord.keydown(e), true);
document.addEventListener("keyup", (e) => releaseChord.keyup(e), true);
window.addEventListener("blur", () => releaseChord.reset());
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
    e.preventDefault();
    showCatalog("commands");
  }
});
async function boot() {
  try {
    session = await api("/session");
    applySettings();
    if (session.authenticated) await refresh();
    else render();
  } catch (error) {
    $("#app").innerHTML =
      `<main class="auth"><section class="card"><h1>Connection unavailable</h1><p>${escape(error.message)}</p><p>Check that this address matches the host’s PUBLIC_ORIGIN setting.</p></section></main>`;
  }
}
await boot();
setInterval(async () => {
  if (!session?.authenticated || document.hidden) return;
  try {
    const oldConsoleState = state?.machines.find((m) => m.id === selected)?.state;
    await refresh(false);
    for (const [id, at] of thumbs.failed) if (Date.now() - at > 60000) thumbs.failed.delete(id);
    if (page === "console" && oldConsoleState !== state.machines.find((m) => m.id === selected)?.state) rerenderQuiet();
    else if (
      ["overview", "machines", "history"].includes(page) &&
      !$("#dialog").open &&
      !document.activeElement?.matches("input,select,textarea")
    )
      rerenderQuiet();
  } catch (error) {
    if (error.message === "Sign in to continue.") {
      session = await api("/session");
      render();
    }
  }
}, 5000);

function currentSearch() {
  return compileSearch(query, searchOpts);
}
function saveSearchOpts() {
  try { localStorage.setItem("mq-search", JSON.stringify(searchOpts)); } catch { /* storage unavailable */ }
}
// The builder sits directly under the header search while regular expression
// search is on: flags, which fields are searched, quick tokens and a live result.
function regexPanel() {
  if (!searchOpts.regex) return "";
  const names = { name: t("Name", "名稱"), notes: t("Notes", "備註"), folder: t("Folder", "資料夾"), tags: t("Tags", "標籤"), arch: t("Architecture", "架構") };
  const flag = (k, label) => `<label class="chip-check"><input type="checkbox" data-search-flag="${k}" ${searchOpts.flags[k] ? "checked" : ""}> <span class="mono">${k}</span> ${label}</label>`;
  const tokens = [["\\d", t("digit", "數字")], ["\\w", t("word", "字元")], ["\\s", t("space", "空白")], [".", t("any", "任何")], ["*", t("0 or more", "零或多個")], ["+", t("1 or more", "一或多個")], ["?", t("optional", "可有可無")], ["|", t("or", "或")], ["^", t("start", "開頭")], ["$", t("end", "結尾")], ["()", t("group", "群組")], ["[]", t("set", "集合")]];
  return `<section id="regex-panel" class="regex-panel" aria-label="${t("Regular expression builder", "正規表達式建構器")}"><div class="regex-row"><span class="label">${t("Flags", "旗標")}</span>${flag("i", t("ignore case", "不分大小寫"))}${flag("m", t("multiline", "多行"))}${flag("s", t("dot matches newline", "點號配對換行"))}${flag("u", t("Unicode", "Unicode"))}</div><div class="regex-row"><span class="label">${t("Search in", "搜尋範圍")}</span>${SEARCH_FIELDS.map((f) => `<label class="chip-check"><input type="checkbox" data-search-field="${f}" ${searchOpts.fields.includes(f) ? "checked" : ""}> ${names[f]}</label>`).join("")}</div><div class="regex-row"><span class="label">${t("Insert", "插入")}</span>${tokens.map(([tok, label]) => `<button type="button" class="token mono" data-action="regex-token" data-token="${escape(tok)}" title="${escape(label)}" aria-label="${escape(t("Insert ", "插入 ") + tok + " (" + label + ")")}">${escape(tok)}</button>`).join("")}</div><p id="regex-status" class="muted-line" role="status">${escape(regexStatusText())}</p><div id="regex-tools">${regexTabBody()}</div></section>`;
}
// Text for the builder status line; used when the panel is drawn (including the
// periodic redraw) and while typing.
function regexStatusText() {
  const s = currentSearch();
  if (!s.ok) return t("Not a valid pattern: ", "樣式無效：") + localizeServerError(s.error, t);
  if (!s.active) return t("Type a pattern to filter machines.", "輸入樣式以篩選機器。");
  const n = state.machines.filter(s.test).length;
  return t(`Valid pattern · ${n} of ${state.machines.length} machines match.`, `樣式有效 · ${state.machines.length} 部機器中有 ${n} 部符合。`);
}
function updateRegexStatus() {
  $("#global-search")?.toggleAttribute("aria-invalid", !currentSearch().ok);
  const el = $("#regex-status");
  if (el) el.textContent = regexStatusText();
  updateRegexTools();
  drawSearchElsewhere();
}
function views() {
  thumbs.tick = Math.floor(Date.now() / 5000);
  return createViews({
    state,
    session,
    page,
    query,
    filter,
    folder,
    selected,
    checked,
    t,
    label,
    escape,
    bytes,
    field,
    select,
    button,
    pill,
    enumLabel,
    consoleScale,
    consoleInput,
    host,
    applianceUpdate,
    searchMatcher: currentSearch().test,
    appearance,
    thumbs,
    snaps: snapshotStore[selected] || { status: "loading", items: [] },
    machineTab,
    machineView: machineViewFor(selected),
    firmware: firmwareList,
    firmwareUpload,
    people: peopleList,
    session,
    pools: poolsList,
    editingDiskIds: editing ? (state.machines.find((m) => m.id === createCfg?.id)?.disks || []).map((d) => d.id) : [],
    storage: storage || normalizeStorage(null, state),
    storageTab,
    upload,
    cfg: createCfg,
    section: createSection,
    editing,
    onboarding: onboardingMachine,
  });
}

function updateConsoleControls() {
  for (const [action, value, text] of [
    [
      "console-scale",
      consoleScale,
      consoleScale
        ? t("Scaling: fit", "縮放：符合畫面")
        : t("Scaling: native", "縮放：原始大小"),
    ],
    [
      "console-release",
      consoleInput,
      consoleInput
        ? t("Guest input: on", "客體輸入：開啟")
        : t("Guest input: off", "客體輸入：關閉"),
    ],
  ]) {
    const control = document.querySelector(`[data-action="${action}"]`);
    if (control) {
      control.textContent = text;
      control.setAttribute("aria-pressed", String(value));
    }
  }
}
new ResizeObserver(() =>
  document.documentElement.style.setProperty(
    "--notice-height",
    matchMedia("(max-width:760px)").matches
      ? `${$("#notice").getBoundingClientRect().height}px`
      : "0px",
  ),
).observe($("#notice"));

async function requestPreview() {
  const sequence = ++previewSequence;
  if (!createCfg || !$("#command-preview")) return;
  try {
    const plan = await api("/machine-preview", machinePayload());
    if (sequence !== previewSequence || !$("#command-preview")) return;
    $("#command-preview").textContent = [plan.executable, ...plan.args.map((value) => JSON.stringify(value))].join(" ");
  } catch (error) {
    if (sequence === previewSequence && $("#command-preview"))
      $("#command-preview").textContent = error.message;
  }
}
document.addEventListener("change", (event) => {
  if (event.target.id === "auth-language" || event.target.id === "auth-theme") {
    const remembered = Object.fromEntries(new FormData($("#auth-form")));
    localStorage.setItem("mq-language", $("#auth-language").value);
    localStorage.setItem("mq-theme", $("#auth-theme").value);
    applySettings();
    renderAuth();
    for (const [name, value] of Object.entries(remembered)) {
      const input = $("#auth-form").elements.namedItem(name);
      if (input) input.value = value;
    }
    document.getElementById(event.target.id)?.focus();
  }
});

function buildMetadata() {
  const data = state || session,
    formatted = formatBuildTimestamp(data?.updatedAt, {
      locale: state?.settings.language === "yue" ? "zh-HK" : "en-CA",
    });
  return `<div class="brand-meta"><span>v${escape(data?.version || t("Unavailable", "未能提供"))}</span>${formatted ? `<time datetime="${escape(formatted.datetime)}" title="${escape(formatted.datetime)}">${t("Built", "建置")} ${escape(formatted.display)}</time>` : `<span>${t("Build time unavailable", "未能提供建置時間")}</span>`}</div>`;
}

function currentTabId() {
  return page === "console" ? `console:${selected}` : page;
}
function workspaceModels() {
  return [
    ...["overview", "machines", "new", "storage", "settings", "history", "docs"].map(
      (id) => ({
        id,
        label: label(id),
        icon: {
          overview: "dashboard",
          machines: "view_list",
          storage: "hard_drive",
          new: "add",
          settings: "settings",
          history: "history",
          docs: "menu_book",
        }[id],
      }),
    ),
    ...state.machines.map((machine) => ({
      id: `console:${machine.id}`,
      label: machine.name,
      icon: "computer",
    })),
  ];
}
function saveWorkspace() {
  try {
    const value = JSON.stringify(workspace);
    if (localStorage.getItem("mq-workspace-tabs") !== value)
      localStorage.setItem("mq-workspace-tabs", value);
  } catch {
    notify(
      t(
        "Workspace tabs could not be saved in this browser.",
        "此瀏覽器未能儲存工作區分頁。",
      ),
    );
  }
}
function workspaceNavigation() {
  const models = workspaceModels();
  workspace = syncTabs(
    workspace,
    models.map((model) => model.id),
  );
  if (!workspaceRestored) {
    workspaceRestored = true;
    if (!onboardingMachine) {
      const restored = initialTab(workspace);
      if (restored?.startsWith("console:")) {
        page = "console";
        selected = restored.slice(8);
      } else {
        page = restored || "overview";
        if (page === "new") initializeWizard();
      }
    }
  }
  if (!models.some((model) => model.id === currentTabId())) {
    const fallback = workspace.open[0];
    if (fallback.startsWith("console:")) {
      page = "console";
      selected = fallback.slice(8);
    } else page = fallback;
  }
  workspace = activateTab(workspace, currentTabId());
  saveWorkspace();
  return `<nav class="tabstrip" aria-label="${t("Workspace tabs", "工作區分頁")}"><div class="tabs" role="tablist" aria-orientation="horizontal">${workspace.open
    .map((id) => {
      const model = models.find((value) => value.id === id);
      if (!model) return "";
      const pinned = workspace.pinned.includes(id),
        active = id === currentTabId(),
        action = id.startsWith("console:") ? id : `page:${id}`;
      return `<div class="tab-item">${button(action, `<span class="icon" aria-hidden="true">${model.icon}</span><span class="nav-name">${escape(model.label)}</span>`, `tab-route ${active ? "active" : ""}`, `id="workspace-tab-${encodeURIComponent(id)}" role="tab" aria-selected="${active}" aria-controls="main" tabindex="${active ? "0" : "-1"}" data-tab="${id}" title="${escape(model.label)}"`)}<div class="tab-controls">${button(`pin-tab:${encodeURIComponent(id)}`, `<span class="icon" aria-hidden="true">${pinned ? "keep" : "keep_off"}</span>`, "tab-control", `aria-label="${escape(t(pinned ? "Unpin " : "Pin ", pinned ? "取消固定 " : "固定 ") + model.label)}" aria-pressed="${pinned}"`)}${button(`close-tab:${encodeURIComponent(id)}`, '<span class="icon" aria-hidden="true">close</span>', "tab-control", `aria-label="${escape(t("Close ", "關閉 ") + model.label)}" ${pinned ? "disabled" : ""}`)}</div></div>`;
    })
    .join(
      "",
    )}</div><div class="tab-tools">${button("open-all-tabs", t("Open every tab", "開啟所有分頁"))}${button("new-tab", t("New tab", "新增分頁"), "primary")}</div></nav>`;
}
function navigateWorkspace(id) {
  if (page === "new" && $("#machine-form")) persistDraft();
  if (onboardingMachine && !state.setup.complete) {
    onboardingMachine = false;
    render();
    return;
  }
  if (id === "new") {
    startWizard();
    return;
  }
  if (id.startsWith("console:")) {
    page = "console";
    selected = id.slice(8);
  } else page = id;
  render();
}
// The palette has its own search options, separate from the header search.
let paletteSearch = { regex: false, flags: { i: true, m: false, s: false, u: false } };
try { const saved = JSON.parse(localStorage.getItem("mq-palette-search") || "{}"); paletteSearch = { regex: Boolean(saved.regex), flags: { ...paletteSearch.flags, ...(saved.flags || {}) } }; } catch { /* storage unavailable */ }
const savePaletteSearch = () => { try { localStorage.setItem("mq-palette-search", JSON.stringify(paletteSearch)); } catch { /* storage unavailable */ } };
const paletteMatcher = (q) => compileSearch(paletteSearch.regex ? q : String(q).trim(), { regex: paletteSearch.regex, flags: paletteSearch.flags });
function paletteBuilder() {
  const toggle = button("palette-regex", '<span class="mono" aria-hidden="true">.*</span>', "regex-toggle small", `aria-pressed="${paletteSearch.regex}" aria-controls="palette-builder" aria-label="${escape(t("Regular expression search", "正規表達式搜尋"))}" title="${escape(t("Regular expression search", "正規表達式搜尋"))}"`);
  if (!paletteSearch.regex) return `<div class="regex-row">${toggle}<span class="muted">${t("Plain-text search. Turn on .* for a regular expression.", "純文字搜尋。開啟 .* 可用正規表達式。")}</span></div>`;
  const flag = (k, label) => `<label class="chip-check"><input type="checkbox" data-palette-flag="${k}" ${paletteSearch.flags[k] ? "checked" : ""}> <span class="mono">${k}</span> ${label}</label>`;
  const tokens = ["\\d", "\\w", "\\s", ".", "*", "+", "?", "|", "^", "$", "()", "[]"];
  return `<div class="regex-row">${toggle}${flag("i", t("ignore case", "不分大小寫"))}${flag("m", t("multiline", "多行"))}${flag("s", t("dot matches newline", "點號配對換行"))}${flag("u", "Unicode")}</div><div class="regex-row">${tokens.map((tok) => `<button type="button" class="token mono" data-action="palette-token" data-token="${escape(tok)}" aria-label="${escape(t("Insert ", "插入 ") + tok)}">${escape(tok)}</button>`).join("")}</div><p id="palette-status" class="muted-line" role="status"></p><ol class="explain" id="palette-explain"></ol>`;
}
function drawPaletteBuilder() {
  const holder = document.querySelector("#palette-builder");
  if (holder) holder.innerHTML = paletteBuilder();
}
function showCatalog(mode = "commands", query = "") {
  catalogMode = mode;
  catalogEntries = commandInventory(state, t);
  modal(
    mode === "tabs"
      ? t("New tab catalog", "新增分頁目錄")
      : t("Command palette", "指令選單"),
    `<div class="field"><label for="command-search">${t("Search destinations and controls", "搜尋目的地及控制")}</label><input id="command-search" type="search" maxlength="200" value="${escape(query)}" autocomplete="off"></div><div id="palette-builder" class="palette-builder">${paletteBuilder()}</div><div class="palette-settings">${select(
      "palette-theme",
      t("Theme", "主題"),
      [
        ["dark", t("Dark", "深色")],
        ["light", t("Light", "淺色")],
        ["system", t("Follow device", "跟隨裝置")],
      ],
      state.settings.theme,
    )}${select(
      "palette-language",
      t("Language", "語言"),
      [
        ["en", "English"],
        ["yue", "廣東話"],
        ["both", "English + 廣東話"],
      ],
      state.settings.language,
    )}<label class="check"><input id="palette-motion" type="checkbox" ${state.settings.motion ? "checked" : ""}>${t("Interface motion", "介面動畫")}</label></div><div id="command-results" class="command-results"></div>`,
    t("Close", "關閉"),
    async () => {},
  );
  renderCommands(query);
  $("#command-search").focus();
}
function renderCommands(query) {
  const m = paletteMatcher(query);
  const matches = !m.ok ? [] : paletteSearch.regex ? (m.active ? catalogEntries.filter((e) => m.span(e.label) || m.span(e.unavailable || e.description)) : catalogEntries) : searchCommands(catalogEntries, query);
  $("#command-search")?.toggleAttribute("aria-invalid", !m.ok);
  const status = $("#palette-status");
  if (status) status.textContent = !m.ok ? t(`Not a valid pattern: ${m.error}`, `樣式無效：${m.error}`) : t(`${matches.length} of ${catalogEntries.length} match.`, `${catalogEntries.length} 項中有 ${matches.length} 項符合。`);
  const explain = $("#palette-explain");
  if (explain) explain.innerHTML = m.ok && m.active ? explainPattern(query).map((p) => `<li style="--depth:${p.depth}"><code>${escape(p.text)}</code><span>${escape(t(p.en, p.yue))}</span></li>`).join("") : "";
  $("#command-results").innerHTML =
    matches
      .map((entry) =>
        button(
          `command-run:${encodeURIComponent(entry.id)}`,
          `<strong>${escape(entry.label)}</strong><small>${escape(entry.unavailable || entry.description)}</small>`,
          "command-entry",
          entry.unavailable ? "disabled" : "",
        ),
      )
      .join("") || `<p>${t("No matching controls.", "沒有符合的控制。")}</p>`;
}
document.addEventListener("input", (event) => {
  if (event.target.id === "command-search") renderCommands(event.target.value);
});
document.addEventListener("change", (event) => {
  const k = event.target.dataset?.paletteFlag;
  if (!k) return;
  paletteSearch.flags[k] = event.target.checked;
  savePaletteSearch();
  renderCommands($("#command-search")?.value || "");
});
document.addEventListener("change", async (event) => {
  if (
    !["palette-theme", "palette-language", "palette-motion"].includes(
      event.target.id,
    )
  )
    return;
  try {
    const query = $("#command-search").value;
    await api("/preferences", {
      settings: {
        theme: $("#palette-theme").value,
        language: $("#palette-language").value,
        motion: $("#palette-motion").checked,
      },
    });
    await refresh();
    showCatalog(catalogMode, query);
  } catch (error) {
    notify(error.message);
  }
});
document.addEventListener("keydown", (event) => {
  if (
    event.target.id === "command-search" &&
    (event.key === "Enter" || event.key === "ArrowDown")
  ) {
    event.preventDefault();
    const first = $("#command-results button:not(:disabled)");
    if (event.key === "Enter") first?.click();
    else first?.focus();
  }
  if (
    event.target.matches("[role=tab]") &&
    ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(
      event.key,
    )
  ) {
    event.preventDefault();
    const buttons = [...document.querySelectorAll("[role=tab]")],
      index = buttons.indexOf(event.target);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index +
              (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) +
              buttons.length) %
            buttons.length;
    const id = buttons[next].dataset.tab;
    buttons[next].click();
    document.querySelector(`[data-tab="${CSS.escape(id)}"]`)?.focus();
  }
});

/* ---- Material Design 3 remake: create form, snapshots, storage, settings, gated actions ---- */
function getPath(object, path) {
  return String(path)
    .split(".")
    .reduce((node, part) => node?.[part], object);
}
function rerenderQuiet() {
  silentRender = true;
  try {
    render();
  } finally {
    silentRender = false;
  }
}
const unavailableMessage = () =>
  t(
    "This server version does not offer that yet. Update the host to use it.",
    "此伺服器版本尚未提供這項功能，請更新主機後使用。",
  );
async function loadSnapshots(id) {
  if (!id || snapshotStore[id]) return;
  snapshotStore[id] = { status: "loading", items: [] };
  const result = await tryApi(`/machines/${id}/snapshots`);
  if (result.ok) {
    const data = result.data;
    snapshotStore[id] = {
      status: "ok",
      items: data.snapshots || data.items || (Array.isArray(data) ? data : []),
    };
  } else {
    snapshotStore[id] = { status: "unavailable", items: [] };
    if (!result.unavailable) notify(result.error.message);
  }
  if (page === "console" && selected === id && session?.authenticated) rerenderQuiet();
}
async function loadStorage(force = false) {
  if (storage && !force) return;
  // Callers waiting on a load in progress get that same load, so they only
  // continue once storage is actually known.
  if (loadStorage.pending) return loadStorage.pending;
  loadStorage.pending = tryApi("/storage");
  const result = await loadStorage.pending.finally(() => { loadStorage.pending = null; });
  storage = normalizeStorage(result.ok ? result.data : null, state);
  if (page === "storage" && session?.authenticated) rerenderQuiet();
}
async function sendKeys(sequence) {
  const result = await tryApi(`/machines/${selected}/actions`, { action: "send-keys", keys: sequence });
  if (result.ok) return;
  if (!result.unavailable) throw result.error;
  await api(`/machines/${selected}/keys`, { keys: sequence });
}
function setUploadView(patch) {
  upload = { ...(upload || {}), ...patch };
  if (page !== "storage") return;
  const bar = document.querySelector(".upload-bar > div"),
    meter = document.querySelector("[role=progressbar]");
  if (bar && upload.active) {
    bar.style.width = `${upload.percent}%`;
    meter?.setAttribute("aria-valuenow", String(upload.percent));
    const zone = $("#dropzone");
    const readout = zone?.querySelector(".row");
    if (readout)
      readout.innerHTML = `<span>${escape(upload.name)} · ${bytes(upload.loaded)} / ${bytes(upload.total)}</span><strong>${upload.percent}%</strong>`;
  } else rerenderQuiet();
}
let activeTransfer = null;
async function startUpload(file) {
  if (!file) return;
  const kind = kindOfUpload(file.name);
  if (!kind) {
    notify(t("Choose an ISO, a disk image (qcow2, raw, VMDK, VDI or VHDX) or a machine bundle (.mqvm.tar).", "請選擇 ISO、磁碟映像（qcow2、raw、VMDK、VDI 或 VHDX）或機器套件（.mqvm.tar）。"));
    return;
  }
  if (kind === "iso" && (!file.size || file.size > state.mediaMaxBytes)) {
    notify(t("Choose an ISO between 1 byte and 2 GiB.", "請選擇介乎 1 byte 和 2 GiB 的 ISO。"));
    return;
  }
  const name = file.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(-155);
  upload = { active: true, name, loaded: 0, total: file.size, percent: 0, message: "" };
  page = "storage";
  rerenderQuiet();
  const onProgress = (loaded, total) =>
    setUploadView({ active: true, loaded, total, percent: total ? Math.round((100 * loaded) / total) : 0 });
  activeTransfer =
    kind === "bundle"
      ? uploadFile(`/api/storage/import-bundle?name=${encodeURIComponent(name.replace(/\.mqvm\.tar$|\.tar$/i, "").slice(0, 80))}`, file, session.csrf, onProgress)
      : kind === "iso"
      ? uploadIso(file, name, session.csrf, onProgress)
      : uploadFile(`/api/storage/import?mode=machine&name=${encodeURIComponent(name.replace(/\.[^.]+$/, "").slice(0, 80))}`, file, session.csrf, onProgress);
  try {
    const result = await activeTransfer.promise;
    storage = null;
    await refresh(false);
    upload = {
      active: false,
      message: result.machine && kind === "bundle"
        ? t(`Imported ${result.machine.name}${result.savedState ? " with its saved state; resume it from its Save and resume tab" : ""}.`, `已匯入 ${result.machine.name}${result.savedState ? "，連同已保存狀態；可在其「保存及繼續」分頁繼續" : ""}。`)
        : t(`Imported ${result.name || name}.`, `已匯入 ${result.name || name}。`),
    };
  } catch (error) {
    upload = {
      active: false,
      error: true,
      message:
        error.status === 404 || error.status === 501
          ? unavailableMessage()
          : localizeServerError(error.message, t),
    };
  } finally {
    activeTransfer = null;
    if (page === "storage") loadStorage(true);
  }
}
function gate(options) {
  showGate({
    dialog: $("#dialog"),
    t,
    fallbackFocus: () => $("#main"),
    onError: (error) => notify(error.message),
    ...options,
  });
}
function sectionName(id) {
  return t(...names[id] || [id, id]);
}
async function handleExtra(action, b) {
  if (action === "notifications") { toggleNotifications(); return true; }
  if (action === "notifications-close") { toggleNotifications(false); return true; }
  if (action === "notifications-read") { notificationLog.markAllRead(); drawNotifications(); notificationBadge(); return true; }
  if (action === "notifications-clear") { notificationLog.clear(); drawNotifications(); notificationBadge(); return true; }
  if (action === "regex-toggle") {
    searchOpts.regex = !searchOpts.regex;
    saveSearchOpts();
    render();
    $("#global-search")?.focus();
    updateRegexStatus();
    return true;
  }
  if (action.startsWith("regex-tab:")) {
    regexTab = action.slice(10);
    updateRegexTools();
    document.querySelector(`[data-action="regex-tab:${regexTab}"]`)?.focus();
    return true;
  }
  if (action === "palette-regex") {
    paletteSearch.regex = !paletteSearch.regex;
    savePaletteSearch();
    drawPaletteBuilder();
    renderCommands($("#command-search")?.value || "");
    document.querySelector('[data-action="palette-regex"]')?.focus();
    return true;
  }
  if (action === "palette-token") {
    const input = $("#command-search");
    const tok = b.dataset.token;
    const at = input.selectionStart ?? input.value.length;
    input.value = input.value.slice(0, at) + tok + input.value.slice(input.selectionEnd ?? at);
    const caret = at + (tok === "()" || tok === "[]" ? 1 : tok.length);
    input.focus();
    input.setSelectionRange(caret, caret);
    renderCommands(input.value);
    return true;
  }
  if (action.startsWith("machine-tab:")) {
    machineTab = action.slice(12);
    render();
    if (machineTab === "monitor") loadMonitorQuery(machineViewFor(selected).query || "status");
    if (machineTab === "log") loadMachineLog();
    if (machineTab === "agent" && state.machines.find((m) => m.id === selected)?.guestAgent) loadGuestQuery(machineViewFor(selected).agentQuery || "os");
    document.querySelector(`[data-action="${action}"]`)?.focus();
    return true;
  }
  if (action.startsWith("monitor-query:")) {
    await loadMonitorQuery(action.slice(14));
    document.querySelector(`[data-action="${action}"]`)?.focus();
    return true;
  }
  if (action === "state-save" || action === "state-resume") {
    const id = selected;
    b.disabled = true;
    notify(action === "state-save" ? t("Saving the machine's state…", "正在保存機器狀態…") : t("Resuming the saved state…", "正在繼續已保存狀態…"));
    try {
      await api(`/machines/${id}/saved-state`, { action: action === "state-save" ? "save" : "resume" });
      notify(action === "state-save" ? t("State saved. The machine is stopped.", "狀態已保存，機器已停止。") : t("Resumed where it was.", "已在原處繼續。"));
    } catch (error) {
      notify(localizeServerError(error.message, t));
    }
    await refresh();
    if (action === "state-resume") { machineTab = "overview"; render(); }
    return true;
  }
  if (action === "state-discard") {
    const id = selected;
    gate({
      title: t("Discard the saved state?", "捨棄已保存狀態？"),
      body: escape(t("The machine's open programs and unsaved work in the guest are lost. Its disks are kept, and it will start from them normally.", "客體內開著的程式及未儲存的工作會遺失。磁碟會保留，機器之後會正常由磁碟啟動。")),
      confirmLabel: t("Slide to discard", "滑動以捨棄"),
      doneText: t("Saved state discarded.", "已捨棄已保存狀態。"),
      onConfirm: async () => {
        await api(`/machines/${id}/saved-state`, { action: "discard" });
        await refresh();
        render();
      },
    });
    return true;
  }
  if (action.startsWith("agent-query:")) {
    await loadGuestQuery(action.slice(12));
    document.querySelector(`[data-action="${action}"]`)?.focus();
    return true;
  }
  if (action === "log-refresh") {
    await loadMachineLog();
    document.querySelector('[data-action="log-refresh"]')?.focus();
    return true;
  }
  if (action.startsWith("open-doc:")) {
    const index = Number(action.slice(9));
    page = "docs";
    render();
    // The page may be drawn after an animated transition, so wait for it.
    const focusArticle = (tries) => {
      const article = page === "docs" && document.querySelectorAll("#main article")[index];
      if (!article) { if (tries > 0) setTimeout(() => focusArticle(tries - 1), 50); return; }
      article.setAttribute("tabindex", "-1");
      article.classList.add("flash");
      article.scrollIntoView({ block: "center", behavior: state.settings.motion ? "smooth" : "auto" });
      article.focus({ preventScroll: true });
    };
    focusArticle(40);
    return true;
  }
  if (action.startsWith("regex-step:")) {
    const n = regexDebug?.result?.trace?.length || 0;
    const to = action.slice(11);
    regexDebugStep = to === "first" ? 0 : to === "last" ? n - 1 : to === "next" ? regexDebugStep + 1 : regexDebugStep - 1;
    drawDebug();
    document.querySelector(`[data-action="${action}"]`)?.focus();
    return true;
  }
  if (action.startsWith("regex-lang:")) {
    regexCodeLang = action.slice(11);
    updateRegexTools();
    document.querySelector(`[data-action="${action}"]`)?.focus();
    return true;
  }
  if (action === "regex-copy") {
    const code = $("#regex-code")?.textContent || "";
    try { await navigator.clipboard.writeText(code); notify(t("Code copied.", "已複製程式碼。")); }
    catch { notify(t("The browser did not allow copying. Select the code and copy it instead.", "瀏覽器不允許複製，請選取程式碼後自行複製。")); }
    return true;
  }
  if (action.startsWith("regex-file-download:")) {
    const which = action.slice(20);
    const list = which === "all" ? regexFileResults.filter((x) => x.count) : [regexFileResults[Number(which)]].filter(Boolean);
    list.forEach((x, i) => setTimeout(() => downloadText(x.name, x.text), i * 250));
    if (list.length) notify(t(`Downloading ${list.length} changed files.`, `正在下載 ${list.length} 個已更改檔案。`));
    return true;
  }
  if (action === "regex-files-clear") {
    regexFiles = [];
    regexFileResults = [];
    updateRegexTools();
    return true;
  }
  if (action === "regex-save") {
    try {
      regexLibrary.add($("#regex-lib-name")?.value || "", query, regexFlagString());
      notify(t("Pattern saved to the library.", "樣式已儲存到樣式庫。"));
    } catch (error) {
      notify(localizeServerError(error.message, t));
    }
    $("#regex-tools").innerHTML = regexTabBody();
    return true;
  }
  if (action.startsWith("regex-use:") || action.startsWith("regex-delete:")) {
    const item = regexLibrary.list()[Number(action.split(":")[1])];
    if (!item) return true;
    if (action.startsWith("regex-delete:")) regexLibrary.remove(item.name);
    else {
      query = item.pattern;
      searchOpts.flags = { i: item.flags.includes("i"), m: item.flags.includes("m"), s: item.flags.includes("s"), u: item.flags.includes("u") };
      saveSearchOpts();
      regexTab = "test";
      render();
      updateRegexStatus();
      return true;
    }
    $("#regex-tools").innerHTML = regexTabBody();
    return true;
  }
  if (action === "regex-token") {
    const input = $("#global-search");
    const tok = b.dataset.token;
    const at = input.selectionStart ?? input.value.length;
    input.value = input.value.slice(0, at) + tok + input.value.slice(input.selectionEnd ?? at);
    const caret = at + (tok === "()" || tok === "[]" ? 1 : tok.length);
    input.focus();
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  if (await consoleTools().handle(action)) {
    updateMediaControls();
    return true;
  }
  if (action === "update-check") {
    const result = await tryApi("/appliance/update", { action: "check" });
    if (!result.ok) notify(result.error.message);
    else notify(t("Checking for updates.", "正在檢查更新。"));
    await loadUpdate();
    rerenderQuiet();
    return true;
  }
  if (action === "update-apply") {
    const running = state.machines.filter((m) => m.state === "running" || m.state === "paused").length;
    gate({
      title: t("Update and restart?", "更新並重新啟動？"),
      body: `<p>${t(`Material QEMU restarts on release ${escape(applianceUpdate?.latest || "")}. Machines, disks and settings are kept.`, `Material QEMU 會以版本 ${escape(applianceUpdate?.latest || "")} 重新啟動，機器、磁碟和設定都會保留。`)}</p>${running ? `<p><strong>${t(`${running} running machine(s) will be stopped.`, `${running} 部運行中的機器會被停止。`)}</strong></p>` : ""}<p>${t("If the new release does not start, the current one is restored.", "如果新版本未能啟動，會自動還原目前版本。")}</p>`,
      confirmLabel: t("Slide to update", "滑動以更新"),
      doneText: t("Update started", "已開始更新"),
      onConfirm: async () => {
        await api("/appliance/update", { action: "apply" });
        await loadUpdate();
        rerenderQuiet();
      },
    });
    return true;
  }
  // New machine form
  if (action.startsWith("cfg-")) {
    const [verb, ...args] = action.split(":");
    if (!createCfg) return true;
    if (verb === "cfg-section") createSection = args[0];
    else if (verb === "cfg-preset") createCfg = applyPreset(createCfg, args[0]);
    else if (verb === "cfg-toggle") {
      const path = args.join(":");
      // Drafts saved before cloud-init existed have no settings object for it.
      if (path.startsWith("cloudInit.") && !createCfg.cloudInit) createCfg.cloudInit = { enabled: false, userData: "", networkConfig: "" };
      setPath(createCfg, path, !getPath(createCfg, path));
      if (path === "firmware" || path === "secureBoot") createCfg.secureBoot = createCfg.firmware === "uefi" && createCfg.secureBoot;
    } else if (verb === "cfg-mem") createCfg.memory = Number(args[0]);
    else if (verb === "cfg-add-disk")
      createCfg.disks.push(newDisk({ name: `disk${createCfg.disks.length + 1}` }));
    else if (verb === "cfg-del-disk") createCfg.disks.splice(Number(args[0]), 1);
    else if (verb === "cfg-add-cd") createCfg.cdroms.push(state.media[0] || "");
    else if (verb === "cfg-del-cd") createCfg.cdroms.splice(Number(args[0]), 1);
    else if (verb === "cfg-add-fwd") addForward(createCfg);
    else if (verb === "cfg-cloud-template") createCfg.cloudInit = { ...(createCfg.cloudInit || {}), enabled: true, userData: "#cloud-config\nusers:\n  - name: admin\n    sudo: ALL=(ALL) NOPASSWD:ALL\n    ssh_authorized_keys:\n      - ssh-ed25519 AAAA... you@host\npackage_update: true\n" };
    else if (verb === "cfg-add-flag") { createCfg.cpuFlags = [...(createCfg.cpuFlags || []), { name: "", on: true }].slice(0, 24); }
    else if (verb === "cfg-del-flag") (createCfg.cpuFlags || []).splice(Number(args[0]), 1);
    else if (verb === "cfg-del-fwd") createCfg.network.forwards.splice(Number(args[0]), 1);
    else if (verb === "cfg-boot") moveBoot(createCfg, args[0], Number(args[1]));
    persistDraft();
    if (verb === "cfg-section" || verb === "cfg-preset") render();
    else rerenderQuiet();
    return true;
  }
  if (action === "wizard-create" || action === "wizard-create-start") {
    if (!createCfg || !saveWizard()) return true;
    if (action === "wizard-create-start") createCfg.startAfterCreate = true;
    b.disabled = true;
    const result = await api(editing ? `/machines/${createCfg.id}` : "/machines", machinePayload());
    clearDraft(localStorage, editing ? createCfg.id : undefined);
    storage = null;
    const startAfter = !editing && createCfg.startAfterCreate && !result.startError;
    createCfg = null;
    if (onboardingMachine) {
      onboardingMachine = false;
      await api("/preferences", { setup: { step: 8, complete: false } });
      await refresh();
      notify(result.startError ? result.startError : t("First machine saved.", "第一部機器已儲存。"));
      return true;
    }
    if (startAfter) {
      selected = result.id;
      page = "console";
    } else page = "machines";
    await refresh();
    notify(
      result.startError
        ? t(`Machine saved, but start did not complete: ${result.startError}`, `機器已儲存，但啟動未完成：${result.startError}`)
        : t("Machine saved.", "機器已儲存。"),
    );
    return true;
  }
  // Gated destructive actions
  if (action.startsWith("lifecycle:") && action.endsWith(":stop")) {
    const id = action.split(":")[1],
      machine = state.machines.find((m) => m.id === id);
    gate({
      title: t("Power off immediately?", "立即強制關機？"),
      body: `<p><strong>${escape(machine?.name || "")}</strong></p><p>${t("Unsaved guest data may be lost. A normal shutdown is safer.", "可能失去客體未儲存資料，正常關機較安全。")}</p>`,
      confirmLabel: t("Slide to power off", "滑動以強制關機"),
      doneText: t("Powering off", "正在強制關機"),
      onConfirm: async () => {
        await api(`/machines/${id}/action`, { action: "stop" });
        await refresh();
        notify(t("Power off requested.", "已請求強制關機。"));
      },
    });
    return true;
  }
  if (action.startsWith("remove:") || action === "bulk-remove") {
    const machines =
      action === "bulk-remove"
        ? state.machines.filter((v) => checked.has(v.id))
        : [state.machines.find((v) => v.id === action.slice(7))];
    if (!machines.length || !machines[0]) return true;
    gate({
      title: t("Remove machines, retain disks", "移除機器，保留磁碟"),
      body: `<ul>${machines.map((m) => `<li>${escape(m.name)}</li>`).join("")}</ul><p>${t("Only stopped machines can be removed. Definitions are archived for restoration; no disk is deleted.", "只可移除已停止機器，設定會存檔以供還原，不會刪除磁碟。")}</p>`,
      confirmLabel: t("Slide to remove", "滑動以移除"),
      doneText: t("Removing", "正在移除"),
      onConfirm: async () => {
        const outcomes = [];
        for (const machine of machines) {
          try {
            await api(`/machines/${machine.id}/remove`, { confirmName: machine.name, retainDisk: true });
            checked.delete(machine.id);
            if (selected === machine.id) selected = "";
            outcomes.push(`${machine.name}: ${t("removed; disk retained", "已移除，磁碟保留")}`);
          } catch (error) {
            outcomes.push(`${machine.name}: ${error.message}`);
          }
        }
        storage = null;
        await refresh();
        modal(t("Removal results", "移除結果"), `<ul>${outcomes.map((v) => `<li>${escape(v)}</li>`).join("")}</ul>`, t("Close", "關閉"), async () => {});
      },
    });
    return true;
  }
  // Snapshots
  if (action === "snap-take") {
    const id = selected;
    modal(
      t("Take snapshot", "建立快照"),
      field("snapName", t("Snapshot name", "快照名稱"), `snap-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")}`, "text", 'required maxlength="60" pattern="[A-Za-z0-9._-]+"') +
        `<p class="muted">${t("Letters, numbers, dot, dash and underscore. Needs a qcow2 disk.", "可用英文字母、數字、點、減號及底線，需要 qcow2 磁碟。")}</p>`,
      t("Take snapshot", "建立快照"),
      async (f) => {
        const result = await tryApi(`/machines/${id}/snapshots`, { name: f.get("snapName") });
        if (!result.ok) throw result.unavailable ? new Error(unavailableMessage()) : result.error;
        delete snapshotStore[id];
        await loadSnapshots(id);
        notify(t("Snapshot saved.", "快照已儲存。"));
      },
    );
    return true;
  }
  if (action.startsWith("snap-restore:") || action.startsWith("snap-delete:")) {
    const restore = action.startsWith("snap-restore:"),
      name = decodeURIComponent(action.split(":")[1]),
      id = selected;
    gate({
      title: restore ? t("Restore this snapshot?", "還原此快照？") : t("Delete this snapshot?", "刪除此快照？"),
      body: `<p><strong>${escape(name)}</strong></p><p>${restore ? t("The machine returns to this snapshot. Everything changed since then is replaced and cannot be recovered.", "機器會回到此快照，之後的所有變更都會被取代，無法復原。") : t("The snapshot is removed for good.", "快照會永久移除。")}</p>`,
      confirmLabel: restore ? t("Slide to restore", "滑動以還原") : t("Slide to delete", "滑動以刪除"),
      doneText: restore ? t("Restoring", "正在還原") : t("Deleting", "正在刪除"),
      onConfirm: async () => {
        if (restore) {
          const result = await tryApi(`/machines/${id}/snapshots/${encodeURIComponent(name)}/restore`, {});
          if (!result.ok) throw result.unavailable ? new Error(unavailableMessage()) : result.error;
        } else await apiDelete(`/machines/${id}/snapshots/${encodeURIComponent(name)}`);
        delete snapshotStore[id];
        await refresh();
        notify(restore ? t("Snapshot restored.", "快照已還原。") : t("Snapshot deleted.", "快照已刪除。"));
      },
    });
    return true;
  }
  // Console extras
  if (action === "console-cad") {
    await sendKeys("ctrlaltdel");
    notify(t("Ctrl+Alt+Del sent.", "已傳送 Ctrl+Alt+Del。"));
    return true;
  }
  if (action === "console-keys") {
    modal(
      t("Send keys", "傳送按鍵"),
      select("sequence", t("Key sequence", "按鍵組合"), [["ctrlaltdel", "Ctrl + Alt + Del"], ["ctrlaltf1", "Ctrl + Alt + F1"], ["ctrlaltf2", "Ctrl + Alt + F2"], ["escape", "Escape"], ["enter", "Enter"], ["print", "Print Screen"], ["meta", t("System key", "系統鍵")]], "ctrlaltdel"),
      t("Send", "傳送"),
      async (f) => sendKeys(f.get("sequence")),
    );
    return true;
  }
  if (action === "console-cd") {
    const machine = state.machines.find((m) => m.id === selected);
    modal(
      t("Change CD", "更換光碟"),
      select("cdIso", t("Image", "映像"), [["", t("Eject the disc", "退出光碟")], ...state.media.map((m) => [m, m])], (machine?.cdroms && machine.cdroms[0]) || machine?.iso || "") + `<p class="muted">${t("Takes effect immediately in the running guest.", "會即時在運行中的客體生效。")}</p>`,
      t("Apply", "套用"),
      async (f) => {
        const iso = f.get("cdIso");
        const result = await tryApi(`/machines/${selected}/actions`, iso ? { action: "cd-change", iso } : { action: "cd-eject" });
        if (!result.ok) throw result.unavailable ? new Error(unavailableMessage()) : result.error;
        notify(iso ? t("Disc changed.", "已更換光碟。") : t("Disc ejected.", "已退出光碟。"));
      },
    );
    return true;
  }
  if (action === "console-shot") {
    const machine = state.machines.find((m) => m.id === selected);
    const response = await fetch(`/api/machines/${selected}/screenshot`);
    if (!response.ok || !(response.headers.get("content-type") || "").startsWith("image/")) {
      notify(response.status === 404 || response.status === 501 ? unavailableMessage() : t("A screenshot could not be taken.", "未能截圖。"));
      return true;
    }
    const url = URL.createObjectURL(await response.blob()),
      link = document.createElement("a");
    link.href = url;
    link.download = `${(machine?.name || "machine").replace(/[^\w.-]+/g, "_")}-screenshot.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    notify(t("Screenshot saved.", "截圖已儲存。"));
    return true;
  }
  if (action.startsWith("clone:")) {
    const id = action.slice(6),
      machine = state.machines.find((m) => m.id === id);
    modal(
      t("Clone machine", "複製機器"),
      field("cloneName", t("New machine name", "新機器名稱"), `${machine?.name || ""} copy`, "text", 'required maxlength="80"') + `<p class="muted">${t("Copies the definition and disks. The machine must be stopped.", "會複製設定及磁碟，機器必須已停止。")}</p>`,
      t("Clone", "複製"),
      async (f) => {
        const result = await tryApi(`/machines/${id}/clone`, { name: f.get("cloneName") });
        if (!result.ok) throw result.unavailable ? new Error(unavailableMessage()) : result.error;
        storage = null;
        await refresh();
        notify(t("Machine cloned.", "機器已複製。"));
      },
    );
    return true;
  }
  // Storage
  if (action.startsWith("storage-tab:")) {
    storageTab = action.slice(12);
    if (storageTab === "firmware") loadFirmware();
    if (storageTab === "pools") loadPools();
    render();
    return true;
  }
  if (action === "person-add") {
    const status = $("#person-status");
    try {
      const added = await api("/users", {
        name: $("#person-name").value,
        username: $("#person-username").value,
        password: $("#person-password").value,
        role: $("#person-role").value,
      });
      notify(t(`${added.name} can now sign in.`, `${added.name} 現在可以登入。`));
      await loadPeople();
      render();
    } catch (error) {
      if (status) status.textContent = localizeServerError(error.message, t);
    }
    return true;
  }
  if (action.startsWith("person-password:")) {
    const id = action.slice(16);
    const person = peopleList?.users.find((u) => u.id === id);
    modal(
      t("Reset password", "重設密碼"),
      `<p>${escape(t(`Set a new password for ${person?.name}. They are signed out everywhere.`, `為 ${person?.name} 設定新密碼，對方會在所有裝置登出。`))}</p><div class="field"><label for="reset-password">${t("New password (12 characters or more)", "新密碼（最少 12 個字元）")}</label><input id="reset-password" name="password" type="password" minlength="12" maxlength="256" autocomplete="new-password" required></div>`,
      t("Reset password", "重設密碼"),
      async (form) => {
        await api(`/users/${id}`, { password: form.get("password") });
        notify(t("Password reset.", "密碼已重設。"));
      },
    );
    return true;
  }
  if (action.startsWith("person-remove:")) {
    const id = action.slice(14);
    const person = peopleList?.users.find((u) => u.id === id);
    gate({
      title: t(`Remove ${person?.name}?`, `移除 ${person?.name}？`),
      body: escape(t("They can no longer sign in, and any open sessions end now. Their machines and the activity history stay.", "對方將不能再登入，所有已開啟的工作階段會立即結束；機器及活動記錄會保留。")),
      confirmLabel: t("Slide to remove", "滑動以移除"),
      doneText: t("Removed.", "已移除。"),
      onConfirm: async () => {
        await apiDelete(`/users/${id}`);
        await loadPeople();
        render();
      },
    });
    return true;
  }
  if (action === "pool-add") {
    try {
      const pool = await api("/pools", { name: $("#pool-name").value, path: $("#pool-path").value });
      notify(t(`Added the storage pool ${pool.name}.`, `已新增儲存池 ${pool.name}。`));
      await loadPools();
      render();
    } catch (error) {
      const status = $("#pool-status");
      if (status) status.textContent = localizeServerError(error.message, t);
    }
    return true;
  }
  if (action.startsWith("pool-remove:")) {
    const id = action.slice(12);
    try {
      await apiDelete(`/pools/${id}`);
      notify(t("Storage pool removed. Its folder and files were left in place.", "已移除儲存池，其資料夾及檔案保持不變。"));
    } catch (error) {
      notify(localizeServerError(error.message, t));
    }
    await loadPools();
    render();
    return true;
  }
  if (action === "fw-browse") {
    $("#firmware-file")?.click();
    return true;
  }
  if (action.startsWith("fw-delete:")) {
    const name = decodeURIComponent(action.slice(10));
    try {
      await apiDelete(`/firmware/${encodeURIComponent(name)}`);
      firmwareUpload = { message: t(`Deleted ${name}.`, `已刪除 ${name}。`) };
    } catch (error) {
      firmwareUpload = { error: true, message: localizeServerError(error.message, t) };
    }
    await loadFirmware();
    render();
    return true;
  }
  if (action === "storage-browse") {
    $("#storage-file")?.click();
    return true;
  }
  if (action === "upload-cancel") {
    activeTransfer?.abort();
    return true;
  }
  if (action.startsWith("disk-resize:")) {
    const id = decodeURIComponent(action.slice(12)),
      disk = (storage || normalizeStorage(null, state)).disks.find((d) => d.id === id);
    if (!disk) return true;
    modal(
      t("Resize disk", "調整磁碟容量"),
      `<p><strong>${escape(disk.name)}</strong></p>` + field("diskSize", t("New size (GiB)", "新容量（GiB）"), disk.bytes ? Math.ceil(disk.bytes / 1073741824) : "", "number", 'required min="1" max="65536"') + `<p class="muted">${t("Disks can only grow. Grow the partition inside the guest afterwards.", "磁碟只可擴大，之後需要在客體內擴大分割區。")}</p>`,
      t("Resize", "調整"),
      async (f) => {
        const result = await tryApi("/storage/disks/resize", { machineId: disk.machineId, diskId: disk.diskId ?? disk.id, id: disk.diskId ?? disk.id, name: disk.diskName || disk.name, sizeGiB: Number(f.get("diskSize")) });
        if (!result.ok) throw result.unavailable ? new Error(unavailableMessage()) : result.error;
        await refresh(false);
        await loadStorage(true);
        notify(t("Disk resized.", "磁碟容量已調整。"));
      },
    );
    return true;
  }
  if (action.startsWith("disk-delete:")) {
    notify(unavailableMessage());
    return true;
  }
  if (action.startsWith("iso-use:")) {
    startWizard();
    createCfg.cdroms = [decodeURIComponent(action.slice(8))];
    persistDraft();
    render();
    return true;
  }
  if (action.startsWith("iso-delete:")) {
    const name = decodeURIComponent(action.slice(11));
    gate({
      title: t("Delete this ISO?", "刪除此 ISO？"),
      body: `<p><strong>${escape(name)}</strong></p><p>${t("The file is removed from the media library for good. Machines that use it will boot without it.", "檔案會從媒體庫永久移除，使用它的機器會在沒有它的情況下啟動。")}</p>`,
      confirmLabel: t("Slide to delete", "滑動以刪除"),
      doneText: t("Deleting", "正在刪除"),
      onConfirm: async () => {
        try {
          await apiDelete(`/storage/isos/${encodeURIComponent(name)}`);
        } catch (error) {
          throw [404, 405, 501].includes(error.status) ? new Error(unavailableMessage()) : error;
        }
        storage = null;
        await refresh(false);
        await loadStorage(true);
        notify(t("ISO deleted.", "ISO 已刪除。"));
      },
    });
    return true;
  }
  // Settings
  if (action.startsWith("seed:")) {
    appearance.seed = action.slice(5);
    try {
      localStorage.setItem("mq-seed", appearance.seed);
    } catch {
      /* private mode */
    }
    applySettings();
    rerenderQuiet();
    return true;
  }
  if (action.startsWith("theme:")) {
    await api("/preferences", { settings: { theme: action.slice(6) } });
    localStorage.setItem("mq-theme", action.slice(6));
    await refresh(false);
    rerenderQuiet();
    return true;
  }
  if (action.startsWith("switch:")) {
    const which = action.slice(7);
    if (which === "motion") {
      await api("/preferences", { settings: { motion: state.settings.motion === false } });
      await refresh(false);
    } else {
      appearance[which] = !appearance[which];
      thumbs.enabled = appearance.thumbs;
      try {
        localStorage.setItem(`mq-${which}`, String(appearance[which]));
      } catch {
        /* private mode */
      }
    }
    rerenderQuiet();
    return true;
  }
  return false;
}
document.addEventListener("error", (event) => {
  if (event.target?.matches?.("img.thumb")) {
    thumbs.failed.set(event.target.dataset.machine, Date.now());
    event.target.remove();
  }
}, true);
document.addEventListener("pointerdown", (event) => {
  const target = event.target.closest?.("button:not(:disabled):not(.switch)");
  if (!target || state?.settings.motion === false || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = target.getBoundingClientRect(),
    size = Math.max(rect.width, rect.height) * 2,
    dot = document.createElement("span");
  dot.className = "ripple";
  dot.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - rect.left - size / 2}px;top:${event.clientY - rect.top - size / 2}px`;
  target.append(dot);
  setTimeout(() => dot.remove(), 650);
});
// New machine form binding
document.addEventListener("input", (event) => {
  const el = event.target.closest?.("[data-f]");
  if (!el || page !== "new" || !createCfg) return;
  setPath(createCfg, el.dataset.f, coerce(el.value, el.dataset.type));
  const total = $("#vcpu-total");
  if (total) total.textContent = String(totalCpus(createCfg));
  persistDraft();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(requestPreview, 250);
});
document.addEventListener("change", (event) => {
  const el = event.target.closest?.("[data-f]");
  if (!el || page !== "new" || !createCfg) return;
  setPath(createCfg, el.dataset.f, coerce(el.value, el.dataset.type));
  if (el.dataset.f === "arch") {
    createCfg.machineType = state.capabilities[createCfg.arch]?.machine || "";
    createCfg.accelerator = "tcg";
  }
  if (el.dataset.f === "firmware" && createCfg.firmware !== "uefi") createCfg.secureBoot = false;
  persistDraft();
  rerenderQuiet();
});
document.addEventListener("submit", (event) => {
  if (event.target.id === "machine-form") {
    event.preventDefault();
    document.querySelector('[data-action="wizard-create"]')?.click();
  }
});
// Storage drop zone and file picker
document.addEventListener("change", (event) => {
  if (event.target.id === "storage-file" && event.target.files[0]) {
    startUpload(event.target.files[0]);
    event.target.value = "";
  }
  if (event.target.dataset?.personRole) {
    api(`/users/${event.target.dataset.personRole}`, { role: event.target.value })
      .then(() => notify(t("Role changed. They are signed out and get the new role next time.", "角色已更改。對方已登出，下次登入時使用新角色。")))
      .catch((error) => notify(localizeServerError(error.message, t)))
      .then(() => loadPeople());
  }
  if (event.target.id === "firmware-file" && event.target.files[0]) {
    const file = event.target.files[0];
    event.target.value = "";
    firmwareUpload = { message: t(`Uploading ${file.name}…`, `正在上載 ${file.name}…`) };
    rerenderQuiet();
    uploadFile(`/api/firmware?name=${encodeURIComponent(file.name)}`, file, session.csrf, () => {}).promise
      .then((r) => { firmwareUpload = { message: t(`Added ${r.name}.`, `已新增 ${r.name}。`) }; })
      .catch((error) => { firmwareUpload = { error: true, message: localizeServerError(error.message, t) }; })
      .then(() => loadFirmware())
      .then(() => { if (page === "storage") render(); });
  }
  if (event.target.id === "seed-custom") {
    appearance.seed = event.target.value;
    try {
      localStorage.setItem("mq-seed", appearance.seed);
    } catch {
      /* private mode */
    }
    applySettings();
    rerenderQuiet();
  }
  if (event.target.id === "language") {
    api("/preferences", { settings: { language: event.target.value } })
      .then(() => refresh(false))
      .then(rerenderQuiet)
      .catch((error) => notify(error.message));
  }
});
for (const type of ["dragover", "dragleave", "drop"])
  document.addEventListener(type, (event) => {
    const zone = event.target.closest?.("#dropzone");
    if (!zone) return;
    event.preventDefault();
    zone.classList.toggle("over", type === "dragover");
    if (type === "drop") startUpload(event.dataTransfer?.files?.[0]);
  });

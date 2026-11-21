// Builds the documentation site (GitHub Pages) into site/ from the repository:
// task-led home page, screenshot guides, every article in docs/features, every
// prepared wiki page, a search index and the screenshots they use. Fonts are
// copied from node_modules, so the site makes no third-party requests.
// Usage: node scripts/build-site.mjs [out-dir]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdown, plainText, inline } from "./markdown.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.argv[2] || path.join(root, "site"));
const repoUrl = "https://github.com/Ding-Ding-Projects/material-qemu";
const posix = path.posix;
const read = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const write = (rel, text) => { mkdirSync(path.dirname(path.join(out, rel)), { recursive: true }); writeFileSync(path.join(out, rel), text); };
const copied = new Set();
const copyRepoFile = (repoPath) => {
  if (!copied.has(repoPath) && existsSync(path.join(root, repoPath))) {
    mkdirSync(path.dirname(path.join(out, "files", repoPath)), { recursive: true });
    copyFileSync(path.join(root, repoPath), path.join(out, "files", repoPath));
    copied.add(repoPath);
  }
  return `files/${repoPath}`;
};

// Articles and wiki pages.
const articleFiles = readdirSync(path.join(root, "docs/features")).filter((f) => f.endsWith(".md")).sort();
const slugOf = (file) => (file === "README.md" ? "feature-index" : file.replace(/\.md$/, ""));
const titleOf = (text, fallback) => (text.match(/^#\s+(.+)$/m)?.[1] || fallback).replace(/[`*_]/g, "").trim();
const articles = articleFiles.map((file) => {
  const text = read(`docs/features/${file}`);
  return { file, slug: slugOf(file), title: titleOf(text, file), text };
});
const wikiDir = "docs/wiki/pending";
const wikiFiles = readdirSync(path.join(root, wikiDir)).filter((f) => f.endsWith(".md") && f !== "_Sidebar.md").sort((a, b) => (a === "Home.md" ? -1 : b === "Home.md" ? 1 : a.localeCompare(b)));
const wiki = wikiFiles.map((file) => {
  const text = read(`${wikiDir}/${file}`);
  return { file, slug: file === "Home.md" ? "index" : file.replace(/\.md$/, ""), title: titleOf(text, file), text };
});

// Rewrites a Markdown link written relative to a repository file into a site link
// relative to the page being written.
function linker(sourceRepoPath, pageRel, kind) {
  const up = "../".repeat(pageRel.split("/").length - 1);
  return (href, isImage) => {
    if (/^[a-z]+:|^#/.test(href)) return href;
    const [p, hash] = href.split("#");
    const suffix = hash ? `#${hash}` : "";
    if (kind === "wiki" && /^[\w.-]+$/.test(p) && !p.includes(".")) {
      return `${up}wiki/${p === "Home" ? "index" : p}.html${suffix}`;
    }
    const repoPath = posix.normalize(posix.join(posix.dirname(sourceRepoPath), p));
    if (/^docs\/features\/[\w.-]+\.md$/.test(repoPath)) return `${up}articles/${slugOf(posix.basename(repoPath))}.html${suffix}`;
    if (repoPath === "README.md") return `${up}index.html${suffix}`;
    if (repoPath === "ROADMAP.md" || repoPath.endsWith(".md")) return `${repoUrl}/blob/main/${repoPath}${suffix}`;
    if (isImage || /\.(png|jpe?g|gif|svg|webm)$/i.test(repoPath)) return up + copyRepoFile(repoPath);
    return `${repoUrl}/blob/main/${repoPath}${suffix}`;
  };
}

const sections = [["index.html", "Home", "主頁"], ["guides/index.html", "Guides", "指南"], ["articles/index.html", "Articles", "文章"], ["wiki/index.html", "Wiki", "維基"]];
function page({ rel, title, section, body, description = "Material QEMU documentation" }) {
  const up = "../".repeat(rel.split("/").length - 1);
  const nav = sections.map(([href, en, yue]) => `<a href="${up}${href}" data-i18n="${esc(en)}" data-yue="${esc(yue)}"${section === en ? ' aria-current="page"' : ""}>${en}</a>`).join("");
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Material QEMU</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="${up}assets/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${up}assets/site.css">
<script>try{const t=localStorage.getItem("mq-docs-theme")||"system";document.documentElement.dataset.theme=t==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):t;}catch{}</script>
</head>
<body data-root="${up}">
<a class="skip" href="#main" data-i18n="Skip to content" data-yue="跳到內容">Skip to content</a>
<header class="top">
<a class="brand" href="${up}index.html"><span class="mark" aria-hidden="true">Q</span><span>Material QEMU</span></a>
<nav class="sections" aria-label="Sections">${nav}</nav>
<span class="grow"></span>
<label class="sr-only" for="lang">Language</label>
<select id="lang" class="pill"><option value="en">English</option><option value="yue">廣東話</option><option value="both">English + 廣東話</option></select>
<button type="button" class="pill" id="theme" aria-label="Theme">◐</button>
</header>
<main id="main" tabindex="-1">${body}</main>
<footer class="foot"><span data-i18n="Generated from the repository's documentation." data-yue="由儲存庫的文件產生。">Generated from the repository's documentation.</span> <a href="${repoUrl}">GitHub</a> · <a href="${repoUrl}/releases/latest" data-i18n="Latest release" data-yue="最新版本">Latest release</a></footer>
<script src="${up}assets/site.js" type="module"></script>
</body>
</html>
`;
}

const searchBlock = (placeholder = "Search guides, articles and wiki pages") => `<div class="search" role="search">
<label class="searchbox"><span aria-hidden="true">⌕</span><span class="sr-only" data-i18n="Search" data-yue="搜尋">Search</span><input id="q" type="search" autocomplete="off" placeholder="${placeholder}" data-i18n-placeholder="${placeholder}" data-yue-placeholder="搜尋指南、文章和維基"></label>
<button type="button" id="regex-toggle" class="regex-btn" aria-pressed="false" aria-controls="regex-builder">.* <span data-i18n="Regex" data-yue="正規表達式">Regex</span></button>
</div>
<section id="regex-builder" class="builder" hidden aria-label="Regular expression builder">
<div class="builder-row"><label for="rx" data-i18n="Pattern" data-yue="樣式">Pattern</label><input id="rx" class="mono" autocomplete="off" spellcheck="false" placeholder="(vmware|virtualbox)\\s+\\w+"></div>
<div class="builder-row flags" role="group" aria-label="Flags">
<label><input type="checkbox" id="flag-i" checked> <span data-i18n="i · ignore case" data-yue="i · 不分大小寫">i · ignore case</span></label>
<label><input type="checkbox" id="flag-m"> <span data-i18n="m · multiline" data-yue="m · 多行">m · multiline</span></label>
<label><input type="checkbox" id="flag-s"> <span data-i18n="s · dot matches newline" data-yue="s · 點號配對換行">s · dot matches newline</span></label>
<label><input type="checkbox" id="scope-title"> <span data-i18n="Titles only" data-yue="只搜標題">Titles only</span></label>
</div>
<div class="builder-row tokens" aria-label="Insert"><span data-i18n="Insert" data-yue="插入">Insert</span>${[["\\d", "digit"], ["\\w", "word"], ["\\s", "space"], [".", "any"], ["*", "0 or more"], ["+", "1 or more"], ["?", "optional"], ["|", "or"], ["^", "start"], ["$", "end"], ["( )", "group"], ["[ ]", "set"]].map(([tok, label]) => `<button type="button" class="token" data-token="${esc(tok)}" title="${esc(label)}">${esc(tok)}</button>`).join("")}</div>
<p id="rx-status" class="muted" role="status"></p>
</section>
<div id="results" class="results" hidden aria-live="polite"></div>`;

// Guides: screenshot steppers.
const installSteps = read("evidence/installer-virtualbox/steps.tsv").trim().split("\n").map((l) => l.split("\t")).map(([file, title]) => ({ title, image: copyRepoFile(`evidence/installer-virtualbox/${file}`) }));
const walk = JSON.parse(read("evidence/walkthrough/walkthrough.json"));
const firstRunSteps = walk.steps.map((s) => ({ title: s.title, image: copyRepoFile(`evidence/walkthrough/${s.file}`) }));
const guides = [
  { slug: "install-on-a-pc", title: "Install on a PC", yue: "安裝到電腦", icon: "💿", intro: "Boot the installer ISO from a USB drive (written with Rufus, balenaEtcher, dd or the deploy assistant) and install Material QEMU onto the computer's own disk. Screenshots from release 0.1.0-build.32 in a VirtualBox VM; a real PC shows the same screens.", steps: installSteps },
  { slug: "first-run", title: "First run and your first machine", yue: "首次使用及第一部機器", icon: "＋", intro: "From the first-run page to a running UEFI machine with a snapshot, then a safe power off. Screenshots from one run against a fresh server.", steps: firstRunSteps },
];
for (const g of guides) {
  const rel = `guides/${g.slug}.html`;
  const items = g.steps.map((s, i) => `<li><button type="button" data-step="${i}"><span class="dot">${i + 1}</span><span>${inline(s.title)}</span></button></li>`).join("");
  const figures = g.steps.map((s, i) => `<figure class="step" data-index="${i}"${i ? " hidden" : ""}><figcaption><span class="eyebrow">${esc(g.title)} · <span data-i18n="step" data-yue="步驟">step</span> ${i + 1} / ${g.steps.length}</span><span class="step-title">${inline(s.title)}</span></figcaption><img src="../${s.image}" alt="${esc(s.title)}" loading="${i ? "lazy" : "eager"}"></figure>`).join("");
  write(rel, page({ rel, title: g.title, section: "Guides", description: g.intro, body: `<div class="guide" data-guide="${g.slug}" data-count="${g.steps.length}">
<nav class="steps" aria-label="Steps"><ol>${items}</ol></nav>
<article><h1>${esc(g.title)}</h1><p class="lead">${esc(g.intro)}</p>${figures}
<div class="stepper"><button type="button" class="outlined" data-move="-1" data-i18n="Back" data-yue="上一步">Back</button><button type="button" class="filled" data-move="1" data-i18n="Next step" data-yue="下一步">Next step</button><span class="grow"></span><span class="muted" data-i18n="Your place is saved in this browser." data-yue="進度會儲存在此瀏覽器。">Your place is saved in this browser.</span></div>
</article></div>` }));
}
write("guides/index.html", page({ rel: "guides/index.html", title: "Guides", section: "Guides", body: `<h1 data-i18n="Guides" data-yue="指南">Guides</h1><div class="cards">${guides.map((g) => `<a class="card" href="${g.slug}.html"><span class="icon" aria-hidden="true">${g.icon}</span><strong>${esc(g.title)}</strong><span class="muted">${esc(g.intro)}</span><span class="cta">${g.steps.length} <span data-i18n="steps" data-yue="個步驟">steps</span></span></a>`).join("")}</div>` }));

// Articles and wiki pages.
const index = [];
function docPage(kind, item, list, listTitle) {
  const rel = `${kind}/${item.slug}.html`;
  const source = kind === "articles" ? `docs/features/${item.file}` : `${wikiDir}/${item.file}`;
  const { html, headings } = renderMarkdown(item.text, { link: linker(source, rel, kind === "wiki" ? "wiki" : "doc") });
  const toc = headings.filter((h) => h.level === 2).map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join("");
  const side = list.map((a) => `<li><a href="${a.slug}.html"${a.slug === item.slug ? ' aria-current="page"' : ""}>${esc(a.title)}</a></li>`).join("");
  write(rel, page({ rel, title: item.title, section: kind === "articles" ? "Articles" : "Wiki", body: `<div class="doc"><nav class="side" aria-label="${listTitle}"><p class="eyebrow">${listTitle}</p><ul>${side}</ul></nav><article class="prose">${html}<p class="source"><a href="${repoUrl}/blob/main/${source}" data-i18n="View the source on GitHub" data-yue="在 GitHub 查看原文">View the source on GitHub</a></p></article>${toc ? `<nav class="toc" aria-label="On this page"><p class="eyebrow" data-i18n="On this page" data-yue="本頁內容">On this page</p><ul>${toc}</ul></nav>` : '<span></span>'}</div>` }));
  index.push({ title: item.title, url: rel, section: kind === "articles" ? "Article" : "Wiki", text: plainText(item.text).slice(0, 6000) });
}
for (const a of articles) docPage("articles", a, articles, "Articles");
for (const w of wiki) docPage("wiki", w, wiki, "Wiki");
for (const g of guides) index.push({ title: g.title, url: `guides/${g.slug}.html`, section: "Guide", text: `${g.intro} ${g.steps.map((s) => s.title).join(" ")}` });

// Home: tasks first.
const tasks = [
  ["🖥", "Host it in VirtualBox or VMware", "The deploy assistant imports the appliance, bridges it onto your network and shows its address when it is ready.", "articles/vm-hosting.html", "Read the guide"],
  ["💿", "Install on a PC", "Boot the installer ISO from a USB drive and choose the disk. Eight screenshots, step by step.", "guides/install-on-a-pc.html", "Start step 1"],
  ["＋", "Create your first machine", "Firmware, disks, network and display, with a live launch preview from the server.", "guides/first-run.html", "Open the walkthrough"],
  ["⟳", "Update an appliance", "Check, then update from Settings. Machines, disks and settings are kept; a failed update rolls back.", "articles/vm-hosting.html#updating-an-appliance", "Read how"],
  ["⌨", "Use the console", "Keys, screenshots, recording, annotation and releasing input with Ctrl+Alt.", "articles/console.html", "Read the article"],
  ["⚙", "Every QEMU option", "UEFI, Secure Boot, TPM, CPU models, disks, NICs, snapshots, storage and import.", "articles/qemu-hardware.html", "See the options"],
];
const home = `<section class="hero"><p class="eyebrow" data-i18n="Documentation" data-yue="文件">Documentation</p><h1 data-i18n="Run virtual machines on hardware you own." data-yue="喺你自己嘅硬件上運行虛擬機。">Run virtual machines on hardware you own.</h1><p class="lead" data-i18n="Start with what you want to do. The guides use real screenshots of the current release." data-yue="由你想做的事開始，指南用的都是目前版本的真實截圖。">Start with what you want to do. The guides use real screenshots of the current release.</p></section>
${searchBlock()}
<div class="cards">${tasks.map(([icon, title, text, href, cta]) => `<a class="card" href="${href}"><span class="icon" aria-hidden="true">${icon}</span><strong>${esc(title)}</strong><span class="muted">${esc(text)}</span><span class="cta">${esc(cta)} →</span></a>`).join("")}</div>
<section class="release"><strong data-i18n="Downloads" data-yue="下載">Downloads</strong><span class="muted" data-i18n="Installer ISO, VM appliance (OVA), USB image and the Windows deploy assistant are attached to every release." data-yue="每個版本都附有安裝 ISO、虛擬機設備 (OVA)、USB 映像及 Windows 部署助手。">Installer ISO, VM appliance (OVA), USB image and the Windows deploy assistant are attached to every release.</span><a class="filled" href="${repoUrl}/releases/latest" data-i18n="Latest release" data-yue="最新版本">Latest release</a></section>
<section><h2 data-i18n="See it" data-yue="睇下樣">See it</h2><div class="shots">${["16-dashboard-running", "13-machine-running", "18-storage"].map((n) => { const f = copyRepoFile(`evidence/walkthrough/${n}.png`); return `<img src="${f}" alt="${esc(walk.steps.find((s) => s.file.startsWith(n))?.title || n)}" loading="lazy">`; }).join("")}</div></section>`;
write("index.html", page({ rel: "index.html", title: "Material QEMU documentation", section: "Home", body: home }));
write("articles/index.html", page({ rel: "articles/index.html", title: "Articles", section: "Articles", body: `<h1 data-i18n="Articles" data-yue="文章">Articles</h1>${searchBlock("Search articles")}<ul class="list">${articles.map((a) => `<li><a href="${a.slug}.html"><strong>${esc(a.title)}</strong><span class="muted">${esc(plainText(a.text.replace(/^#.*$/m, "")).slice(0, 180))}…</span></a></li>`).join("")}</ul>` }));
write("search-index.json", JSON.stringify(index));
mkdirSync(path.join(out, "assets", "fonts"), { recursive: true });
copyFileSync(path.join(root, "node_modules/@fontsource-variable/roboto-flex/files/roboto-flex-latin-full-normal.woff2"), path.join(out, "assets/fonts/roboto-flex.woff2"));
for (const f of ["site.css", "site.js", "icon.svg"]) copyFileSync(path.join(root, "site-src", f), path.join(out, "assets", f));
write(".nojekyll", "");
console.log(`Site written to ${out}: ${articles.length} articles, ${wiki.length} wiki pages, ${guides.length} guides, ${copied.size} files.`);

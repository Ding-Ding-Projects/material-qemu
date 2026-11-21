// Checks the documentation site in headless Microsoft Edge, locally or live:
// every internal link and image on every page resolves, search and the regex
// builder find results and reject an invalid pattern, guide steppers move and
// remember their step after a reload, the language switch changes the site's
// words, and pages do not scroll sideways at phone width. Saves screenshots.
// Usage: node scripts/verify-site.mjs <site-root-url> <out-dir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { stopBrowser, ensurePortFree } from "./browser-process.mjs";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const [rootUrl, outDir] = process.argv.slice(2);
const site = rootUrl.endsWith("/") ? rootUrl : `${rootUrl}/`;
mkdirSync(outDir, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail); };

// 1. Crawl every page reachable from the home page and check links and images.
const seen = new Set(), queue = [site], broken = [];
const okUrls = new Map();
async function status(url) {
  if (okUrls.has(url)) return okUrls.get(url);
  const r = await fetch(url, { method: "GET" }).catch(() => null);
  const s = r ? r.status : 0;
  okUrls.set(url, s);
  return s;
}
while (queue.length) {
  const url = queue.shift();
  if (seen.has(url)) continue;
  seen.add(url);
  const r = await fetch(url).catch(() => null);
  if (!r || !r.ok) { broken.push(`${url} -> ${r ? r.status : "no response"}`); continue; }
  if (!(r.headers.get("content-type") || "").includes("html")) continue;
  const html = await r.text();
  for (const [, attr, value] of html.matchAll(/\s(href|src)="([^"]+)"/g)) {
    if (/^(mailto:|javascript:|data:)/.test(value)) continue;
    const abs = new URL(value, url);
    const hash = abs.hash; abs.hash = "";
    if (!abs.href.startsWith(site)) continue;
    if (attr === "href" && /\.html$|\/$/.test(abs.pathname)) {
      if (!seen.has(abs.href)) queue.push(abs.href);
      if (hash && hash !== "#main") {
        const target = await fetch(abs.href).then((x) => x.text()).catch(() => "");
        if (!target.includes(`id="${decodeURIComponent(hash.slice(1))}"`)) broken.push(`${url} -> ${value} (anchor missing)`);
      }
    } else if ((await status(abs.href)) !== 200) broken.push(`${url} -> ${value} (${okUrls.get(abs.href)})`);
  }
}
check("every page, link, anchor and image resolves", broken.length === 0, `${seen.size} pages; ${broken.slice(0, 5).join(" | ")}`);
const pages = [...seen].filter((u) => /\.html$|\/$/.test(new URL(u).pathname));

// 2. Interactions in Edge.
const port = 9350;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-site-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
process.on("exit", () => stopBrowser(edge));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.once("open", r));
let seq = 0; const pending = new Map();
ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (body) => { const r = await send("Runtime.evaluate", { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? "EXC " + (r.result.exceptionDetails.exception?.description || "").slice(0, 300) : r.result?.result?.value; };
const go = async (url, wait = 1500) => { await send("Page.navigate", { url }); await sleep(wait); };
const shot = async (name) => { await sleep(500); const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.result.data, "base64")); };
await send("Page.enable"); await send("Runtime.enable");
const desktop = () => send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await desktop();
await go(site, 2500);
await shot("home-dark");
// Plain search.
await ev(`const q=document.querySelector('#q'); q.value='snapshot'; q.dispatchEvent(new Event('input',{bubbles:true})); return 1;`); await sleep(1200);
const plain = await ev(`return document.querySelectorAll('#results a').length`);
check("plain search finds pages", plain > 0, `${plain} results for "snapshot"`);
// Regex builder.
await ev(`document.querySelector('#regex-toggle').click(); const r=document.querySelector('#rx'); r.value='(vmware|virtualbox)\\\\s+\\\\w+'; r.dispatchEvent(new Event('input',{bubbles:true})); return 1;`); await sleep(1200);
const rxStatus = await ev(`return document.querySelector('#rx-status').textContent`);
check("the regex builder finds matches", /Valid · [1-9]\d* matches/.test(rxStatus), rxStatus);
await shot("home-regex");
await ev(`const r=document.querySelector('#rx'); r.value='(unclosed'; r.dispatchEvent(new Event('input',{bubbles:true})); return 1;`); await sleep(600);
const invalid = await ev(`return document.querySelector('#rx').getAttribute('aria-invalid')+' '+document.querySelector('#rx-status').textContent`);
check("an invalid pattern is reported, not run", /^true Invalid pattern/.test(invalid), invalid);
// Guide stepper and remembered step.
await go(`${site}guides/install-on-a-pc.html`, 2000);
await ev(`document.querySelector('[data-move="1"]').click(); document.querySelector('[data-move="1"]').click(); return 1;`); await sleep(600);
await go(`${site}guides/install-on-a-pc.html`, 2000);
const step = await ev(`return [...document.querySelectorAll('.step')].findIndex(f=>!f.hidden)`);
check("a guide remembers its step after a reload", step === 2, `showing step ${step + 1}`);
await shot("guide-install");
// Language.
await ev(`const s=document.querySelector('#lang'); s.value='yue'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1;`); await sleep(500);
const navText = await ev(`return [...document.querySelectorAll('.sections a')].map(a=>a.textContent).join(' ')`);
check("the language switch changes the site's words", /主頁/.test(navText) && /指南/.test(navText), navText);
await shot("guide-cantonese");
await ev(`const s=document.querySelector('#lang'); s.value='en'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1;`);
// Article page and light theme.
await go(`${site}articles/vm-hosting.html`, 2000);
await ev(`localStorage.setItem('mq-docs-theme','light'); return 1;`);
await go(`${site}articles/vm-hosting.html`, 2000);
check("the light theme applies", (await ev(`return document.documentElement.dataset.theme`)) === "light");
await shot("article-light");
await ev(`localStorage.setItem('mq-docs-theme','dark'); return 1;`);
// Phone width on every page.
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
const wide = [];
for (const url of pages) {
  await go(url, 900);
  const over = await ev(`return document.documentElement.scrollWidth - innerWidth`);
  if (over > 0) wide.push(`${url.replace(site, "")} (+${over}px)`);
}
check("no page scrolls sideways at 375 pixels", wide.length === 0, `${pages.length} pages checked; ${wide.slice(0, 5).join(" | ")}`);
await go(site, 1500); await shot("home-phone");
writeFileSync(path.join(outDir, "site-check.json"), JSON.stringify({ site, at: new Date().toISOString(), pages: pages.length, results }, null, 2));
ws.close(); stopBrowser(edge);
process.exit(results.every((r) => r.ok) ? 0 : 1);

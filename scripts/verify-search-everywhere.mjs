// Checks in headless Microsoft Edge that the header search also finds disk
// images, ISOs and help articles, with plain text and with a regular
// expression, that a help result opens the article, and that the command
// palette has its own regular expression search.
// Usage: node scripts/verify-search-everywhere.mjs <origin> <password> <out-dir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { stopBrowser, ensurePortFree } from "./browser-process.mjs";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const [origin, password, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const port = 9357;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-se-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail); };
const typeSearch = (text) => ev(`const i=document.querySelector('#global-search'); i.value=${JSON.stringify(text)}; i.dispatchEvent(new Event('input',{bubbles:true})); return 1;`);
const elsewhere = () => ev(`return document.querySelector('#search-elsewhere')?.innerText.replace(/\\s+/g,' ') || ''`);
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.result.data, "base64")); };
const setSearch = (opts) => ev(`localStorage.setItem('mq-search', JSON.stringify(${JSON.stringify(opts)})); return 1;`);
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
await ev(`let s=await (await fetch('/api/session')).json();
const post=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify(b)});
if(s.setupRequired) await post('/api/setup',{name:'owner',username:'owner',password:${JSON.stringify(password)}});
else if(!s.authenticated) await post('/api/login',{username:'owner',password:${JSON.stringify(password)}});
s=await (await fetch('/api/session')).json();
await post('/api/preferences',{setup:{step:8,complete:true},settings:{language:'en'}});
const st=await (await fetch('/api/state')).json();
const mk=(name)=>post('/api/machines',{name,arch:'x86_64',machineType:'q35',accelerator:'tcg',cpus:1,memory:512,diskGiB:1,network:'none'});
if(!st.machines.length){ await mk('debian-13-dev'); await mk('win11-test'); await mk('ubuntu-server'); }
return 1;`);
await setSearch({ regex: false, flags: { i: true }, fields: ["name", "notes", "folder", "tags", "arch"] });
await send("Page.navigate", { url: origin }); await sleep(3000);
await ev(`document.querySelector('[data-action="page:machines"]').click(); return 1;`); await sleep(1000);

await typeSearch("netinst"); await sleep(2500);
let text = await elsewhere();
check("Plain search finds an ISO by name", /ISO images 1/.test(text) && text.includes("debian-13.1-amd64-netinst.iso"), text.slice(0, 160));
await typeSearch("snapshot"); await sleep(1200);
text = await elsewhere();
check("Plain search finds help articles", /Help articles \d/.test(text), text.slice(0, 160));
await ev(`document.querySelector('#search-elsewhere').scrollIntoView({block:'center'}); return 1;`); await sleep(300); await shot("plain-help");

await setSearch({ regex: true, flags: { i: true }, fields: ["name"] });
await send("Page.navigate", { url: origin }); await sleep(3000);
await ev(`document.querySelector('[data-action="page:machines"]').click(); return 1;`); await sleep(1000);
await typeSearch("^win\\d+"); await sleep(2500);
text = await elsewhere();
check("Regex search finds the disk of the matching machine", /Disk images 1/.test(text) && /win11-test/.test(text), text.slice(0, 200));
await ev(`document.querySelector('#search-elsewhere').scrollIntoView({block:'center'}); return 1;`); await sleep(300); await shot("regex-disks");

await typeSearch("trusted\\s+ISO"); await sleep(1200);
const before = await ev(`return document.querySelectorAll('[data-action^="open-doc:"]').length`);
await ev(`document.querySelector('[data-action^="open-doc:"]').click(); return 1;`); await sleep(1500);
const opened = await ev(`const a=document.activeElement; return [location.hash, a?.tagName, a?.classList.contains('flash'), (a?.innerText||'').slice(0,40)].join('|')`);
check("A help result opens and focuses that article", before >= 1 && /ARTICLE\|true/.test(opened), opened);
await shot("doc-opened");

// Command palette: its own regex search.
await ev(`document.querySelector('[data-action="commands"]').click(); for (let i = 0; i < 40 && !document.querySelector('[data-action="palette-regex"]'); i++) await new Promise((r) => setTimeout(r, 100)); return 1;`); await sleep(300);
const wasRegex = await ev(`return document.querySelector('[data-action="palette-regex"]').getAttribute('aria-pressed')`);
await ev(`document.querySelector('[data-action="palette-regex"]').click(); return 1;`); await sleep(300);
await ev(`const i=document.querySelector('#command-search'); i.value='^(theme|language)$'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1;`); await sleep(400);
const palette = await ev(`return [document.querySelector('#palette-status')?.innerText, [...document.querySelectorAll('#command-results .command-entry strong')].map(e=>e.innerText).join(',')].join(' | ')`);
check("The palette's regex search filters commands and reports the count", wasRegex === "false" && /^2 of \d+ match\. \| Theme,Language$/.test(palette), palette);
const explained = await ev(`return document.querySelectorAll('#palette-explain li').length`);
check("The palette explains its pattern", explained >= 5, String(explained));
await ev(`const i=document.querySelector('#command-search'); i.value='(theme'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1;`); await sleep(300);
const invalid = await ev(`return [document.querySelector('#palette-status')?.innerText, document.querySelector('#command-search').hasAttribute('aria-invalid')].join(' | ')`);
check("An invalid palette pattern is reported, not silently empty", /^Not a valid pattern/.test(invalid) && invalid.endsWith("true"), invalid);
await ev(`const i=document.querySelector('#command-search'); i.value='^(theme|language)$'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1;`); await sleep(300);
await shot("palette-regex");
const headerQuery = await ev(`return document.querySelector('#global-search').value`);
check("The palette search is independent of the header search", headerQuery === "trusted\\s+ISO", headerQuery);
writeFileSync(path.join(outDir, "search-everywhere.json"), JSON.stringify({ origin, at: new Date().toISOString(), results }, null, 2));
ws.close(); stopBrowser(edge);
process.exit(results.every((r) => r.ok) ? 0 : 1);

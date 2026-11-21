// Checks the header search and its regular expression builder in headless
// Microsoft Edge against a real server: plain text filters machines, the
// builder filters with flags and chosen fields, insert buttons edit the
// pattern, an invalid pattern is reported, and the choice survives a reload.
// Usage: node scripts/verify-search.mjs <origin> <password> <out-dir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const [origin, password, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const port = 9351;
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-search-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
const shown = () => ev(`return [...document.querySelectorAll('#machine-results .machine h3, #machine-results tr[data-machine] td:first-child')].map(h=>h.textContent).sort().join(',')`);
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
await ev(`let s=await (await fetch('/api/session')).json();
const post=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify(b)});
if(s.setupRequired) await post('/api/setup',{name:'owner',username:'owner',password:${JSON.stringify(password)}});
else if(!s.authenticated) await post('/api/login',{username:'owner',password:${JSON.stringify(password)}});
s=await (await fetch('/api/session')).json();
await post('/api/preferences',{setup:{step:8,complete:true}});
const st=await (await fetch('/api/state')).json();
const mk=(name,arch,notes)=>post('/api/machines',{name,arch,machineType:arch==='x86_64'?'q35':undefined,accelerator:'tcg',cpus:1,memory:512,diskGiB:1,network:'none',notes});
if(!st.machines.length){ await mk('debian-13-dev','x86_64','build box'); await mk('win11-test','x86_64','games'); await mk('ubuntu-server','x86_64','web'); }
return 1;`);
await send("Page.navigate", { url: origin }); await sleep(3000);
await ev(`document.querySelector('[data-action="page:machines"]').click(); return 1;`); await sleep(1200);
await typeSearch("debian"); await sleep(600);
check("plain text search filters machines", (await shown()) === "debian-13-dev", await shown());
// The page redraws on a timer; a click on a button replaced just before it is lost,
// so the toggle is clicked again only while the builder is still closed.
for (let tries = 0; tries < 4 && !(await ev(`return !!document.querySelector('#regex-panel')`)); tries++) {
  await ev(`document.querySelector('[data-action="regex-toggle"]').click(); return 1;`); await sleep(1000);
}
check("the regex toggle opens the builder beside the search", (await ev(`return !!document.querySelector('#regex-panel') && document.querySelector('[data-action="regex-toggle"]').getAttribute('aria-pressed')`)) === "true");
await typeSearch("^(debian|win)"); await sleep(600);
check("a pattern filters machines", (await shown()) === "debian-13-dev,win11-test", await shown());
const status = await ev(`return document.querySelector('#regex-status').textContent`);
check("the builder reports the match count", /2 of 3 machines match/.test(status), status);
await ev(`const c=document.querySelector('[data-search-field="name"]'); c.checked=false; c.dispatchEvent(new Event('change',{bubbles:true})); return 1;`); await sleep(500);
check("unticking a field narrows what is searched", (await shown()) === "", (await shown()) || "no machines");
await ev(`const c=document.querySelector('[data-search-field="name"]'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); return 1;`); await sleep(400);
await typeSearch("^DEBIAN"); await ev(`const c=document.querySelector('[data-search-flag="i"]'); c.checked=false; c.dispatchEvent(new Event('change',{bubbles:true})); return 1;`); await sleep(500);
check("turning off ignore-case makes the pattern case-sensitive", (await shown()) === "", (await shown()) || "no machines");
await ev(`const c=document.querySelector('[data-search-flag="i"]'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); return 1;`); await sleep(400);
await typeSearch("server"); await ev(`const i=document.querySelector('#global-search'); i.setSelectionRange(0,0); return 1;`);
await ev(`document.querySelector('[data-token="^"]').click(); return 1;`); await sleep(400);
check("insert buttons edit the pattern at the cursor", (await ev(`return document.querySelector('#global-search').value`)) === "^server", await ev(`return document.querySelector('#global-search').value`));
await typeSearch("(unclosed"); await sleep(500);
const bad = await ev(`return document.querySelector('#global-search').hasAttribute('aria-invalid')+' '+document.querySelector('#regex-status').textContent`);
check("an invalid pattern is reported", /^true Not a valid pattern/.test(bad), bad);
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(path.join(outDir, "regex-invalid.png"), Buffer.from(shot.result.data, "base64"));
await typeSearch("^(debian|win)"); await sleep(500);
const shot2 = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(path.join(outDir, "regex-search.png"), Buffer.from(shot2.result.data, "base64"));
await send("Page.navigate", { url: origin }); await sleep(3000);
check("regex mode is remembered after a reload", (await ev(`return document.querySelector('[data-action="regex-toggle"]').getAttribute('aria-pressed')`)) === "true");
writeFileSync(path.join(outDir, "search.json"), JSON.stringify({ origin, at: new Date().toISOString(), results }, null, 2));
ws.close(); edge.kill();
process.exit(results.every((r) => r.ok) ? 0 : 1);

// Checks bulk snapshots and drag-to-folder in headless Microsoft Edge against a
// real server: two selected machines get a named snapshot from one action, and
// dragging a machine card onto a folder group moves it there.
// Usage: node scripts/verify-bulk-and-drag.mjs <origin> <password> <out-dir>
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
const port = 9353;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-bulk-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
const ids = JSON.parse(await ev(`let s=await (await fetch('/api/session')).json();
const post=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify(b)});
if(s.setupRequired) await post('/api/setup',{name:'owner',username:'owner',password:${JSON.stringify(password)}});
else if(!s.authenticated) await post('/api/login',{username:'owner',password:${JSON.stringify(password)}});
s=await (await fetch('/api/session')).json();
await post('/api/preferences',{setup:{step:8,complete:true}}); await post('/api/preferences',{folder:'Lab'});
let st=await (await fetch('/api/state')).json();
const mk=(name)=>post('/api/machines',{name,arch:'x86_64',machineType:'q35',accelerator:'tcg',cpus:1,memory:512,diskGiB:1,network:'none'});
if(st.machines.length<2){ await mk('bulk-one'); await mk('bulk-two'); st=await (await fetch('/api/state')).json(); }
for (const m of st.machines) if (m.folder) await fetch('/api/machines/'+m.id,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({folder:''})});
return JSON.stringify({ids:st.machines.slice(0,2).map(m=>m.id), folders: (await (await fetch('/api/state')).json()).folders});`));
console.log("folders", JSON.stringify(ids.folders));
await send("Page.navigate", { url: origin }); await sleep(3000);
await ev(`document.querySelector('[data-action="page:machines"]').click(); return 1;`); await sleep(1500);
// Bulk snapshot.
for (const id of ids.ids) await ev(`const c=document.querySelector('[data-check="${id}"]'); c.click(); return 1;`);
await sleep(600);
console.log("open", await ev(`const b=document.querySelector('[data-action="bulk-snapshot"]'); if(!b) return 'missing'; b.click(); return 'ok';`));
await sleep(800);
await ev(`const i=document.querySelector('#dialog-form [name="bulkSnapName"]'); i.value='bulk-check'; document.querySelector('#dialog-form').requestSubmit(); return 1;`);
await sleep(6000);
const snapped = [];
for (const id of ids.ids) snapped.push(await ev(`return (await (await fetch('/api/machines/${id}/snapshots')).json()).snapshots.some(s=>s.name==='bulk-check')`));
check("one action snapshots every selected machine", snapped.every(Boolean), JSON.stringify(snapped));
const resultText = await ev(`return document.querySelector('#dialog')?.textContent?.replace(/\\s+/g,' ').slice(0,160)`);
check("the results list each machine", /snapshot saved.*snapshot saved/.test(resultText), resultText);
let shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(path.join(outDir, "bulk-snapshot.png"), Buffer.from(shot.result.data, "base64"));
await ev(`document.querySelector('#dialog').close(); return 1;`);
// Drag a card onto the Lab folder group.
await send("Page.navigate", { url: origin }); await sleep(3000);
await ev(`document.querySelector('[data-action="page:machines"]').click(); return 1;`); await sleep(1500);
const dragged = ids.ids[0];
const drop = await ev(`const card=document.querySelector('[data-drag-machine="${dragged}"]');
const zone=document.querySelector('[data-drop-folder="Lab"]') || document.querySelector('[data-action="folder-filter:Lab"]');
if(!card||!zone) return 'missing '+(!card?'card':'zone');
const dt=new DataTransfer();
card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));
zone.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));
const marked=zone.classList.contains('drop-target');
zone.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
card.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}));
return 'dropped '+marked;`);
console.log("drag", drop);
await sleep(2500);
const folder = await ev(`return (await (await fetch('/api/state')).json()).machines.find(m=>m.id==='${dragged}').folder`);
check("dragging a card onto a folder moves the machine there", folder === "Lab", `folder "${folder}", ${drop}`);
check("the drop target is highlighted while dragging over it", /dropped true/.test(drop), drop);
shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(path.join(outDir, "after-drag.png"), Buffer.from(shot.result.data, "base64"));
writeFileSync(path.join(outDir, "bulk-and-drag.json"), JSON.stringify({ origin, at: new Date().toISOString(), results }, null, 2));
ws.close(); stopBrowser(edge);
process.exit(results.every((r) => r.ok) ? 0 : 1);

// Checks the Running jobs card in headless Microsoft Edge: an ISO upload,
// slowed down by the browser's network throttling, shows as a running job with
// byte progress on the dashboard, then as finished; a clone of a real machine
// is listed as finished; a refused resize is listed as failed with its reason.
// Usage: node scripts/verify-jobs.mjs <origin> <password> <out-dir>
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
const port = 9365;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-jb-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.result.data, "base64")); };
const jobs = () => ev(`return JSON.stringify((await (await fetch('/api/state')).json()).jobs.map((j)=>({kind:j.kind,label:j.label,state:j.state,fraction:j.fraction,error:j.error})))`).then((s) => JSON.parse(s));
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
const suffix = Date.now() % 1000000;
const machineId = await ev(`let s=await (await fetch('/api/session')).json();
const post=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify(b)});
if(s.setupRequired) await post('/api/setup',{name:'owner',username:'owner',password:${JSON.stringify(password)}});
else if(!s.authenticated) await post('/api/login',{username:'owner',password:${JSON.stringify(password)}});
s=await (await fetch('/api/session')).json();
await post('/api/preferences',{setup:{step:8,complete:true},settings:{language:'en'}});
const r=await post('/api/machines',{name:'jobs-source-${suffix}',arch:'x86_64',machineType:'q35',accelerator:'tcg',cpus:1,memory:256,disks:[{name:'system',sizeGiB:1,bus:'virtio',format:'qcow2'}],network:{mode:'none'}});
const m=await r.json(); return (m.machine||m).id;`);
await send("Page.navigate", { url: origin }); await sleep(2500);
// 12 MiB at 2 MiB/s: about six seconds of visible upload.
await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: 2 * 1024 * 1024 });
await ev(`const s=await (await fetch('/api/session')).json(); window.__upload = fetch('/api/media?name=' + encodeURIComponent('throttled-${suffix}.iso'), {method:'POST', headers:{'content-type':'application/octet-stream','x-csrf-token':s.csrf}, body:new Blob([new Uint8Array(12*1024*1024)])}).then((r)=>r.status); return 1;`);
let mid = null;
for (let i = 0; i < 40 && !mid; i++) { await sleep(300); const j = (await jobs()).find((x) => x.kind === "upload-iso" && x.label === `throttled-${suffix}.iso`); if (j?.state === "running" && j.fraction > 0.1 && j.fraction < 0.9) mid = j; }
check("A slow ISO upload is listed as a running job with its progress", Boolean(mid), JSON.stringify(mid));
await sleep(2200);
const card = await ev(`return document.querySelector('.jobs-card')?.innerText.replace(/\\s+/g,' ') || ''`);
check("The dashboard card shows the running upload with a percentage", /Uploading ISO/.test(card) && new RegExp(`throttled-${suffix}\\.iso`).test(card) && /\d+% · /.test(card), card.slice(0, 200));
const bar = await ev(`const b=document.querySelector('.jobs-card [role=progressbar]'); return b ? b.getAttribute('aria-valuenow') : 'none'`);
check("The progress bar reports its value to assistive technology", /^\d+$/.test(bar), bar);
await ev(`document.querySelector('.jobs-card')?.scrollIntoView({block:'center'}); return 1;`); await sleep(300); await shot("upload-running");
const status = await ev(`return await window.__upload`);
await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
const finished = (await jobs()).find((x) => x.label === `throttled-${suffix}.iso`);
check("The upload finishes and is listed as finished", status === 201 && finished?.state === "done", `${status} ${finished?.state}`);
const cloneStatus = await ev(`const s=await (await fetch('/api/session')).json(); const r=await fetch('/api/machines/${machineId}/clone',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({name:'jobs-clone-${suffix}'})}); return r.status`);
const clone = (await jobs()).find((x) => x.kind === "clone");
check("A real clone is listed as a finished job", cloneStatus === 200 && clone?.state === "done" && clone.label === `jobs-source-${suffix} → jobs-clone-${suffix}`, `${cloneStatus} ${JSON.stringify(clone)}`);
const resizeStatus = await ev(`const s=await (await fetch('/api/session')).json(); const r=await fetch('/api/storage/disks/resize',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({machineId:'${machineId}',diskId:'system',sizeGiB:0})}); return r.status`);
const resize = (await jobs()).find((x) => x.kind === "resize-disk");
check("A refused resize is listed as failed with the reason", resizeStatus >= 400 && resize?.state === "failed" && resize.error, `${resizeStatus} ${JSON.stringify(resize)}`);
await sleep(5500);
const after = await ev(`return document.querySelector('.jobs-card')?.innerText.replace(/\\s+/g,' ') || ''`);
check("The card lists finished and failed jobs after the dashboard refreshes", /Finished/.test(after) && /Failed/.test(after) && /Cloning machine/.test(after), after.slice(0, 260));
await ev(`document.querySelector('.jobs-card')?.scrollIntoView({block:'center'}); return 1;`); await sleep(300); await shot("jobs-finished");
await ev(`const s=await (await fetch('/api/session')).json(); await fetch('/api/storage/isos/' + encodeURIComponent('throttled-${suffix}.iso'),{method:'DELETE',headers:{'x-csrf-token':s.csrf}}); return 1;`);
writeFileSync(path.join(outDir, "jobs.json"), JSON.stringify({ origin, at: new Date().toISOString(), results }, null, 2));
ws.close(); stopBrowser(edge);
process.exit(results.every((r) => r.ok) ? 0 : 1);

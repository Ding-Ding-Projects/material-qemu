// Checks the guest agent tab in headless Microsoft Edge against real QEMU.
// Without a disk image: a machine with the channel starts with it on its
// command line and reports that no agent answered; one without the channel
// explains how to turn it on; unlisted questions are refused.
// Usage: node scripts/verify-guest-agent.mjs <origin> <password> <out-dir>
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { stopBrowser, ensurePortFree } from "./browser-process.mjs";
import { redactPaths } from "./redact-paths.mjs";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const [origin, password, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const suffix = Date.now() % 1000000;
const port = 9371;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-ga-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
const waitFor = (js, ms = 8000) => ev(`for (let i = 0; i < ${ms / 100}; i++) { if (${js}) return true; await new Promise((r) => setTimeout(r, 100)); } return false;`);
const click = (sel) => ev(`const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'missing'; e.click(); return 1;`);
const csrfPost = (url, body) => ev(`const s=await (await fetch('/api/session')).json(); const r=await fetch(${JSON.stringify(url)},{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify(${JSON.stringify(body)})}); return JSON.stringify({status:r.status, body:await r.json()});`).then(JSON.parse);
const openMachine = async (id) => {
  await ev(`const b=[...document.querySelectorAll('[data-action]')].find((x)=>x.dataset.action.includes('${id}') && /console|open/.test(x.dataset.action)); b?.click(); return 1;`);
  await waitFor(`document.querySelector('[data-action="machine-tab:agent"]')`);
  await click('[data-action="machine-tab:agent"]');
};
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
await ev(`let s=await (await fetch('/api/session')).json();
const post=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify(b)});
if(s.setupRequired) await post('/api/setup',{name:'owner',username:'owner',password:${JSON.stringify(password)}});
else if(!s.authenticated) await post('/api/login',{username:'owner',password:${JSON.stringify(password)}});
s=await (await fetch('/api/session')).json();
await post('/api/preferences',{setup:{step:8,complete:true},settings:{language:'en'}}); return 1;`);
const base = { arch: "x86_64", machineType: "q35", accelerator: "tcg", cpus: 1, memory: 512, disks: [{ name: "system", sizeGiB: 1, bus: "virtio", format: "qcow2" }], network: { mode: "none" } };
const withAgent = (await csrfPost("/api/machines", { ...base, name: `agent-on-${suffix}`, guestAgent: true })).body;
const withoutAgent = (await csrfPost("/api/machines", { ...base, name: `agent-off-${suffix}` })).body;
const onId = (withAgent.machine || withAgent).id, offId = (withoutAgent.machine || withoutAgent).id;
await csrfPost(`/api/machines/${onId}/action`, { action: "start" });
await csrfPost(`/api/machines/${offId}/action`, { action: "start" });
await sleep(2000);
const line = spawnSync("powershell.exe", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "Name like 'qemu-system%'" | Where-Object { $_.CommandLine -match '${onId}' } | Select-Object -First 1).CommandLine`], { encoding: "utf8" }).stdout;
check("QEMU starts with the guest agent channel", /virtserialport,chardev=qga0,name=org\.qemu\.guest_agent\.0/.test(line) && /socket,id=qga0,host=127\.0\.0\.1,port=\d+,server=on,wait=off/.test(line), (line.match(/socket,id=qga0[^ "]*/) || [""])[0]);
await send("Page.navigate", { url: origin }); await sleep(2500);
await openMachine(onId);
await waitFor(`document.querySelector('.mon-out .error-text')`, 12000);
const silent = await ev(`return document.querySelector('.mon-out .error-text')?.innerText || ''`);
check("With no agent running in the guest, the tab says so instead of waiting forever", /No guest agent answered/.test(silent), silent);
await shot("agent-silent");
const refused = await ev(`return (await (await fetch('/api/machines/${onId}/agent/exec')).json()).error`);
check("Questions outside the list are refused", refused === "Choose a listed guest agent question.", refused);
await send("Page.navigate", { url: origin }); await sleep(2500);
await openMachine(offId);
await waitFor(`document.querySelector('#machine-tab-panel')?.innerText.includes('no guest agent channel')`);
const explained = await ev(`return document.querySelector('#machine-tab-panel')?.innerText.replace(/\\s+/g,' ') || ''`);
check("A machine without the channel explains how to turn it on", /no guest agent channel/.test(explained) && /Edit hardware/.test(explained), explained.slice(0, 120));
for (const id of [onId, offId]) await csrfPost(`/api/machines/${id}/action`, { action: "stop" });
writeFileSync(path.join(outDir, "guest-agent.json"), redactPaths(JSON.stringify({ origin, at: new Date().toISOString(), results }, null, 2), { data: process.env.DATA_DIR }));
ws.close(); stopBrowser(edge);
process.exit(results.every((r) => r.ok) ? 0 : 1);

// Checks the machine page tabs in headless Microsoft Edge against a real QEMU
// machine: Hardware lists the saved configuration, Monitor answers read-only
// queries from the running machine (and shows QEMU's own refusal when a
// device is absent), and Log shows QEMU's messages and the serial log.
// Usage: node scripts/verify-machine-tabs.mjs <origin> <password> <out-dir>
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
const port = 9361;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-mt-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
const click = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click(); return 1;`);
const text = (sel) => ev(`return document.querySelector(${JSON.stringify(sel)})?.innerText.replace(/\\s+/g, ' ') || ''`);
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
const id = await ev(`let s=await (await fetch('/api/session')).json();
const post=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify(b)});
if(s.setupRequired) await post('/api/setup',{name:'owner',username:'owner',password:${JSON.stringify(password)}});
else if(!s.authenticated) await post('/api/login',{username:'owner',password:${JSON.stringify(password)}});
s=await (await fetch('/api/session')).json();
await post('/api/preferences',{setup:{step:8,complete:true},settings:{language:'en'}});
const r=await post('/api/machines',{name:'tabs-check',arch:'x86_64',machineType:'q35',accelerator:'tcg',cpus:2,sockets:1,cores:2,threads:1,memory:512,balloon:false,serial:true,disks:[{name:'system',sizeGiB:1,bus:'virtio',format:'qcow2'}],network:{mode:'user',model:'e1000',forwards:[{proto:'tcp',hostPort:22022,guestPort:22}]}});
const m=await r.json();
const id=(m.machine||m).id;
await post('/api/machines/'+id+'/action',{action:'start'});
return id;`);
check("A real machine with serial logging was created and started", /^[a-f0-9-]{36}$/.test(id), id);
await send("Page.navigate", { url: origin }); await sleep(2500);
await ev(`location.hash=''; return 1;`);
await waitFor(`document.querySelector('[data-action="console:${id}"], [data-action^="open:${id}"], [data-tab="console:${id}"]')`, 3000);
await ev(`const b=[...document.querySelectorAll('[data-action]')].find((x)=>x.dataset.action.includes('${id}') && /console|open/.test(x.dataset.action)); b?.click(); return b?.dataset.action || 'none';`);
const onPage = await waitFor(`document.querySelector('[data-action="machine-tab:hardware"]')`);
const tabsText = await text(".machine-tabs");
check("The machine page shows Overview, Hardware, Monitor and Log tabs", onPage && ["Overview", "Hardware", "Monitor", "Log"].every((x) => tabsText.includes(x)), await text(".machine-tabs"));

await click('[data-action="machine-tab:hardware"]'); await sleep(600);
const hw = await text("#machine-tab-panel");
check("Hardware lists the saved configuration, with the machine ID as its SMBIOS UUID", ["q35", "1 sockets × 2 cores × 1 threads", "512 MiB", "e1000", "tcp 22022 → 22", "BIOS", id + " (the machine ID)"].every((x) => hw.includes(x)), hw.slice(0, 240));
await shot("hardware");

await click('[data-action="machine-tab:monitor"]');
await waitFor(`document.querySelector('.mon-result, .mon-out .error-text')`);
const status = await text(".mon-result");
check("Monitor asks the running machine for its state", /status\s*running/.test(status) && /running\s*true/.test(status), status.slice(0, 120));
await click('[data-action="monitor-query:cpus"]');
await waitFor(`document.querySelector('.mon-out h2')?.innerText === 'Virtual CPUs' && document.querySelector('.mon-result')`);
const cpus = await ev(`return document.querySelectorAll('.mon-result > .mon-list > li').length`);
check("Monitor lists each virtual CPU", cpus === 2, String(cpus));
await shot("monitor-cpus");
await click('[data-action="monitor-query:balloon"]');
await waitFor(`document.querySelector('.mon-out .error-text')`);
const refused = await text(".mon-out .error-text");
check("A query for an absent device shows QEMU's own answer", /balloon/i.test(refused), refused);
const before = await ev(`return (await (await fetch('/api/machines/${id}/monitor/quit')).json()).error`);
check("The server refuses anything not on the query list", before === "Choose a listed monitor query.", before);
const stillRunning = await ev(`return (await (await fetch('/api/state')).json()).machines.find((m)=>m.id==='${id}').state`);
check("The machine is still running after the refused request", stillRunning === "running", stillRunning);

await click('[data-action="machine-tab:log"]');
await waitFor(`document.querySelector('.log-layout')`);
const log = await text("#machine-tab-panel");
check("Log shows QEMU messages and the serial console section", /QEMU messages/.test(log) && /Serial console/.test(log) && !/logging is off/.test(log), log.slice(0, 200));
await shot("log");

await click('[data-action="machine-tab:overview"]');
const vnc = await waitFor(`document.querySelector('#vnc canvas')`, 10000);
check("Back on Overview the live console connects again", vnc);

await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
await click('[data-action="machine-tab:monitor"]'); await sleep(1500);
const overflow = await ev(`return document.documentElement.scrollWidth - innerWidth`);
check("The tabs fit a 375-pixel phone screen without sideways scrolling", overflow === 0, String(overflow));
await shot("monitor-375");
await ev(`const s=await (await fetch('/api/session')).json(); await fetch('/api/machines/${id}/action',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({action:'stop'})}); return 1;`);
writeFileSync(path.join(outDir, "machine-tabs.json"), JSON.stringify({ origin, at: new Date().toISOString(), results }, null, 2));
ws.close(); stopBrowser(edge);
process.exit(results.every((r) => r.ok) ? 0 : 1);

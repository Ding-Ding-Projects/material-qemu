// Checks Save and resume end to end in headless Microsoft Edge against real
// QEMU: a running machine is saved from its tab and stops; a normal start and a
// disk resize are refused while the state exists; Resume brings it back running
// with the same screen it had (compared pixel for pixel through QEMU's own
// screenshot); a second save is discarded behind the confirmation gate.
// Usage: node scripts/verify-saved-state.mjs <origin> <password> <out-dir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
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
const port = 9373;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-ss-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
const post = (url, body) => ev(`const s=await (await fetch('/api/session')).json(); const r=await fetch(${JSON.stringify(url)},{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify(${JSON.stringify(body)})}); return JSON.stringify({status:r.status, body:await r.json().catch(()=>({}))});`).then(JSON.parse);
const machineState = (id) => ev(`const m=(await (await fetch('/api/state')).json()).machines.find((x)=>x.id==='${id}'); return JSON.stringify({state:m.state, saved:m.savedState});`).then(JSON.parse);
// QEMU's own screenshot of the guest display, hashed.
const screen = async (id) => { await post(`/api/machines/${id}/actions`, { action: "screenshot" }); return ev(`const r=await fetch('/api/machines/${id}/screenshot?'+Date.now()); const b=new Uint8Array(await r.arrayBuffer()); let h=0; for (const x of b) h=(h*31+x)>>>0; return b.length+':'+h;`); };
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
await ev(`let s=await (await fetch('/api/session')).json();
const p=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify(b)});
if(s.setupRequired) await p('/api/setup',{name:'owner',username:'owner',password:${JSON.stringify(password)}});
else if(!s.authenticated) await p('/api/login',{username:'owner',password:${JSON.stringify(password)}});
s=await (await fetch('/api/session')).json();
await p('/api/preferences',{setup:{step:8,complete:true},settings:{language:'en'}}); return 1;`);
const created = await post("/api/machines", { name: `state-${suffix}`, arch: "x86_64", machineType: "q35", accelerator: "tcg", cpus: 1, memory: 256, bootMenu: true, disks: [{ name: "system", sizeGiB: 1, bus: "virtio", format: "qcow2" }], network: { mode: "none" } });
const id = (created.body.machine || created.body).id;
await post(`/api/machines/${id}/action`, { action: "start" });
await sleep(9000); // SeaBIOS settles on a still screen
const before = await screen(id);
await send("Page.navigate", { url: origin }); await sleep(2500);
await ev(`const b=[...document.querySelectorAll('[data-action]')].find((x)=>x.dataset.action.includes('${id}') && /console|open/.test(x.dataset.action)); b?.click(); return 1;`);
await waitFor(`document.querySelector('[data-action="machine-tab:state"]')`);
await click('[data-action="machine-tab:state"]');
await waitFor(`document.querySelector('[data-action="state-save"]')`);
await shot("state-running");
await click('[data-action="state-save"]');
let st;
for (let i = 0; i < 120; i++) { st = await machineState(id); if (st.saved && st.state === "stopped") break; await sleep(500); }
check("Saving writes the state and stops the machine", st.saved && st.state === "stopped" && st.saved.bytes > 100000 && st.saved.wasRunning === true, JSON.stringify(st));
const start = await post(`/api/machines/${id}/action`, { action: "start" });
check("A normal start is refused while the state is saved", start.status >= 400 && /saved state.*starting it normally/.test(start.body.error), start.body.error);
const resize = await post("/api/storage/disks/resize", { machineId: id, diskId: "system", sizeGiB: 2 });
check("A disk resize is refused while the state is saved", resize.status >= 400 && /resizing its disks/.test(resize.body.error), resize.body.error);
await waitFor(`document.querySelector('[data-action="state-resume"]')`, 10000);
await sleep(500);
await shot("state-saved");
await click('#machine-tab-panel [data-action="state-resume"]');
for (let i = 0; i < 120; i++) { st = await machineState(id); if (!st.saved && st.state === "running") break; await sleep(500); }
check("Resume brings the machine back running and removes the saved state", st.state === "running" && !st.saved, JSON.stringify(st));
const after = await screen(id);
check("The resumed screen is identical to the screen before saving", before === after && !before.startsWith("0:"), `${before} → ${after}`);
await post(`/api/machines/${id}/saved-state`, { action: "save" });
for (let i = 0; i < 120; i++) { st = await machineState(id); if (st.saved) break; await sleep(500); }
await send("Page.navigate", { url: origin }); await sleep(2500);
await ev(`const b=[...document.querySelectorAll('[data-action]')].find((x)=>x.dataset.action.includes('${id}') && /console|open/.test(x.dataset.action)); b?.click(); return 1;`);
await waitFor(`document.querySelector('[data-action="machine-tab:state"]')`);
await click('[data-action="machine-tab:state"]');
await waitFor(`document.querySelector('[data-action="state-discard"]')`);
await click('[data-action="state-discard"]');
await waitFor(`document.querySelector('#gate-slider')`);
await ev(`for (const k of document.querySelectorAll('[data-gate-key]')) k.click(); await new Promise((r)=>setTimeout(r,200)); const s=document.querySelector('#gate-slider'); s.value='100'; s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); return 1;`);
for (let i = 0; i < 40; i++) { st = await machineState(id); if (!st.saved) break; await sleep(250); }
check("Discarding behind the confirmation gate removes the saved state", !st.saved && st.state === "stopped", JSON.stringify(st));
const normal = await post(`/api/machines/${id}/action`, { action: "start" });
check("After discarding, the machine starts normally again", normal.status === 200, String(normal.status));
await post(`/api/machines/${id}/action`, { action: "stop" });
writeFileSync(path.join(outDir, "saved-state.json"), redactPaths(JSON.stringify({ origin, at: new Date().toISOString(), results }, null, 2), { data: process.env.DATA_DIR }));
ws.close(); stopBrowser(edge);
process.exit(results.every((r) => r.ok) ? 0 : 1);

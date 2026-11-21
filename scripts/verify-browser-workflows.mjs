// Drives the remade browser workflows against a real server through headless Edge (CDP).
// Usage: node workflows.mjs <origin> <outDir> <password> <vmdkPath>
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { stopBrowser, ensurePortFree } from "./browser-process.mjs";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const [origin, outDir, password, vmdk] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const profile = path.join(os.tmpdir(), "mq-workflow-profile");
rmSync(profile, { recursive: true, force: true });
const port = 9342;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
process.on("exit", () => stopBrowser(edge));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.once("open", r));
let seq = 0; const pending = new Map();
ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression: `(async()=>{${expression}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) return "EXC " + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails).slice(0, 300); return r.result?.result?.value; };
const shot = async (name) => { await sleep(900); const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(path.join(outDir, name + ".png"), Buffer.from(r.result.data, "base64")); };
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail); };
const click = (sel) => ev(`const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'missing'; e.click(); return 'ok';`);
const api = (p) => ev(`return await (await fetch(${JSON.stringify(p)})).json();`);
const setField = (key, value) => ev(`const e=document.querySelector('[data-f="${key}"]'); if(!e) return 'missing ${key}'; if(e.type==='checkbox'){e.checked=${JSON.stringify(value)};} else e.value=${JSON.stringify(String(value))}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return 'ok';`);
const submitDialog = (values) => ev(`const f=document.querySelector('#dialog-form'); if(!f) return 'no dialog'; for (const [k,v] of Object.entries(${JSON.stringify(values)})) { const i=f.querySelector('[name="'+k+'"]'); if(!i) return 'missing '+k; i.value=v; } f.requestSubmit(); return 'ok';`);
const passGate = () => ev(`const d=document.querySelector('#dialog'); const keys=d.querySelectorAll('[data-gate-key]'); if(keys.length!==2) return 'no gate'; keys.forEach(k=>k.click()); const s=d.querySelector('#gate-slider'); if(s.disabled) return 'slider locked'; s.value='100'; s.dispatchEvent(new Event('input',{bubbles:true})); return 'ok';`);
await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
console.log(await ev(`let s=await (await fetch('/api/session')).json(); if(!s.authenticated){await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify({username:'owner',password:${JSON.stringify(password)}})}); s=await (await fetch('/api/session')).json();} await fetch('/api/preferences',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({setup:{step:8,complete:true},settings:{theme:'dark',language:'en'}})}); return 'auth '+s.authenticated;`));
await send("Page.navigate", { url: origin }); await sleep(3000);
// 1. Create form: every section, UEFI, extra disk, port forward, devices.
await click('[data-action="page:new"]'); await sleep(1200);
await setField("name", "wf-create");
const fields = {};
for (const section of ["system", "cpu", "disks", "network", "display", "boot"]) {
  const r = await click(`[data-action="cfg-section:${section}"]`);
  await sleep(500);
  fields[section] = await ev(`return [...document.querySelectorAll('#create-pane [data-f]')].map(e=>e.dataset.f+'='+(e.type==='checkbox'?e.checked:e.value)).join(', ');`);
  console.log(section, r, fields[section]);
  if (section === "system") { await setField("firmware", "uefi"); await sleep(600); }
  if (section === "cpu") { await setField("cores", 2); await sleep(300); }
  if (section === "disks") { await click('[data-action="cfg-add-disk"]'); await sleep(600); }
  if (section === "network") { await click('[data-action="cfg-add-fwd"]'); await sleep(600); }
  if (section === "display") { await shot("wf-create-display"); }
}
await click('[data-action="cfg-section:system"]'); await sleep(400); await shot("wf-create-system-uefi");
const preview = await ev(`return document.querySelector('#command-preview')?.textContent||''`);
check("launch preview shows UEFI pflash", /pflash/.test(preview), preview.slice(0, 120));
await click('[data-action="wizard-create"]'); await sleep(2500);
let state = await api("/api/state");
const created = state.machines.find((m) => m.name === "wf-create");
check("create form saved a v2 machine", created && created.firmware === "uefi" && created.disks?.length === 2 && created.network?.forwards?.length === 1, created ? JSON.stringify({ firmware: created.firmware, disks: created.disks?.length, cores: created.cores, forwards: created.network?.forwards }) : "not found");
// 2. Storage: resize then clone.
await click('[data-action="page:storage"]'); await sleep(2000);
const diskId = created && `${created.id}:${created.disks[0].id}`;
console.log("resize open", await click(`[data-action="disk-resize:${encodeURIComponent(diskId)}"]`)); await sleep(700);
console.log("resize submit", await submitDialog({ diskSize: String((created?.disks[0].sizeGiB || 20) + 1) })); await sleep(3000);
state = await api("/api/state");
const resized = state.machines.find((m) => m.id === created?.id);
check("resize grew the system disk in the browser", resized?.disks?.[0].sizeGiB === (created?.disks[0].sizeGiB || 0) + 1, String(resized?.disks?.[0].sizeGiB));
await click('[data-action="page:storage"]'); await sleep(1500);
console.log("clone open", await click(`[data-action="clone:${created?.id}"]`)); await sleep(700);
console.log("clone submit", await submitDialog({ cloneName: "wf-clone" })); await sleep(6000);
state = await api("/api/state");
check("clone created a new machine", state.machines.some((m) => m.name === "wf-clone"));
// 3. Import a VMDK through the storage drop zone's file input.
await click('[data-action="page:storage"]'); await sleep(1500);
const doc = await send("DOM.getDocument", { depth: -1 });
const q = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: 'input[type=file]' });
await send("DOM.setFileInputFiles", { nodeId: q.result.nodeId, files: [vmdk] });
await ev(`document.querySelector('input[type=file]').dispatchEvent(new Event('change',{bubbles:true})); return 1;`);
await sleep(9000);
state = await api("/api/state");
const imported = state.machines.find((m) => m.name === path.basename(vmdk).replace(/\.[^.]+$/, ""));
check("VMDK import created a qcow2 machine", imported && imported.disks?.[0]?.format === "qcow2", imported ? JSON.stringify(imported.disks?.[0]) : "not found");
await shot("wf-storage-after");
// 4. Snapshot take, then restore through the two-key gate (stopped machine).
const id = created?.id;
await ev(`location.hash=''; return 1`);
await click('[data-action="page:machines"]'); await sleep(1200);
console.log("open machine", await click(`[data-action="console:${id}"]`)); await sleep(2500);
console.log("snap open", await click('[data-action="snap-take"]')); await sleep(700);
console.log("snap submit", await submitDialog({ snapName: "wf-snap" })); await sleep(3000);
let snaps = await api(`/api/machines/${id}/snapshots`);
check("snapshot taken in the browser", snaps.snapshots?.some((s) => s.name === "wf-snap"), JSON.stringify(snaps.snapshots?.map((s) => s.name)));
console.log("restore open", await click('[data-action^="snap-restore:"]')); await sleep(800);
await shot("wf-gate-open");
console.log("gate", await passGate()); await sleep(2500);
const events = await api("/api/state");
check("restore through the gate reached the server", events.events?.some((e) => /restored/.test(e.message || e)), (events.events || []).slice(0, 3).map((e) => e.message || e).join(" | "));
await shot("wf-machine-after-restore");
// 5. Cantonese and bilingual rendering.
for (const lang of ["yue", "both"]) {
  await ev(`const s=await (await fetch('/api/session')).json(); await fetch('/api/preferences',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({settings:{language:'${lang}'}})}); return 1;`);
  await send("Page.navigate", { url: origin }); await sleep(3000);
  await shot(`lang-${lang}-dashboard`);
  await click('[data-action="page:new"]'); await sleep(1200); await shot(`lang-${lang}-create`);
  await click('[data-action="page:storage"]'); await sleep(1500); await shot(`lang-${lang}-storage`);
  const txt = await ev(`return document.querySelector('main')?.innerText.slice(0,400)`);
  check(`${lang} renders Chinese text`, /[\u4e00-\u9fff]/.test(txt), txt.slice(0, 80).replace(/\s+/g, " "));
  const overflow = await ev(`return document.documentElement.scrollWidth - innerWidth`);
  check(`${lang} has no horizontal overflow`, overflow <= 0, String(overflow));
}
await ev(`const s=await (await fetch('/api/session')).json(); await fetch('/api/preferences',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({settings:{language:'en'}})}); return 1;`);
writeFileSync(path.join(outDir, "workflows.json"), JSON.stringify({ origin, at: new Date().toISOString(), fields, results }, null, 2));
ws.close(); stopBrowser(edge);

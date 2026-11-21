// Checks moving a machine between two Material QEMU hosts in headless
// Microsoft Edge, with real QEMU: on host A a running machine's state is saved
// and the machine is exported with the Hardware tab's button; on host B the
// bundle is chosen in Storage; the machine appears with its saved state and,
// resumed on host B, shows exactly the screen it had on host A.
// Usage: node scripts/verify-machine-move.mjs <origin-a> <origin-b> <password> <out-dir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { stopBrowser, ensurePortFree } from "./browser-process.mjs";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const [originA, originB, password, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const downloads = path.join(outDir, "downloads");
mkdirSync(downloads, { recursive: true });
const suffix = Date.now() % 1000000;
const port = 9377;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-mv-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
const post = (url, body) => ev(`const s=await (await fetch('/api/session')).json(); const r=await fetch(${JSON.stringify(url)},{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify(${JSON.stringify(body)})}); return JSON.stringify({status:r.status, body:await r.json().catch(()=>({}))});`).then(JSON.parse);
const screen = async (id) => { await post(`/api/machines/${id}/actions`, { action: "screenshot" }); return ev(`const r=await fetch('/api/machines/${id}/screenshot?'+Date.now()); const b=new Uint8Array(await r.arrayBuffer()); let h=0; for (const x of b) h=(h*31+x)>>>0; return b.length+':'+h;`); };
const machineState = (id) => ev(`const m=(await (await fetch('/api/state')).json()).machines.find((x)=>x.id==='${id}'); return JSON.stringify(m ? {state:m.state, saved:Boolean(m.savedState), name:m.name, uuid:m.uuid} : null);`).then(JSON.parse);
const signIn = async (origin) => {
  await send("Page.navigate", { url: origin }); await sleep(2500);
  await ev(`let s=await (await fetch('/api/session')).json();
  if(s.setupRequired) await fetch('/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'owner',password:${JSON.stringify(password)}})});
  else if(!s.authenticated) await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'owner',password:${JSON.stringify(password)}})});
  s=await (await fetch('/api/session')).json();
  await fetch('/api/preferences',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({setup:{step:8,complete:true},settings:{language:'en'}})}); return 1;`);
  await send("Page.navigate", { url: origin }); await sleep(2500);
};
await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });

// Host A: a running machine, saved and exported.
await signIn(originA);
const name = `mover-${suffix}`;
const created = await post("/api/machines", { name, arch: "x86_64", machineType: "q35", accelerator: "tcg", cpus: 1, memory: 256, bootMenu: true, disks: [{ name: "system", sizeGiB: 1, bus: "virtio", format: "qcow2" }], network: { mode: "none" } });
const idA = (created.body.machine || created.body).id;
await post(`/api/machines/${idA}/action`, { action: "start" });
await sleep(9000);
const before = await screen(idA);
const saved = await post(`/api/machines/${idA}/saved-state`, { action: "save" });
check("Host A saves the running machine's state", saved.status === 200, JSON.stringify(saved.body).slice(0, 80));
await send("Page.navigate", { url: originA }); await sleep(2500);
await ev(`const b=[...document.querySelectorAll('[data-action]')].find((x)=>x.dataset.action.includes('${idA}') && /console|open/.test(x.dataset.action)); b?.click(); return 1;`);
await waitFor(`document.querySelector('[data-action="machine-tab:hardware"]')`);
await ev(`document.querySelector('[data-action="machine-tab:hardware"]').click(); return 1;`);
await waitFor(`document.querySelector('a[href$="/export"]')`);
await ev(`document.querySelector('a[href$="/export"]').scrollIntoView({block:'center'}); return 1;`); await sleep(300);
await shot("export-button");
await ev(`document.querySelector('a[href$="/export"]').click(); return 1;`);
let bundle = null;
for (let i = 0; i < 120 && !bundle; i++) { await sleep(500); bundle = readdirSync(downloads).find((f) => f === `${name}.mqvm.tar`) || null; }
const bundlePath = bundle && path.join(downloads, bundle);
check("Host A's Export button downloads one .mqvm.tar bundle", bundle && statSync(bundlePath).size > 1000000, bundle ? `${bundle} ${statSync(bundlePath).size} bytes` : "no download");

// Host B: choose the bundle in Storage.
await signIn(originB);
await ev(`document.querySelector('[data-action="page:storage"]').click(); return 1;`); await sleep(1200);
const doc = await send("DOM.getDocument", { depth: -1 });
const input = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: "#storage-file" });
await send("DOM.setFileInputFiles", { nodeId: input.result.nodeId, files: [bundlePath] });
await waitFor(`/Imported mover-/.test(document.querySelector('#dropzone')?.innerText || '')`, 60000);
const message = await ev(`return document.querySelector('#dropzone [role=status]')?.innerText || ''`);
check("Host B imports the bundle from Storage and says the saved state came along", new RegExp(`Imported ${name} with its saved state`).test(message), message);
await shot("import-done");
const idB = await ev(`return (await (await fetch('/api/state')).json()).machines.find((m)=>m.name==='${name}')?.id || ''`);
const onB = await machineState(idB);
check("On host B the machine has a new ID, the same SMBIOS UUID and its saved state", idB && idB !== idA && onB.uuid === idA && onB.saved && onB.state === "stopped", JSON.stringify(onB));
const resumed = await post(`/api/machines/${idB}/saved-state`, { action: "resume" });
let after = null;
for (let i = 0; i < 60; i++) { const st = await machineState(idB); if (st.state === "running") { after = await screen(idB); break; } await sleep(500); }
check("Resumed on host B, the machine shows exactly the screen it had on host A", resumed.status === 200 && after === before, `${before} → ${after} (${resumed.status})`);
await post(`/api/machines/${idB}/action`, { action: "stop" });
writeFileSync(path.join(outDir, "machine-move.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
ws.close(); stopBrowser(edge);
process.exit(results.every((r) => r.ok) ? 0 : 1);

// Checks storage pools in headless Microsoft Edge against real QEMU: a folder
// is added as a pool from Storage, a machine created through the form keeps
// its disk there and starts with that file, the pool cannot be removed while
// it holds disks, and the Overview warns when the pool's folder goes missing.
// Windows only (reads QEMU's command line).
// Usage: node scripts/verify-pools.mjs <origin> <password> <out-dir> <pool-folder>
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { stopBrowser, ensurePortFree } from "./browser-process.mjs";
import { redactPaths } from "./redact-paths.mjs";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const [origin, password, outDir, poolFolder] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
mkdirSync(poolFolder, { recursive: true });
const suffix = Date.now() % 1000000;
const port = 9379;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-pl-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
const setField = (sel, value) => ev(`const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'missing'; e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return 1;`);
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
await ev(`let s=await (await fetch('/api/session')).json();
if(s.setupRequired) await fetch('/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'owner',password:${JSON.stringify(password)}})});
else if(!s.authenticated) await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'owner',password:${JSON.stringify(password)}})});
s=await (await fetch('/api/session')).json();
await fetch('/api/preferences',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({setup:{step:8,complete:true},settings:{language:'en'}})}); return 1;`);
await send("Page.navigate", { url: origin }); await sleep(2500);
const poolName = `Second drive ${suffix}`;
await click('[data-action="page:storage"]'); await sleep(800);
await click('[data-action="storage-tab:pools"]');
await waitFor(`document.querySelector('#pool-form')`);
await setField("#pool-name", poolName);
await setField("#pool-path", poolFolder);
await click('[data-action="pool-add"]');
await waitFor(`[...document.querySelectorAll('.pool-row strong')].some((e)=>e.innerText===${JSON.stringify(poolName)})`);
const row = await ev(`const r=[...document.querySelectorAll('.pool-row')].find((e)=>e.innerText.includes(${JSON.stringify(poolName)})); return r ? r.innerText.replace(/\\s+/g,' ') + ' | meter ' + r.querySelector('[role=meter]')?.getAttribute('aria-valuenow') : ''`);
check("A folder is added as a pool from Storage and shows its free space", /free of/.test(row) && /0 disks/.test(row) && /meter \d+/.test(row), row.slice(-80));
const poolId = await ev(`return (await (await fetch('/api/pools')).json()).pools.find((p)=>p.name===${JSON.stringify(poolName)}).id`);
// Create a machine through the form, its system disk in the pool.
const name = `pooled-${suffix}`;
await click('[data-action="new"]');
await waitFor(`document.querySelector('#f-name')`);
await setField("#f-name", name);
await click('[data-action="cfg-section:disks"]');
await waitFor(`document.querySelector('[id="f-disks.0.pool"]')`);
const options = await ev(`return [...document.querySelectorAll('[id="f-disks.0.pool"] option')].map((o)=>o.textContent).join(',')`);
await setField('[id="f-disks.0.sizeGiB"]', "1");
await setField('[id="f-disks.0.pool"]', poolId);
await sleep(600);
await shot("form-pool");
check("The disk form offers managed storage and the pool", options.startsWith("Managed storage") && options.includes(poolName), options);
await click('[data-action="wizard-create-start"]');
const id = await ev(`for (let i = 0; i < 100; i++) { const m = (await (await fetch('/api/state')).json()).machines.find((x) => x.name === ${JSON.stringify(name)}); if (m && m.state === 'running') return m.id; await new Promise((r) => setTimeout(r, 200)); } return 'not running';`);
const inPool = readdirSync(path.join(poolFolder, "material-qemu-disks"));
const diskFile = inPool.find((f) => f.startsWith(id));
check("The machine's disk is created in the pool folder", Boolean(diskFile), inPool.join(","));
const line = spawnSync("powershell.exe", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "Name like 'qemu-system%'" | Where-Object { $_.CommandLine -match '${id}' } | Select-Object -First 1).CommandLine`], { encoding: "utf8" }).stdout;
check("QEMU runs the machine from the disk in the pool", Boolean(diskFile) && line.includes(path.join(poolFolder, "material-qemu-disks", diskFile)), redactPaths((line.match(/file=[^,]*material-qemu-disks[^,]*/) || ["no match"])[0], { data: process.env.DATA_DIR }));
await ev(`const s=await (await fetch('/api/session')).json(); await fetch('/api/machines/${id}/action',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({action:'stop'})}); return 1;`);
await send("Page.navigate", { url: origin }); await sleep(2500);
await click('[data-action="page:storage"]'); await sleep(800);
await click('[data-action="storage-tab:pools"]');
await waitFor(`document.querySelector('[data-action="pool-remove:${poolId}"]')`);
const locked = await ev(`const b=document.querySelector('[data-action="pool-remove:${poolId}"]'); return b.disabled + ' ' + (b.closest('.pool-row').innerText.match(/\\d+ disks?/)||[''])[0]`);
check("The pool cannot be removed while it holds a disk", locked === "true 1 disk", locked);
await shot("storage-pools");
// The pool's folder goes missing: the Overview warns about it.
const hidden = poolFolder + "-hidden";
renameSync(poolFolder, hidden);
try {
  await send("Page.navigate", { url: origin }); await sleep(2500);
  await click('[data-action="page:overview"]');
  await waitFor(`[...document.querySelectorAll('.banner')].some((b)=>/folder is missing/.test(b.innerText))`, 8000);
  const banner = await ev(`return [...document.querySelectorAll('.banner')].map((b)=>b.innerText).find((x)=>/folder is missing/.test(x)) || ''`);
  check("The Overview warns when a pool's folder is missing", banner.includes(`${poolName}: the folder is missing or cannot be read.`), banner.slice(0, 120));
  await shot("overview-pool-missing");
} finally {
  renameSync(hidden, poolFolder);
}
writeFileSync(path.join(outDir, "pools.json"), redactPaths(JSON.stringify({ origin, at: new Date().toISOString(), results }, null, 2), { data: process.env.DATA_DIR }));
ws.close(); stopBrowser(edge);
process.exit(results.every((r) => r.ok) ? 0 : 1);

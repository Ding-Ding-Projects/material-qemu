// Captures the remade UI from a real server with headless Edge over CDP.
// Usage: node capture-remake.mjs <origin> <outDir> <password>
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const [origin, outDir, password] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const profile = path.join(os.tmpdir(), "mq-capture-profile");
rmSync(profile, { recursive: true, force: true });
const port = 9341;
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.once("open", r));
let seq = 0; const pending = new Map();
ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value; };
const viewport = (width, height, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
const shot = async (name) => { await sleep(1400); const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(path.join(outDir, name + ".png"), Buffer.from(r.result.data, "base64")); console.log("saved", name); };
const click = (sel) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'missing ${sel.replace(/'/g, "")}'; e.click(); return 'ok';})()`);
await send("Page.enable"); await send("Runtime.enable");
await viewport(1440, 960);
await send("Page.navigate", { url: origin }); await sleep(2500);
console.log(await evaluate(`(async()=>{let s=await (await fetch('/api/session')).json(); if(!s.authenticated){await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify({username:'owner',password:${JSON.stringify(password)}})}); s=await (await fetch('/api/session')).json();}
await fetch('/api/preferences',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({setup:{step:8,complete:true}})}); const st=await (await fetch('/api/state')).json(); for (const m of st.machines) await fetch('/api/machines/'+m.id+'/actions',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({action:'start'})}); await new Promise(r=>setTimeout(r,8000)); return 'auth '+s.authenticated;})()`));
for (const theme of ["dark", "light"]) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
  await send("Page.navigate", { url: origin }); await sleep(3000);
  await evaluate(`(async()=>{const s=await (await fetch('/api/session')).json(); await fetch('/api/preferences',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({settings:{theme:'${theme}'}})}); return 1})()`);
  await send("Page.navigate", { url: origin }); await sleep(3500);
  await shot(`${theme}-dashboard`);
  console.log(await click('[data-action="page:machines"]')); await shot(`${theme}-machines`);
  console.log(await click('[data-action="page:new"]')); await shot(`${theme}-create`);
  console.log(await click('[data-action="page:storage"]')); await sleep(1500); await shot(`${theme}-storage`);
  console.log(await click('[data-action="page:settings"]')); await shot(`${theme}-settings`);
  console.log(await click('[data-action="page:machines"]'));
  console.log(await evaluate(`(()=>{const e=[...document.querySelectorAll('[data-action^="details:"],[data-action^="console:"]')][0]; if(!e) return 'no machine'; e.click(); return e.dataset.action})()`));
  await sleep(7000); console.log(await evaluate(`JSON.stringify({canvas:document.querySelectorAll('canvas').length, status:(document.querySelector('.console-status,[role=status]')||{}).textContent})`)); await shot(`${theme}-machine`);
}
await viewport(375, 812, true);
await send("Page.navigate", { url: origin }); await sleep(3500);
await shot("narrow-dashboard");
console.log(await click('[data-action="page:new"]')); await shot("narrow-create");
console.log(await click('[data-action="page:storage"]')); await shot("narrow-storage");
console.log(await evaluate(`document.documentElement.scrollWidth+'x'+innerWidth`));
ws.close(); edge.kill();

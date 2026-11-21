// Proves two console features on a real running guest in headless Microsoft Edge:
//  1. The Screenshot PNG (QMP screendump) decodes to the same picture as the live
//     framebuffer drawn by the console viewer (pixel comparison).
//  2. Ctrl+Alt pressed alone releases guest input; Ctrl+Alt+Del does not.
// Usage: node scripts/verify-console-export.mjs <origin> <password> <out-dir>
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
const port = 9347;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-console-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
const key = async (type, keyName, code, vk, modifiers = 0) => send("Input.dispatchKeyEvent", { type, key: keyName, code, windowsVirtualKeyCode: vk, modifiers });
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail); };
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
const id = await ev(`let s=await (await fetch('/api/session')).json(); if(!s.authenticated){await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify({username:'owner',password:${JSON.stringify(password)}})}); s=await (await fetch('/api/session')).json();}
const st=await (await fetch('/api/state')).json(); const m=st.machines[0]; if(m.state!=='running') await fetch('/api/machines/'+m.id+'/actions',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({action:'start'})}); localStorage.setItem('mq-console-input','true'); return m.id;`);
await send("Page.navigate", { url: origin }); await sleep(3000);
await ev(`document.querySelector('[data-action="page:machines"]').click(); return 1;`); await sleep(1000);
await ev(`document.querySelector('[data-action="console:${id}"]').click(); return 1;`);
await sleep(30000); // let the firmware settle on a still screen

// 1. PNG export against the live framebuffer.
const cmp = await ev(`
  const canvas = document.querySelector('#vnc canvas');
  if (!canvas) return JSON.stringify({ error: 'no console canvas' });
  const live = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const blob = await (await fetch('/api/machines/${id}/screenshot', { cache: 'no-store' })).blob();
  const bmp = await createImageBitmap(blob);
  const off = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = off.getContext('2d'); ctx.drawImage(bmp, 0, 0);
  const png = ctx.getImageData(0, 0, bmp.width, bmp.height);
  const header = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const signature = Array.from(header).join(',') === '137,80,78,71,13,10,26,10';
  if (bmp.width !== canvas.width || bmp.height !== canvas.height) return JSON.stringify({ signature, png: [bmp.width, bmp.height], live: [canvas.width, canvas.height] });
  let diff = 0, differing = 0, lit = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const d = Math.abs(png.data[i] - live.data[i]) + Math.abs(png.data[i + 1] - live.data[i + 1]) + Math.abs(png.data[i + 2] - live.data[i + 2]);
    diff += d; if (d > 24) differing++;
    if (live.data[i] + live.data[i + 1] + live.data[i + 2] > 60) lit++;
  }
  const pixels = png.data.length / 4;
  return JSON.stringify({ signature, png: [bmp.width, bmp.height], live: [canvas.width, canvas.height], bytes: blob.size, meanDiff: diff / pixels / 3, differingShare: differing / pixels, litShare: lit / pixels });`);
const c = JSON.parse(cmp);
check("screenshot is a PNG", c.signature, `${c.bytes} bytes`);
check("PNG size equals the live framebuffer", c.png && c.live && c.png[0] === c.live[0] && c.png[1] === c.live[1], `png ${c.png} live ${c.live}`);
check("PNG pixels match the live framebuffer", c.differingShare !== undefined && c.differingShare < 0.01 && c.litShare > 0.001, `mean difference ${c.meanDiff?.toFixed(3)}, ${(100 * (c.differingShare || 0)).toFixed(3)}% of pixels differ, ${(100 * (c.litShare || 0)).toFixed(2)}% lit`);

// 2. Ctrl+Alt release, using real key events delivered to the focused console.
const guestInput = () => ev(`return document.querySelector('[data-action="console-release"]')?.getAttribute('aria-pressed')`);
await ev(`document.querySelector('#vnc canvas')?.focus(); return 1;`);
check("guest input starts on", (await guestInput()) === "true");
await key("rawKeyDown", "Control", "ControlLeft", 17, 2);
await key("rawKeyDown", "Alt", "AltLeft", 18, 3);
await key("rawKeyDown", "Delete", "Delete", 46, 3);
await key("keyUp", "Delete", "Delete", 46, 3);
await key("keyUp", "Alt", "AltLeft", 18, 2);
await key("keyUp", "Control", "ControlLeft", 17, 0);
await sleep(500);
check("Ctrl+Alt+Del keeps guest input on", (await guestInput()) === "true");
await ev(`document.querySelector('#vnc canvas')?.focus(); return 1;`);
await key("rawKeyDown", "Control", "ControlLeft", 17, 2);
await key("rawKeyDown", "Alt", "AltLeft", 18, 3);
await key("keyUp", "Alt", "AltLeft", 18, 2);
await key("keyUp", "Control", "ControlLeft", 17, 0);
await sleep(800);
check("Ctrl+Alt alone releases guest input", (await guestInput()) === "false", await ev(`return document.querySelector('#notice,[role=status]')?.textContent?.slice(0,80) || ''`));
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(path.join(outDir, "input-released.png"), Buffer.from(shot.result.data, "base64"));
writeFileSync(path.join(outDir, "console-export.json"), JSON.stringify({ origin, at: new Date().toISOString(), comparison: c, results }, null, 2));
ws.close(); stopBrowser(edge);
process.exit(results.every((r) => r.ok) ? 0 : 1);

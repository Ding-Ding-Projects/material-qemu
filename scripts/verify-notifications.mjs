// Checks the notifications center in headless Microsoft Edge: a saved
// notification shows an unread badge on the bell, the panel lists it, Escape
// closes the panel, marks it read and returns focus to the bell, the list
// survives a reload, and Clear empties it.
// Usage: node scripts/verify-notifications.mjs <origin> <password> <out-dir>
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
const port = 9352;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-notes-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
const badge = () => ev(`const b=document.querySelector('[data-action="notifications"] .badge'); return b && !b.hidden ? b.textContent : '';`);
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
await ev(`let s=await (await fetch('/api/session')).json();
const post=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify(b)});
if(s.setupRequired) await post('/api/setup',{name:'owner',username:'owner',password:${JSON.stringify(password)}});
else if(!s.authenticated) await post('/api/login',{username:'owner',password:${JSON.stringify(password)}});
await post('/api/preferences',{setup:{step:8,complete:true}});
localStorage.setItem('mq-notifications', JSON.stringify([{id:1,at:new Date().toISOString(),message:'Snapshot first-boot saved.',read:false}]));
return 1;`);
await send("Page.navigate", { url: origin }); await sleep(3000);
check("an unread notification shows a badge on the bell", (await badge()) === "1", `badge "${await badge()}"`);
await ev(`document.querySelector('[data-action="notifications"]').click(); return 1;`); await sleep(700);
const listed = await ev(`return document.querySelector('#notification-panel:not([hidden]) .notification-list li.unread span')?.textContent || ''`);
check("the panel lists the notification", listed === "Snapshot first-boot saved.", listed);
check("the panel's heading has focus", (await ev(`return document.activeElement?.id`)) === "notification-title");
check("the bell reports it is expanded", (await ev(`return document.querySelector('[data-action="notifications"]').getAttribute('aria-expanded')`)) === "true");
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(path.join(outDir, "notifications.png"), Buffer.from(shot.result.data, "base64"));
await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(500);
check("Escape closes the panel and returns focus to the bell", (await ev(`return document.querySelector('#notification-panel').hidden && document.activeElement?.dataset.action`)) === "notifications");
check("closing marks it read", (await badge()) === "", `badge "${await badge()}"`);
await send("Page.navigate", { url: origin }); await sleep(3000);
await ev(`document.querySelector('[data-action="notifications"]').click(); return 1;`); await sleep(700);
check("the notification is still listed after a reload", (await ev(`return document.querySelectorAll('#notification-panel .notification-list li').length`)) === 1);
await ev(`document.querySelector('[data-action="notifications-clear"]').click(); return 1;`); await sleep(500);
check("Clear empties the list", (await ev(`return document.querySelectorAll('#notification-panel .notification-list li').length`)) === 0);
writeFileSync(path.join(outDir, "notifications.json"), JSON.stringify({ origin, at: new Date().toISOString(), results }, null, 2));
ws.close(); stopBrowser(edge);
process.exit(results.every((r) => r.ok) ? 0 : 1);

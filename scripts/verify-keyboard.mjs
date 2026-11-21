// Keyboard-only check of every page in headless Microsoft Edge: Tab must reach
// every visible control on the page, each focused control must show a visible
// focus indicator, and Enter on a focused rail item must open its page.
// Usage: node scripts/verify-keyboard.mjs <origin> <password> <out-dir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const [origin, password, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const port = 9349;
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-keys-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.once("open", r));
let seq = 0; const pending = new Map();
ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (body) => { const r = await send("Runtime.evaluate", { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? "EXC " + (r.result.exceptionDetails.exception?.description || "").slice(0, 300) : r.result?.result?.value; };
const tab = async (shift = false) => {
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: shift ? 8 : 0 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: shift ? 8 : 0 });
};
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail); };
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
await ev(`let s=await (await fetch('/api/session')).json();
const post=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify(b)});
if(s.setupRequired) await post('/api/setup',{name:'owner',username:'owner',password:${JSON.stringify(password)}});
else if(!s.authenticated) await post('/api/login',{username:'owner',password:${JSON.stringify(password)}});
s=await (await fetch('/api/session')).json();
await post('/api/preferences',{setup:{step:8,complete:true}});
const st=await (await fetch('/api/state')).json();
if(!st.machines.length) await post('/api/machines',{name:'keyboard-check',arch:'x86_64',machineType:'q35',accelerator:'tcg',firmware:'bios',cpuModel:'max',sockets:1,cores:1,threads:1,cpus:1,memory:512,disks:[{id:'disk0',name:'System',sizeGiB:1,bus:'virtio',format:'qcow2',cache:'writeback',discard:false}],cdroms:[],network:{mode:'none'},display:{adapter:'std'}});
return 1;`);
// Mark every visible, enabled control, then Tab through the page.
const markControls = `
  const sel='a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"]),summary';
  let n=0;
  for (const el of document.querySelectorAll(sel)) {
    const r=el.getBoundingClientRect(), cs=getComputedStyle(el);
    const visible=r.width>0&&r.height>0&&cs.visibility!=='hidden'&&!el.closest('[hidden],[inert],dialog:not([open])');
    const usable=!el.disabled&&el.getAttribute('tabindex')!=='-1'&&!(el.type==='hidden');
    // Radio groups and roving tab stops expose one stop per group.
    if (visible&&usable&&!(el.getAttribute('role')==='tab'&&el.getAttribute('aria-selected')!=='true')&&!(el.type==='radio'&&!el.checked)) { el.dataset.kbd=String(n++); } else delete el.dataset.kbd;
  }
  return n;`;
for (const page of ["overview", "machines", "new", "storage", "settings", "history", "docs", "console"]) {
  await send("Page.navigate", { url: origin }); await sleep(2500);
  if (page === "console") {
    await ev(`document.querySelector('[data-action="page:machines"]').click(); return 1;`); await sleep(800);
    await ev(`document.querySelector('[data-action^="console:"]').click(); return 1;`);
  } else await ev(`document.querySelector('[data-action="page:${page}"]')?.click(); return 1;`);
  await sleep(1800);
  const total = await ev(markControls);
  await ev(`document.activeElement?.blur(); document.body.focus(); return 1;`);
  const seen = new Set(); const noRing = []; let presses = 0;
  while (presses < total + 40) {
    await tab(); presses++;
    const info = await ev(`const e=document.activeElement; if(!e||e===document.body) return null;
      const cs=getComputedStyle(e); const has=(c)=>(c.outlineStyle!=='none'&&parseFloat(c.outlineWidth)>0)||(c.boxShadow&&c.boxShadow!=='none'); const wrap=e.closest('.searchbar'); const ring=has(cs)||(wrap&&has(getComputedStyle(wrap)));
      return JSON.stringify({k:e.dataset.kbd??null, ring, label:(e.getAttribute('aria-label')||e.textContent||e.name||e.id||e.tagName).trim().slice(0,40)});`);
    if (!info) continue;
    const { k, ring, label } = JSON.parse(info);
    if (k !== null) seen.add(k);
    if (!ring) noRing.push(label);
    if (seen.size >= total) break;
  }
  const missed = await ev(`return JSON.stringify([...document.querySelectorAll('[data-kbd]')].filter(e=>!${JSON.stringify([...seen])}.includes(e.dataset.kbd)).map(e=>(e.getAttribute('aria-label')||e.textContent||e.id||e.tagName).trim().slice(0,40)))`);
  const missedList = JSON.parse(missed);
  check(`${page}: Tab reaches every control`, missedList.length === 0, `${seen.size}/${total} in ${presses} presses${missedList.length ? "; missed: " + missedList.slice(0, 6).join(" | ") : ""}`);
  check(`${page}: every focused control shows a focus ring`, noRing.length === 0, noRing.slice(0, 6).join(" | "));
}
// Enter on a focused rail item opens its page.
await send("Page.navigate", { url: origin }); await sleep(2500);
await ev(`document.querySelector('.rail [data-action="page:storage"]').focus(); return 1;`);
await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
await send("Input.dispatchKeyEvent", { type: "char", key: "Enter", text: "\r" });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
await sleep(1500);
check("Enter on a focused rail item opens its page", (await ev(`return document.querySelector('.rail [aria-current="page"]')?.dataset.action`)) === "page:storage");
writeFileSync(path.join(outDir, "keyboard.json"), JSON.stringify({ origin, at: new Date().toISOString(), results }, null, 2));
ws.close(); edge.kill();
process.exit(results.every((r) => r.ok) ? 0 : 1);

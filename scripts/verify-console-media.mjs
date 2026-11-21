// Proves console recording and annotation on a real running guest in headless
// Microsoft Edge: a stopped recording downloads a WebM, the 30-second limit stops
// a recording by itself, a browser without MediaRecorder gets a clear message,
// an annotated frame downloads separately from the untouched original, and
// signing out with an undownloaded recording asks first.
// Usage: node scripts/verify-console-media.mjs <origin> <password> <out-dir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { stopBrowser, ensurePortFree } from "./browser-process.mjs";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const [origin, password, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const downloads = path.join(outDir, "downloads");
rmSync(downloads, { recursive: true, force: true });
mkdirSync(downloads, { recursive: true });
const port = 9348;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-media-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
process.on("exit", () => stopBrowser(edge));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.once("open", r));
let seq = 0; const pending = new Map(); const dialogs = [];
ws.on("message", (m) => {
  const d = JSON.parse(m);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === "Page.javascriptDialogOpening") { dialogs.push(d.params.message); send("Page.handleJavaScriptDialog", { accept: false }); }
});
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (body) => { const r = await send("Runtime.evaluate", { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? "EXC " + (r.result.exceptionDetails.exception?.description || "").slice(0, 300) : r.result?.result?.value; };
const click = (sel) => ev(`const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'missing'; if(e.disabled) return 'disabled'; e.click(); return 'ok';`);
const status = () => ev(`return document.querySelector('#console-media-status')?.textContent || ''`);
const notice = () => ev(`return document.querySelector('#notice')?.textContent || ''`);
const files = () => readdirSync(downloads).filter((f) => !f.endsWith(".crdownload"));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail); };
await send("Page.enable"); await send("Runtime.enable");
await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
const id = await ev(`let s=await (await fetch('/api/session')).json();
const post=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify(b)});
if(s.setupRequired) await post('/api/setup',{name:'owner',username:'owner',password:${JSON.stringify(password)}});
else if(!s.authenticated) await post('/api/login',{username:'owner',password:${JSON.stringify(password)}});
s=await (await fetch('/api/session')).json();
await post('/api/preferences',{setup:{step:8,complete:true}});
let st=await (await fetch('/api/state')).json();
if(!st.machines.length){ await post('/api/machines',{name:'media-check',arch:'x86_64',machineType:'q35',accelerator:'tcg',firmware:'uefi',cpuModel:'max',sockets:1,cores:2,threads:1,cpus:2,memory:1024,disks:[{id:'disk0',name:'System',sizeGiB:2,bus:'virtio',format:'qcow2',cache:'writeback',discard:true}],cdroms:[],network:{mode:'none'},display:{adapter:'virtio'}}); st=await (await fetch('/api/state')).json(); }
const m=st.machines[0]; if(m.state!=='running') await fetch('/api/machines/'+m.id+'/actions',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({action:'start'})}); return m.id;`);
await send("Page.navigate", { url: origin }); await sleep(3000);
await click('[data-action="page:machines"]'); await sleep(1000);
await click(`[data-action="console:${id}"]`); await sleep(25000);

// Record, stop, download.
console.log("record", await click('[data-action="console-record"]')); await sleep(4000);
const during = await status();
check("recording reports its progress", /Recording/.test(during), during);
console.log("stop", await click('[data-action="console-record"]')); await sleep(2500);
check("stopping makes the clip downloadable", (await ev(`return !document.querySelector('[data-action="console-record-download"]').hidden`)) === true, await status());
await click('[data-action="console-record-download"]'); await sleep(3000);
const webm = files().find((f) => f.endsWith("-recording.webm"));
const header = webm ? readFileSync(path.join(downloads, webm)).subarray(0, 4).toString("hex") : "";
check("the download is a WebM file", header === "1a45dfa3", `${webm || "none"} ${webm ? readFileSync(path.join(downloads, webm)).length : 0} bytes`);

// The 30-second limit stops a recording on its own.
await click('[data-action="console-record"]'); await sleep(33000);
const limited = await status();
check("a recording stops itself at 30 seconds", /ready: (29|30)\.\d seconds/.test(limited), limited);
await click('[data-action="console-record-download"]'); await sleep(2000);

// Signing out with an undownloaded recording asks first.
await click('[data-action="console-record"]'); await sleep(2500);
await click('[data-action="console-record"]'); await sleep(2500);
await click('[data-action="logout"]'); await sleep(1500);
check("signing out with an undownloaded clip asks first", dialogs.some((m) => /not been downloaded/.test(m)), dialogs.at(-1) || "no dialog");
check("declining keeps the session", (await ev(`return (await (await fetch('/api/session')).json()).authenticated`)) === true);

// A browser without MediaRecorder gets a clear message and nothing starts.
await ev(`window.MediaRecorder = undefined; return 1;`);
await click('[data-action="console-record-download"]'); await sleep(1000);
await click('[data-action="console-record"]'); await sleep(1500);
const unsupported = await notice();
check("a browser without recording support is told so", /unavailable in this browser/.test(unsupported), unsupported);

// Annotate: the original and the annotated frame are separate downloads.
console.log("annotate", await click('[data-action="console-annotate"]')); await sleep(1500);
await click('[data-action="annotation-line"]'); await sleep(500);
await ev(`const t=document.querySelector('#annotation-text'); t.value='Boot menu here'; return 1;`);
await click('[data-action="annotation-text-add"]'); await sleep(500);
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(path.join(outDir, "annotation-editor.png"), Buffer.from(shot.result.data, "base64"));
await click('[data-action="annotation-original"]'); await sleep(2500);
await ev(`document.querySelector('#dialog-form').requestSubmit(); return 1;`); await sleep(3000);
const raw = files().find((f) => f.endsWith("-raw.png"));
const annotated = files().find((f) => f.endsWith("-annotated.png"));
check("original and annotated frames download separately", Boolean(raw && annotated), `${raw || "no original"} / ${annotated || "no annotated"}`);
if (raw && annotated) {
  const a = readFileSync(path.join(downloads, raw)), b = readFileSync(path.join(downloads, annotated));
  check("the annotated frame differs from the original", !a.equals(b), `${a.length} vs ${b.length} bytes`);
}
writeFileSync(path.join(outDir, "console-media.json"), JSON.stringify({ origin, at: new Date().toISOString(), downloads: files(), results }, null, 2));
await ev(`const s=await (await fetch('/api/session')).json(); await fetch('/api/machines/${id}/actions',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({action:'poweroff'})}); return 1;`);
ws.close(); stopBrowser(edge);
process.exit(results.every((r) => r.ok) ? 0 : 1);

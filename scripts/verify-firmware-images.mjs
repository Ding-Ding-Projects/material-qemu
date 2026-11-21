// Checks custom firmware images end to end in headless Microsoft Edge: two
// files (copies of QEMU's own SeaBIOS and OVMF code) are added through the
// Storage page's Firmware tab, offered in the create form, and machines using
// them start in real QEMU with those files on the command line. A file in use
// cannot be deleted. Windows only: reads QEMU's command line from the process.
// Usage: node scripts/verify-firmware-images.mjs <origin> <password> <out-dir> <qemu-share-dir>
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { stopBrowser, ensurePortFree } from "./browser-process.mjs";
import { redactPaths } from "./redact-paths.mjs";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const [origin, password, outDir, share] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const suffix = Date.now() % 1000000;
const files = path.join(outDir, "files");
mkdirSync(files, { recursive: true });
const biosName = `seabios-${suffix}.bin`, uefiName = `ovmf-${suffix}.fd`;
copyFileSync(path.join(share, "bios.bin"), path.join(files, biosName));
copyFileSync(path.join(share, "edk2-x86_64-code.fd"), path.join(files, uefiName));
const port = 9367;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-fw-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
const commandLine = (id) => spawnSync("powershell.exe", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "Name like 'qemu-system%'" | Where-Object { $_.CommandLine -match '${id}' } | Select-Object -First 1).CommandLine`], { encoding: "utf8" }).stdout.trim();
await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
await ev(`let s=await (await fetch('/api/session')).json();
const post=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify(b)});
if(s.setupRequired) await post('/api/setup',{name:'owner',username:'owner',password:${JSON.stringify(password)}});
else if(!s.authenticated) await post('/api/login',{username:'owner',password:${JSON.stringify(password)}});
s=await (await fetch('/api/session')).json();
await post('/api/preferences',{setup:{step:8,complete:true},settings:{language:'en'}}); return 1;`);
await send("Page.navigate", { url: origin }); await sleep(2500);
await ev(`document.querySelector('[data-action="page:storage"]').click(); return 1;`); await sleep(800);
await ev(`document.querySelector('[data-action="storage-tab:firmware"]').click(); return 1;`);
await waitFor(`document.querySelector('#firmware-file')`);
for (const name of [biosName, uefiName]) {
  const doc = await send("DOM.getDocument", { depth: -1 });
  const node = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: "#firmware-file" });
  await send("DOM.setFileInputFiles", { nodeId: node.result.nodeId, files: [path.join(files, name)] });
  await waitFor(`document.querySelector('.firmware-zone [role=status]')?.innerText.includes('Added ${name}')`, 10000);
}
const listed = await ev(`return [...document.querySelectorAll('.rows .storage-row strong')].map((e)=>e.innerText).join(',')`);
check("Both images are added through the Firmware tab and listed", listed.includes(biosName) && listed.includes(uefiName), listed);
await shot("storage-firmware");
const again = await ev(`const s=await (await fetch('/api/session')).json(); const r=await fetch('/api/firmware?name=${biosName}',{method:'POST',headers:{'content-type':'application/octet-stream','x-csrf-token':s.csrf},body:new Uint8Array(4)}); return r.status + ' ' + (await r.json()).error`);
check("Uploading the same name again is refused, nothing overwritten", /^400 .*never overwritten/.test(again), again);
await ev(`document.querySelector('[data-action="new"]').click(); return 1;`);
await waitFor(`document.querySelector('#f-firmwareImage')`);
await waitFor(`document.querySelectorAll('#f-firmwareImage option').length >= 3`);
const offered = await ev(`return [...document.querySelectorAll('#f-firmwareImage option')].map((o)=>o.value || 'built-in').join(',')`);
check("The create form offers built-in firmware and both images", offered.startsWith("built-in") && offered.includes(biosName) && offered.includes(uefiName), offered);
await ev(`const n=document.querySelector('#f-name'); n.value='fw-preview-${suffix}'; n.dispatchEvent(new Event('input',{bubbles:true})); return 1;`); await sleep(400);
await ev(`const e=document.querySelector('#f-firmwareImage'); e.value=${JSON.stringify(biosName)}; e.dispatchEvent(new Event('change',{bubbles:true})); return 1;`); await sleep(1500);
const preview = await ev(`return document.querySelector('#command-preview')?.innerText || ''`);
check("The launch preview uses the chosen image", preview.includes(`"-bios" "<firmware image ${biosName}>"`), (preview.match(/"-bios" "[^"]*"/) || [preview.slice(0, 160)])[0]);
await shot("form-firmware");
const make = (name, firmware, image) => ev(`const s=await (await fetch('/api/session')).json(); const r=await fetch('/api/machines',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({name:'${name}',arch:'x86_64',machineType:'q35',accelerator:'tcg',firmware:'${firmware}',firmwareImage:'${image}',cpus:1,memory:256,disks:[{name:'system',sizeGiB:1,bus:'virtio',format:'qcow2'}],network:{mode:'none'}})}); const m=await r.json(); const id=(m.machine||m).id; const a=await fetch('/api/machines/'+id+'/action',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({action:'start'})}); return id + ' ' + a.status;`);
const [biosId, biosStart] = (await make(`fw-bios-${suffix}`, "bios", biosName)).split(" ");
const [uefiId, uefiStart] = (await make(`fw-uefi-${suffix}`, "uefi", uefiName)).split(" ");
await sleep(2500);
const biosLine = commandLine(biosId), uefiLine = commandLine(uefiId);
check("A BIOS machine boots the custom image as -bios", biosStart === "200" && new RegExp(`-bios "?[^"]*firmware[\\\\/]${biosName}`).test(biosLine), (biosLine.match(/-bios \S+/) || [biosStart])[0]);
check("A UEFI machine boots the custom image as its UEFI code", uefiStart === "200" && uefiLine.includes(`unit=0,readonly=on,file=`) && uefiLine.includes(`firmware\\${uefiName}`), (uefiLine.match(/unit=0,readonly=on,file=[^"]*/) || [uefiStart])[0]);
const states = await ev(`const st=(await (await fetch('/api/state')).json()).machines; return ['${biosId}','${uefiId}'].map((id)=>st.find((m)=>m.id===id)?.state).join(',')`);
check("Both machines are running in QEMU", states === "running,running", states);
const del = await ev(`const s=await (await fetch('/api/session')).json(); const r=await fetch('/api/firmware/${biosName}',{method:'DELETE',headers:{'x-csrf-token':s.csrf}}); return r.status + ' ' + (await r.json()).error`);
check("An image in use cannot be deleted", /^400 .*used by fw-bios-/.test(del), del);
await ev(`document.querySelector('[data-action="page:storage"]').click(); return 1;`); await sleep(500);
await ev(`document.querySelector('[data-action="storage-tab:firmware"]').click(); return 1;`);
await waitFor(`document.querySelectorAll('.rows .storage-row').length >= 2`);
await sleep(800);
await shot("storage-in-use");
for (const id of [biosId, uefiId]) await ev(`const s=await (await fetch('/api/session')).json(); await fetch('/api/machines/${id}/action',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({action:'stop'})}); return 1;`);
writeFileSync(path.join(outDir, "firmware-images.json"), redactPaths(JSON.stringify({ origin, at: new Date().toISOString(), results }, null, 2), { data: process.env.DATA_DIR }));
ws.close(); stopBrowser(edge);
process.exit(results.every((r) => r.ok) ? 0 : 1);

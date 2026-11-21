// Checks the cloud-init seed end to end in headless Microsoft Edge: the Boot
// section turns the seed on and fills the example user-data, the machine starts
// in QEMU with the seed on its command line, and the seed file QEMU was given
// holds the user-data and meta-data naming the machine. With a Linux kernel and
// initramfs given, it also boots them against that seed and has Linux read it
// by its cidata label. Windows only (reads QEMU's command line, uses 7-Zip).
// Usage: node scripts/verify-cloud-init.mjs <origin> <password> <out-dir> <data-dir> [vmlinuz initrd]
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { stopBrowser, ensurePortFree } from "./browser-process.mjs";
import { redactPaths } from "./redact-paths.mjs";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const [origin, password, outDir, dataDir, kernel, initrd] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const suffix = Date.now() % 1000000;
const port = 9369;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-ci-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
await ev(`let s=await (await fetch('/api/session')).json();
const post=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify(b)});
if(s.setupRequired) await post('/api/setup',{name:'owner',username:'owner',password:${JSON.stringify(password)}});
else if(!s.authenticated) await post('/api/login',{username:'owner',password:${JSON.stringify(password)}});
s=await (await fetch('/api/session')).json();
await post('/api/preferences',{setup:{step:8,complete:true},settings:{language:'en'}}); return 1;`);
await send("Page.navigate", { url: origin }); await sleep(2500);
const name = `Cloud Seed ${suffix}`;
await click('[data-action="new"]');
await waitFor(`document.querySelector('#f-name')`);
await ev(`const n=document.querySelector('#f-name'); n.value=${JSON.stringify(name)}; n.dispatchEvent(new Event('input',{bubbles:true})); return 1;`);
await click('[data-action="cfg-section:boot"]');
await waitFor(`document.querySelector('[data-action="cfg-toggle:cloudInit.enabled"]')`);
await click('[data-action="cfg-toggle:cloudInit.enabled"]');
await waitFor(`document.querySelector('[data-action="cfg-cloud-template"]')`);
await click('[data-action="cfg-cloud-template"]');
await waitFor(`document.querySelector('[id="f-cloudInit.userData"]')?.value.startsWith('#cloud-config')`);
await sleep(1200);
const preview = await ev(`return document.querySelector('#command-preview')?.innerText || ''`);
check("The launch preview attaches the seed read-only, not as a boot device", preview.includes("<cloud-init seed>") && preview.includes("id=cd-cloud-init") && !/cd-cloud-init,bootindex/.test(preview), (preview.match(/"file=<cloud-init seed>[^"]*"/) || [""])[0]);
await ev(`document.querySelector('[id="f-cloudInit.userData"]').scrollIntoView({block:'center'}); return 1;`); await sleep(300);
await shot("form-cloud-init");
await click('[data-action="wizard-create-start"]');
const id = await ev(`for (let i = 0; i < 100; i++) { const m = (await (await fetch('/api/state')).json()).machines.find((x) => x.name === ${JSON.stringify(name)}); if (m && m.state === 'running') return m.id; await new Promise((r) => setTimeout(r, 200)); } return 'not running';`);
check("The machine starts in QEMU", /^[a-f0-9-]{36}$/.test(id), id);
const line = spawnSync("powershell.exe", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "Name like 'qemu-system%'" | Where-Object { $_.CommandLine -match '${id}' } | Select-Object -First 1).CommandLine`], { encoding: "utf8" }).stdout.trim();
const seedPath = (line.match(/file=([^,"]*cloud-init-seed\.iso)/) || [])[1];
check("QEMU was given the seed as a read-only CD", Boolean(seedPath) && line.includes("readonly=on,id=cloud-init-seed"), seedPath || line.slice(0, 120));
const copy = path.join(outDir, "seed-from-qemu.iso");
if (seedPath) copyFileSync(seedPath, copy);
const sevenZip = "C:/Program Files/7-Zip/7z.exe";
const read = (file) => spawnSync(sevenZip, ["e", "-so", copy, file], { encoding: "utf8" }).stdout;
const meta = seedPath ? read("meta-data") : "", user = seedPath ? read("user-data") : "";
check("The seed's meta-data names the machine", meta === `instance-id: ${id}\nlocal-hostname: cloud-seed-${suffix}\n`, JSON.stringify(meta));
check("The seed's user-data is what the form saved", user.startsWith("#cloud-config\nusers:\n  - name: admin"), JSON.stringify(user.slice(0, 40)));
await ev(`const b=[...document.querySelectorAll('[data-action]')].find((x)=>x.dataset.action.includes('${id}') && /console|open/.test(x.dataset.action)); b?.click(); return 1;`);
await waitFor(`document.querySelector('[data-action="machine-tab:hardware"]')`);
await click('[data-action="machine-tab:hardware"]'); await sleep(600);
const hw = await ev(`return document.querySelector('#machine-tab-panel')?.innerText.replace(/\\s+/g,' ') || ''`);
check("The Hardware tab reports the seed", /Cloud-init seed On · \d+ bytes of user-data/.test(hw), (hw.match(/Cloud-init seed [^A-Z]*/) || [""])[0]);
await ev(`const s=await (await fetch('/api/session')).json(); await fetch('/api/machines/${id}/action',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({action:'stop'})}); return 1;`);
if (kernel && initrd && seedPath) {
  // Linux reads the very seed QEMU was given, by its label, the way cloud-init's NoCloud source looks for it.
  const q = spawn("C:/Program Files/qemu/qemu-system-x86_64.exe", ["-machine", "q35", "-accel", "tcg", "-m", "1024", "-display", "none", "-serial", "stdio", "-monitor", "none", "-kernel", kernel, "-initrd", initrd, "-append", "console=ttyS0 break=premount", "-device", "virtio-scsi-pci,id=media-scsi", "-drive", `file=${copy},format=raw,if=none,media=cdrom,readonly=on,id=cloud-init-seed`, "-device", "scsi-cd,drive=cloud-init-seed,bus=media-scsi.0,id=cd-cloud-init", "-no-reboot"]);
  const lines = ["modprobe sr_mod; modprobe isofs; sleep 2", "echo LABEL-CHECK; blkid /dev/sr0", "mkdir -p /seed; mount -t iso9660 -o ro /dev/sr0 /seed", "echo META; cat /seed/meta-data", "poweroff -f"];
  let log = "", prompts = 0;
  const type = async (l) => { for (const ch of l + "\n") { q.stdin.write(ch); await sleep(8); } };
  q.stdout.on("data", async (d) => { log += d; const n = (log.match(/\(initramfs\) /g) || []).length; if (n > prompts && lines.length) { prompts = n; await type(lines.shift()); } });
  await new Promise((resolve) => { const timer = setTimeout(() => { q.kill(); resolve(); }, 240000); q.on("close", () => { clearTimeout(timer); resolve(); }); });
  writeFileSync(path.join(outDir, "linux-serial.log"), redactPaths(log, { data: dataDir }));
  check("Linux finds the seed by its cidata label and reads the meta-data", /\/dev\/sr0:.*LABEL="cidata".*TYPE="iso9660"/.test(log) && log.includes(`instance-id: ${id}`), (log.match(/\/dev\/sr0:[^\r\n]*/) || ["no blkid line"])[0]);
}
writeFileSync(path.join(outDir, "cloud-init.json"), redactPaths(JSON.stringify({ origin, at: new Date().toISOString(), results }, null, 2), { data: dataDir }));
ws.close(); stopBrowser(edge);
process.exit(results.every((r) => r.ok) ? 0 : 1);

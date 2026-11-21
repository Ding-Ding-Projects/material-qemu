// Full first-run walkthrough of the web app in headless Microsoft Edge, saving one
// screenshot per step. It signs up the first owner, completes onboarding, creates
// and starts a UEFI machine, opens its console, takes a snapshot and visits every page.
// Run it against a server with an empty data directory.
// Usage: node scripts/walkthrough.mjs <origin> <outDir> <password>
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const [origin, outDir, password] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const profile = path.join(os.tmpdir(), "mq-walkthrough-" + Date.now());

const port = 9345;
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.once("open", r));
let seq = 0; const pending = new Map();
ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (body) => { const r = await send("Runtime.evaluate", { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? "EXC " + (r.result.exceptionDetails.exception?.description || "").slice(0, 200) : r.result?.result?.value; };
const steps = [];
let n = 0;
const shot = async (slug, title) => {
  await sleep(1800);
  const r = await send("Page.captureScreenshot", { format: "png" });
  const file = `${String(++n).padStart(2, "0")}-${slug}.png`;
  writeFileSync(path.join(outDir, file), Buffer.from(r.result.data, "base64"));
  steps.push({ file, title });
  console.log("saved", file, "-", title);
};
const click = async (sel) => { const r = await ev(`const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'missing'; e.scrollIntoView({block:'center'}); e.click(); return 'ok';`); if (r !== "ok") console.log("click", sel, r); return r; };
const type = (sel, value) => ev(`const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'missing'; e.focus(); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return 'ok';`);
const setField = (key, value) => type(`[data-f="${key}"]`, String(value));
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
await send("Page.navigate", { url: origin }); await sleep(3000);

// 1. First run: the first account becomes the owner.
await shot("first-run", "First run: create the owner account (the first account becomes the owner)");
await type("#owner", "owner");
await type("#password", password);
await shot("owner-filled", "Owner name and a password of at least 12 characters entered");
await click('#auth-form button[type="submit"]'); await sleep(3000);

// 2. Guided onboarding.
await shot("onboarding", "Guided setup starts; progress is saved automatically");
for (let i = 0; i < 10; i++) {
  const done = await ev(`return !document.querySelector('[data-action="setup-next"],[data-action="setup-finish"]')`);
  if (done) break;
  if (await ev(`return !!document.querySelector('[data-action="setup-finish"]')`)) { await shot("onboarding-review", "Final review step of setup"); await click('[data-action="setup-finish"]'); await sleep(3000); break; }
  const before = await ev(`return document.querySelector('.wizard-content h2')?.textContent`);
  await click('[data-action="setup-next"]'); await sleep(2500);
  const after = await ev(`return document.querySelector('.wizard-content h2')?.textContent`);
  if (after === before && (await ev(`return !!document.querySelector('[data-action="setup-skip"]')`))) { await click('[data-action="setup-skip"]'); await sleep(1500); }
}

// 3. Dashboard.
await shot("dashboard-empty", "The dashboard before any machine exists");

// 4. New machine form, section by section.
await click('[data-action="page:new"]'); await sleep(1500);
await type("#f-name", "debian-desktop");
await click('[data-action="cfg-preset:desktop"]'); await sleep(800);
await shot("new-machine-preset", "New machine: name it and pick a preset");
await click('[data-action="cfg-section:system"]'); await sleep(500);
await setField("firmware", "uefi"); await sleep(1000);
await shot("new-machine-firmware", "System and firmware: UEFI selected; the launch preview updates on the right");
await click('[data-action="cfg-section:cpu"]'); await sleep(600);
await shot("new-machine-cpu", "CPU and memory");
await click('[data-action="cfg-section:disks"]'); await sleep(600);
await click('[data-action="cfg-add-disk"]'); await sleep(800);
await shot("new-machine-disks", "Disks: a second data disk added");
await click('[data-action="cfg-section:network"]'); await sleep(600);
await click('[data-action="cfg-add-fwd"]'); await sleep(600);
await setField("network.forwards.0.hostPort", 2222); await setField("network.forwards.0.guestPort", 22); await sleep(600);
await shot("new-machine-network", "Network: a port forward from host port 2222 to guest port 22");
await click('[data-action="cfg-section:display"]'); await sleep(600);
await shot("new-machine-display", "Display and devices");
await click('[data-action="cfg-section:boot"]'); await sleep(600);
await shot("new-machine-boot", "Boot order and automation");

// 5. Create and start.
await click('[data-action="wizard-create-start"]'); await sleep(12000);
await shot("machine-running", "Create and start: the machine page with the live console");

// 6. Snapshot from the machine page.
await click('[data-action="snap-take"]'); await sleep(800);
await ev(`const i=document.querySelector('#dialog-form [name="snapName"]'); if(i) i.value='first-boot'; return 1;`);
await shot("snapshot-dialog", "Take snapshot: name it");
await ev(`document.querySelector('#dialog-form')?.requestSubmit(); return 1;`); await sleep(4000);
await shot("snapshot-taken", "The snapshot appears in the timeline");

// 7. Dashboard, machines, storage and settings with the machine running.
await click('[data-action="page:overview"]'); await sleep(6000);
await shot("dashboard-running", "Dashboard with a live thumbnail of the running machine");
await click('[data-action="page:machines"]'); await sleep(1500);
await shot("machines", "Machines list with filters and the power button");
await click('[data-action="page:storage"]'); await sleep(2500);
await shot("storage", "Storage: both disks, with resize, clone and attach actions");
await click('[data-action="page:settings"]'); await sleep(1500);
await shot("settings", "Settings: colour seed, theme, language, motion, passkeys and host facts");

// 8. Power off through the two-key confirmation.
const id = await ev(`return (await (await fetch('/api/state')).json()).machines[0].id`);
await ev(`location.hash=''; return 1`);
await click('[data-action="page:machines"]'); await sleep(1200);
await click(`[data-action="console:${id}"]`); await sleep(3000);
await click(`[data-action="lifecycle:${id}:stop"]`); await sleep(1000);
const gate = await ev(`return !!document.querySelector('#dialog [data-gate-key]')`);
if (gate) {
  await ev(`document.querySelectorAll('#dialog [data-gate-key]').forEach(k=>k.click()); return 1;`); await sleep(500);
  await ev(`const s=document.querySelector('#gate-slider'); s.value='60'; s.dispatchEvent(new Event('input',{bubbles:true})); return 1;`);
  await shot("power-off-gate", "Power off needs both keys and a full slide");
  await ev(`const s=document.querySelector('#gate-slider'); s.value='100'; s.dispatchEvent(new Event('input',{bubbles:true})); return 1;`); await sleep(4000);
  await shot("powered-off", "The machine is powered off");
} else console.log("no power-off gate found");

// 9. Narrow screen.
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await click('[data-action="page:overview"]'); await sleep(2500);
await shot("phone", "On a phone the rail becomes a bottom bar; nothing is removed");
const overflow = await ev(`return document.documentElement.scrollWidth - innerWidth`);
writeFileSync(path.join(outDir, "walkthrough.json"), JSON.stringify({ origin, at: new Date().toISOString(), steps, phoneOverflow: overflow }, null, 2));
console.log("phone overflow", overflow);
ws.close(); edge.kill();

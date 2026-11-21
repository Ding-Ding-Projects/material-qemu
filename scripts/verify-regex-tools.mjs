// Checks the regex builder tools in headless Microsoft Edge against a real
// server: Explain, Test (matches and groups), Replace, Split, the one-second
// stop for a catastrophic pattern, and the saved library across a reload.
// Usage: node scripts/verify-regex-tools.mjs <origin> <password> <out-dir>
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
const port = 9355;
await ensurePortFree(port);
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), "mq-rx-" + Date.now())}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
process.on("exit", () => stopBrowser(edge));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.once("open", r));
let seq = 0; const pending = new Map();
ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (body) => { if (process.env.VERIFY_TRACE) console.log("EV", body.slice(0, 90).replace(/\s+/g, " ")); const r = await send("Runtime.evaluate", { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? "EXC " + (r.result.exceptionDetails.exception?.description || "").slice(0, 300) : r.result?.result?.value; };
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(ok ? "PASS" : "FAIL", name, detail); };
const typeSearch = (text) => ev(`const i=document.querySelector('#global-search'); i.value=${JSON.stringify(text)}; i.dispatchEvent(new Event('input',{bubbles:true})); return 1;`);
const tab = (name) => ev(`document.querySelector('[data-action="regex-tab:${name}"]').click(); return 1;`);
const setValue = (sel, v) => ev(`const e=document.querySelector(${JSON.stringify(sel)}); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('input',{bubbles:true})); return 1;`);
const output = () => ev(`return document.querySelector('#regex-output')?.innerText || ''`);
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.result.data, "base64")); };
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: origin }); await sleep(2500);
await ev(`let s=await (await fetch('/api/session')).json();
const post=(u,b)=>fetch(u,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf||''},body:JSON.stringify(b)});
if(s.setupRequired) await post('/api/setup',{name:'owner',username:'owner',password:${JSON.stringify(password)}});
else if(!s.authenticated) await post('/api/login',{username:'owner',password:${JSON.stringify(password)}});
s=await (await fetch('/api/session')).json();
await post('/api/preferences',{setup:{step:8,complete:true}});
const st=await (await fetch('/api/state')).json();
const mk=(name)=>post('/api/machines',{name,arch:'x86_64',machineType:'q35',accelerator:'tcg',cpus:1,memory:512,diskGiB:1,network:'none'});
if(!st.machines.length){ await mk('debian-13-dev'); await mk('win11-test'); await mk('ubuntu-server'); }
localStorage.setItem('mq-search', JSON.stringify({regex:true,flags:{i:true,m:true},fields:['name','notes','folder','tags','arch']}));
return 1;`);
await send("Page.navigate", { url: origin }); await sleep(3000);
await ev(`document.querySelector('[data-action="page:machines"]').click(); return 1;`); await sleep(1200);
await typeSearch("^(?<os>debian|win)\\w*"); await sleep(800);
const explain = await ev(`return [...document.querySelectorAll('.explain li')].map(li=>li.innerText.replace(/\\s+/g,' ')).join(' | ')`);
check("Explain describes each part, including the named group", /named os/.test(explain) && /start of the text/.test(explain), explain.slice(0, 160));
await shot("explain");
await tab("test"); await sleep(1500);
let out = await output();
check("Test lists the matches", /2 matches/.test(out), JSON.stringify(out.slice(0, 120)));
check("Test shows numbered and named groups", (await ev(`return document.querySelector('.regex-matches')?.innerText||''`)).includes("os=debian"));
await shot("test");
await tab("replace"); await sleep(400);
await setValue("#regex-replacement", "[$<os>]"); await sleep(1200);
out = await output();
check("Replace previews the result without changing anything", out.includes("[debian]") && out.includes("[win]"), out.split("\n").slice(1, 3).join(" / "));
await tab("split"); await sleep(400);
await typeSearch("\\t"); await sleep(1200);
out = await output();
check("Split cuts the sample at each match", /^\d+ parts/m.test(out) && Number(out.match(/^(\d+) parts/m)?.[1]) >= 9, out.split("\n")[0]);
await tab("test"); await sleep(300);
await setValue("#regex-sample", "a".repeat(32) + "!");
await typeSearch("(a+)+$"); await sleep(2500);
out = await output();
check("A catastrophic pattern is stopped after one second", /Stopped after one second/.test(out), out.slice(0, 100));
await shot("stopped");
await setValue("#regex-sample", "debian-13-dev\nwin11-test\nubuntu-server");
await typeSearch("server$"); await tab("library"); await sleep(400);
await ev(`document.querySelector('#regex-lib-name').value='Servers'; document.querySelector('[data-action="regex-save"]').click(); return 1;`); await sleep(600);
await send("Page.navigate", { url: origin }); await sleep(3000);
await ev(`document.querySelector('[data-action="page:machines"]').click(); return 1;`); await sleep(1000);
await tab("library"); await sleep(400);
const libText = await ev(`return document.querySelector('.regex-library')?.innerText || ''`);
check("The library keeps a saved pattern after a reload", /Servers/.test(libText) && /server\$/.test(libText), libText.replace(/\s+/g, " "));
await ev(`document.querySelector('[data-action="regex-use:0"]').click(); return 1;`); await sleep(1500);
check("Using a saved pattern puts it in the search", (await ev(`return document.querySelector('#global-search').value`)) === "server$");

// Debugger: step through a match that has to back up.
await tab("debug"); await sleep(300);
await setValue("#regex-sample", "aaac aab");
await typeSearch("a+b"); await sleep(1800);
const summary = await ev(`return document.querySelector('#regex-debug-summary')?.innerText || ''`);
check("Debug finds the same match as the engine and counts steps", /Match “aab” at 5–8 after \d+ steps/.test(summary), summary);
const steps = Number((await ev(`return document.querySelector('#regex-step-label')?.innerText || ''`)).split("/")[1]);
await ev(`for (let i = 0; i < 6; i++) document.querySelector('[data-action="regex-step:next"]').click(); return 1;`); await sleep(300);
const now = await ev(`return [document.querySelector('#regex-step-label').innerText, document.querySelector('.debug-now').innerText, document.querySelector('.debug-views mark')?.innerText || ''].join(' | ')`);
check("Next steps forward and shows the pattern part being tried", now.startsWith(`7 / ${steps}`) && /Try|Matched|Failed|Back up/.test(now), now);
await ev(`document.querySelector('[data-action="regex-step:last"]').click(); return 1;`); await sleep(300);
check("Last goes to the found match", /Match found/.test(await ev(`return document.querySelector('.debug-now').innerText`)));
const backtracks = await ev(`document.querySelector('#regex-step-range').value='4'; document.querySelector('#regex-step-range').dispatchEvent(new Event('input',{bubbles:true})); return document.querySelector('#regex-step-label').innerText`);
check("The step slider jumps to a step", backtracks.startsWith("4 /"), backtracks);
await shot("debug");
await typeSearch("(?<=a)b"); await sleep(1500);
check("Look-behind is refused by the debugger, not guessed", /cannot step through look-behind/.test(await output()));

// Other flavours and code.
await typeSearch("(?<year>\\d{4})-\\k<year>(?=x)"); await tab("flavours"); await sleep(500);
const fl = await ev(`return document.querySelector('.regex-flavours')?.innerText.replace(/\\s+/g,' ') || ''`);
check("Other flavours marks Go as not working and converts for Python", /Go \(RE2\) Does not work/.test(fl) && fl.includes("(?P<year>\\d{4})-(?P=year)(?=x)"), fl.slice(0, 160));
await shot("flavours");
await tab("code"); await sleep(300);
await ev(`document.querySelector('[data-action="regex-lang:Python"]').click(); return 1;`); await sleep(300);
const py = await ev(`return document.querySelector('#regex-code')?.innerText || ''`);
check("Code generates Python with the converted named groups and flags", py.includes('re.compile(r"(?P<year>\\d{4})-(?P=year)(?=x)", re.IGNORECASE | re.MULTILINE)'), py.split("\n")[2]);
await ev(`document.querySelector('[data-action="regex-lang:C#"]').click(); return 1;`); await sleep(300);
check("Code switches language", (await ev(`return document.querySelector('#regex-code')?.innerText || ''`)).includes("new Regex(@\""));
await shot("code");

// Search local files: they are read in the browser, never uploaded.
const filesDir = path.join(outDir, "sample-files");
mkdirSync(filesDir, { recursive: true });
writeFileSync(path.join(filesDir, "qemu-a.log"), "boot ok\nERROR disk not found\nwarning: slow\nerror again\n");
writeFileSync(path.join(filesDir, "qemu-b.log"), "all fine\nnothing here\n");
await typeSearch("error"); await tab("files"); await sleep(400);
await send("DOM.enable");
const doc = await send("DOM.getDocument", { depth: -1 });
const node = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: "#regex-files" });
const uploadsBefore = await ev(`return performance.getEntriesByType('resource').filter((e) => /upload|import/i.test(e.name)).length`);
await send("DOM.setFileInputFiles", { nodeId: node.result.nodeId, files: [path.join(filesDir, "qemu-a.log"), path.join(filesDir, "qemu-b.log")] });
await sleep(2000);
out = await output();
check("Search files lists matching lines from the chosen files", /2 matching lines in 1 of 2 files/.test(out) && /qemu-a\.log/.test(out), out.split("\n")[0]);
const uploadsAfter = await ev(`return performance.getEntriesByType('resource').filter((e) => /upload|import/i.test(e.name)).length`);
check("Chosen files are not sent to the server", uploadsAfter === uploadsBefore);
await shot("files");

// Cantonese and phone width: every new tab renders its own labels with no sideways scrolling.
const setLang = (lang) => ev(`const s=await (await fetch('/api/session')).json(); await fetch('/api/preferences',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':s.csrf},body:JSON.stringify({settings:{language:'${lang}'}})}); return 1;`);
await setLang("yue");
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: origin }); await sleep(3000);
await ev(`document.querySelector('[data-action="page:machines"]').click(); return 1;`); await sleep(1000);
await typeSearch("a+b"); await sleep(400);
const narrow = [];
for (const [name, label] of [["debug", "除錯"], ["flavours", "其他語法"], ["code", "程式碼"], ["files", "搜尋檔案"]]) {
  await tab(name); await sleep(1500);
  const overflow = await ev(`return document.documentElement.scrollWidth - innerWidth`);
  const shown = await ev(`return document.querySelector('[data-action="regex-tab:${name}"]').innerText`);
  narrow.push(`${name}:${shown}:${overflow}`);
  if (name === "debug") await shot("debug-375-yue");
}
check("New tabs are in Cantonese and fit 375 pixels without sideways scrolling", narrow.every((x) => x.endsWith(":0")) && narrow.join(" ").includes("除錯") && narrow.join(" ").includes("搜尋檔案"), narrow.join(" "));
await setLang("en");
writeFileSync(path.join(outDir, "regex-tools.json"), JSON.stringify({ origin, at: new Date().toISOString(), results }, null, 2));
ws.close(); stopBrowser(edge);
process.exit(results.every((r) => r.ok) ? 0 : 1);

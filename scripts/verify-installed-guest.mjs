// Imports an installed Debian disk into a running server, boots it and captures the screen.
// Usage: node guest-boot.mjs <origin> <password> <vmdk> <outDir>
import { createReadStream, statSync, writeFileSync } from "node:fs";
import path from "node:path";
const [origin, password, vmdk, outDir] = process.argv.slice(2);
let cookie = "", csrf = "";
async function call(method, p, body, raw) {
  const r = await fetch(origin + p, {
    method,
    headers: { origin, cookie, ...(csrf ? { "x-csrf-token": csrf } : {}), ...(raw ? { "content-type": "application/octet-stream", "content-length": String(raw.size) } : { "content-type": "application/json" }) },
    body: raw ? raw.stream : body ? JSON.stringify(body) : undefined,
    ...(raw ? { duplex: "half" } : {}),
  });
  const set = r.headers.getSetCookie?.() || [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  const type = r.headers.get("content-type") || "";
  return { status: r.status, data: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
}
const log = (k, v) => console.log(new Date().toISOString().slice(11, 19), k, typeof v === "string" ? v : JSON.stringify(v).slice(0, 400));
let s = (await call("GET", "/api/session")).data; csrf = s.csrf;
if (!s.authenticated) log("login", (await call("POST", "/api/login", { username: "owner", password })).status);
s = (await call("GET", "/api/session")).data; csrf = s.csrf;
const size = statSync(vmdk).size;
const { Readable } = await import("node:stream");
const imported = await call("POST", "/api/storage/import?mode=machine&name=debian-installed&memory=2048&cpus=2", null, { size, stream: Readable.toWeb(createReadStream(vmdk)) });
log("import", { status: imported.status, data: imported.data });
const machine = (await call("GET", "/api/state")).data.machines.find((m) => m.name === "debian-installed");
log("machine", { id: machine?.id, disk: machine?.disks?.[0] });
log("start", (await call("POST", `/api/machines/${machine.id}/actions`, { action: "start" })).data);
for (const t of [60, 150, 240, 330, 420]) {
  await new Promise((r) => setTimeout(r, (t - (t === 60 ? 0 : 0)) * 0 + (t === 60 ? 60000 : 90000)));
  const shot = await call("GET", `/api/machines/${machine.id}/screenshot`);
  const st = (await call("GET", "/api/state")).data.machines.find((m) => m.id === machine.id);
  log(`t+${t}s`, { state: st?.state, error: st?.error, screenshot: shot.status, bytes: shot.data.length });
  if (shot.status === 200) writeFileSync(path.join(outDir, `guest-t${t}.png`), shot.data);
}

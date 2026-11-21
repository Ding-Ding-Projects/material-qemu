// Checks the container image inside an appliance: host facts, KVM, UEFI + Secure Boot + TPM launch.
// Usage: node appliance-check.mjs <origin> <password> <outPng>
import { writeFileSync } from "node:fs";
const [origin, password, outPng] = process.argv.slice(2);
let cookie = "";
let csrf = "";
async function call(method, path, body) {
  const r = await fetch(origin.replace(/\/$/, "") + path, {
    method,
    headers: { "content-type": "application/json", origin: origin.replace(/\/$/, ""), cookie, ...(csrf ? { "x-csrf-token": csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.getSetCookie?.() || [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  const type = r.headers.get("content-type") || "";
  return { status: r.status, data: type.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
}
const log = (k, v) => console.log(k, typeof v === "string" ? v : JSON.stringify(v).slice(0, 600));
let s = (await call("GET", "/api/session")).data;
csrf = s.csrf;
if (s.setupRequired) log("setup", (await call("POST", "/api/setup", { name: "verify", username: "verify", password })).status);
else log("login", (await call("POST", "/api/login", { name: "verify", username: "verify", password })).status);
s = (await call("GET", "/api/session")).data;
csrf = s.csrf;
log("session", { authenticated: s.authenticated, version: s.version });
const host = (await call("GET", "/api/host")).data;
log("host", host);
const body = {
  name: "tpm-kvm-check", arch: "x86_64", machineType: "q35",
  accelerator: host.accelerators.includes("kvm") ? "kvm" : "tcg",
  firmware: "uefi", secureBoot: !!host.firmware?.secureBoot, tpm: !!host.swtpm,
  cpuModel: host.accelerators.includes("kvm") ? "host" : "max", sockets: 1, cores: 2, threads: 1, cpus: 2, memory: 1024,
  disks: [{ id: "disk0", name: "System", sizeGiB: 4, bus: "virtio", format: "qcow2", cache: "none", discard: true }],
  cdroms: [], network: { mode: "user", model: "virtio", forwards: [] }, display: { adapter: "virtio" },
};
const created = await call("POST", "/api/machines", body);
log("create", { status: created.status, firmware: created.data.firmware, secureBoot: created.data.secureBoot, tpm: created.data.tpm, accelerator: created.data.accelerator, error: created.data.error });
const id = created.data.id || (await call("GET", "/api/state")).data.machines.find((m) => m.name === "tpm-kvm-check")?.id;
log("start", await call("POST", `/api/machines/${id}/actions`, { action: "start" }).then((r) => r.data));
await new Promise((r) => setTimeout(r, 25000));
const st = (await call("GET", "/api/state")).data.machines.find((m) => m.id === id);
log("state", { state: st?.state, error: st?.error });
const shot = await call("GET", `/api/machines/${id}/screenshot`);
log("screenshot", { status: shot.status, bytes: shot.data.length });
if (shot.status === 200) writeFileSync(outPng, shot.data);
log("snapshot", (await call("POST", `/api/machines/${id}/snapshots`, { name: "kvm-live" })).data);
log("snapshots", (await call("GET", `/api/machines/${id}/snapshots`)).data);
log("poweroff", (await call("POST", `/api/machines/${id}/actions`, { action: "poweroff" })).data);

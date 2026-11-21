// Checks an in-place appliance update end to end over the appliance's own API.
// "prepare" signs up (or in) and creates a stopped machine named keep-me.
// "update" asks the appliance to check, then to apply, waits for the restart,
// and confirms the new version and that keep-me is still there.
// Usage: node scripts/verify-appliance-update.mjs <origin> <password> prepare|update
const [origin, password, step] = process.argv.slice(2);
const base = origin.replace(/\/$/, "");
let cookie = "", csrf = "";
async function call(method, p, body) {
  const r = await fetch(base + p, { method, headers: { origin: base, cookie, "content-type": "application/json", ...(csrf ? { "x-csrf-token": csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = r.headers.getSetCookie?.() || [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function signIn() {
  let s = (await call("GET", "/api/session")).data; csrf = s.csrf;
  if (s.setupRequired) await call("POST", "/api/setup", { name: "verify", username: "verify", password });
  else if (!s.authenticated) await call("POST", "/api/login", { username: "verify", password });
  s = (await call("GET", "/api/session")).data; csrf = s.csrf;
  if (!s.authenticated) throw new Error("could not sign in");
}
async function waitUntil(test, seconds, label) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try { const v = await test(); if (v) return v; } catch {}
    await sleep(5000);
  }
  throw new Error(`timed out: ${label}`);
}
await signIn();
if (step === "prepare") {
  await call("POST", "/api/preferences", { setup: { step: 8, complete: true } });
  const st = (await call("GET", "/api/state")).data;
  if (!st.machines.some((m) => m.name === "keep-me")) {
    const r = await call("POST", "/api/machines", { name: "keep-me", arch: "x86_64", machineType: "q35", accelerator: "tcg", firmware: "uefi", cpuModel: "max", sockets: 1, cores: 1, threads: 1, cpus: 1, memory: 512, disks: [{ id: "disk0", name: "System", sizeGiB: 2, bus: "virtio", format: "qcow2", cache: "writeback", discard: true }], cdroms: [], network: { mode: "none" }, display: { adapter: "std" } });
    console.log("created keep-me", r.status);
  }
  console.log("update status", JSON.stringify((await call("GET", "/api/appliance/update")).data));
} else if (step === "update") {
  const before = (await call("GET", "/api/appliance/update")).data;
  console.log("before", JSON.stringify(before));
  console.log("check", (await call("POST", "/api/appliance/update", { action: "check" })).status);
  const checked = await waitUntil(async () => { const u = (await call("GET", "/api/appliance/update")).data; return !u.pending && u.state && u.checkedAt !== before.checkedAt ? u : null; }, 180, "check result");
  console.log("checked", JSON.stringify(checked));
  if (checked.state !== "available") throw new Error(`expected an available update, got ${checked.state}`);
  console.log("apply", (await call("POST", "/api/appliance/update", { action: "apply" })).status);
  const done = await waitUntil(async () => {
    await signIn();
    const u = (await call("GET", "/api/appliance/update")).data;
    return ["updated", "error"].includes(u.state) && !u.pending ? u : null;
  }, 900, "update result");
  console.log("after", JSON.stringify(done));
  const st = (await call("GET", "/api/state")).data;
  const kept = st.machines.some((m) => m.name === "keep-me");
  console.log(done.state === "updated" && kept ? "PASS" : "FAIL", `state=${done.state} current=${done.current} latest=${done.latest} keep-me kept=${kept}`);
  process.exit(done.state === "updated" && kept ? 0 : 1);
}

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApplication } from "../server/index.mjs";
import { roleAllows } from "../server/users.mjs";

test("role rules: the owner may do anything, operators run machines, viewers only look", () => {
  assert.equal(roleAllows("owner", "POST", "/api/users"), true);
  assert.equal(roleAllows("operator", "POST", "/api/machines"), true);
  assert.equal(roleAllows("operator", "POST", "/api/media"), true);
  for (const [m, r] of [["GET", "/api/users"], ["POST", "/api/users"], ["POST", "/api/security"], ["POST", "/api/passkey/register-options"], ["POST", "/api/appliance/update"]])
    assert.equal(roleAllows("operator", m, r), false, `${m} ${r}`);
  assert.equal(roleAllows("operator", "GET", "/api/appliance/update"), true);
  assert.equal(roleAllows("viewer", "GET", "/api/state"), true);
  assert.equal(roleAllows("viewer", "POST", "/api/logout"), true);
  for (const [m, r] of [["POST", "/api/machines"], ["DELETE", "/api/storage/isos/x.iso"], ["POST", "/api/media"], ["POST", "/api/preferences"], ["GET", "/api/users"]])
    assert.equal(roleAllows("viewer", m, r), false, `${m} ${r}`);
  assert.equal(roleAllows("intruder", "GET", "/api/state"), false);
});

test("people are added, sign in with their role, and lose access when changed or removed", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mq-users-"));
  const origin = "http://127.0.0.1:18447";
  const app = await createApplication({ data: dir, origin });
  await new Promise((resolve) => app.server.listen(18447, "127.0.0.1", resolve));
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  const request = async (route, { method = "GET", body, as } = {}) => {
    const headers = { Origin: origin };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (as) Object.assign(headers, { Cookie: as.cookie, "X-CSRF-Token": as.csrf });
    const r = await fetch(origin + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})), cookie: r.headers.get("set-cookie")?.split(";")[0] };
  };
  const signIn = async (username, password) => {
    const r = await request("/api/login", { method: "POST", body: { username, password } });
    return r.status === 200 ? { cookie: r.cookie, csrf: r.body.csrf } : r;
  };
  const setup = await request("/api/setup", { method: "POST", body: { name: "Owner", username: "owner", password: "owner password long" } });
  const owner = { cookie: setup.cookie, csrf: setup.body.csrf };

  const added = await request("/api/users", { method: "POST", as: owner, body: { name: "Olive Ops", username: "olive", password: "operator password", role: "operator" } });
  assert.equal(added.status, 201);
  assert.deepEqual([added.body.username, added.body.role, "hash" in added.body], ["olive", "operator", false]);
  const viewerAdded = await request("/api/users", { method: "POST", as: owner, body: { name: "Vic", username: "vic", password: "viewer password!", role: "viewer" } });
  assert.equal(viewerAdded.status, 201);
  assert.equal((await request("/api/users", { method: "POST", as: owner, body: { username: "OWNER", password: "another password", role: "viewer" } })).body.error, "That user name is already used.");
  assert.match((await request("/api/users", { method: "POST", as: owner, body: { username: "x2", password: "short", role: "viewer" } })).body.error, /12–256/);
  assert.match((await request("/api/users", { method: "POST", as: owner, body: { username: "admin2", password: "long enough password", role: "owner" } })).body.error, /operator or viewer/);

  const olive = await signIn("olive", "operator password");
  assert.equal((await request("/api/session", { as: olive })).body.user.role, "operator");
  assert.equal((await request("/api/users", { as: olive })).status, 403);
  assert.equal((await request("/api/preferences", { method: "POST", as: olive, body: { settings: { language: "en" } } })).status, 200);
  assert.equal((await signIn("olive", "wrong password!!")).status, 401);

  const vic = await signIn("vic", "viewer password!");
  assert.equal((await request("/api/state", { as: vic })).status, 200);
  const refused = await request("/api/preferences", { method: "POST", as: vic, body: { settings: { language: "en" } } });
  assert.deepEqual([refused.status, refused.body.error], [403, "Your account can view machines but not change them."]);
  const upload = await fetch(origin + "/api/media?name=x.iso", { method: "POST", headers: { Origin: origin, "Content-Type": "application/octet-stream", Cookie: vic.cookie, "X-CSRF-Token": vic.csrf }, body: "data" });
  assert.equal(upload.status, 403);
  assert.equal((await request("/api/logout", { method: "POST", as: vic, body: {} })).status, 200);

  // Changing a role ends that person's sessions; the new role applies at next sign-in.
  assert.equal((await request(`/api/users/${added.body.id}`, { method: "POST", as: owner, body: { role: "viewer" } })).body.role, "viewer");
  assert.equal((await request("/api/state", { as: olive })).status, 401);
  const oliveAgain = await signIn("olive", "operator password");
  assert.equal((await request("/api/session", { as: oliveAgain })).body.user.role, "viewer");
  // Resetting a password works; removing someone ends their sessions and sign-in.
  await request(`/api/users/${added.body.id}`, { method: "POST", as: owner, body: { password: "brand new password" } });
  assert.equal((await signIn("olive", "operator password")).status, 401);
  const oliveNew = await signIn("olive", "brand new password");
  assert.equal((await request(`/api/users/${added.body.id}`, { method: "DELETE", as: owner })).status, 200);
  assert.equal((await request("/api/state", { as: oliveNew })).status, 401);
  assert.equal((await signIn("olive", "brand new password")).status, 401);
  // The owner still signs in, and the list never contains password material.
  assert.equal((await request("/api/session", { as: await signIn("Owner", "owner password long") })).body.user.role, "owner");
  const list = await request("/api/users", { as: owner });
  assert.deepEqual(list.body.users.map((u) => u.username), ["vic"]);
  assert.ok(list.body.users.every((u) => !("hash" in u) && !("salt" in u)));
});

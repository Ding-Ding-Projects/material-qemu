// Additional people who can sign in, besides the owner. Each has a role:
//   operator - creates, runs and changes machines and storage, uses consoles;
//              cannot manage people, sign-in security or appliance updates.
//   viewer   - sees machines, storage and activity; changes nothing and has
//              no console (a console can type into the guest).
// The owner keeps every right. Roles are enforced by the server in one place
// (roleAllows), so the browser hiding a control is never what protects it.
import { randomUUID } from "node:crypto";
import { hashPassword } from "./auth.mjs";

export const ROLES = ["operator", "viewer"];
export const MAX_USERS = 50;
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/;

const OWNER_ONLY = [/^\/api\/users(\/|$)/, /^\/api\/security$/, /^\/api\/passkey\/register(-options)?$/];

export function roleAllows(role, method, route) {
  if (!role || role === "owner") return true;
  if (OWNER_ONLY.some((re) => re.test(route))) return false;
  if (role === "operator") return !(route === "/api/appliance/update" && method !== "GET");
  if (role === "viewer") return method === "GET" || route === "/api/logout";
  return false;
}

export const roleRefusal = (role) =>
  role === "viewer" ? "Your account can view machines but not change them." : "Only the owner can do this.";

function checkUsername(username, state, exceptId = null) {
  const value = String(username ?? "").trim();
  if (!USERNAME.test(value)) throw new Error("User names are 2–40 letters, digits, dots, dashes or underscores.");
  const taken = [state.owner?.username || state.owner?.name, ...(state.users || []).filter((u) => u.id !== exceptId).map((u) => u.username)];
  if (taken.some((t) => String(t || "").toLowerCase() === value.toLowerCase())) throw new Error("That user name is already used.");
  return value;
}

function checkRole(role) {
  if (!ROLES.includes(role)) throw new Error("Choose the operator or viewer role.");
  return role;
}

// Prepared outside the store transaction, since hashing is slow.
export async function prepareUser(body) {
  const password = await hashPassword(body.password);
  return { name: String(body.name || "").trim().slice(0, 80), username: String(body.username ?? "").trim(), role: body.role, password };
}

export function addUser(state, prepared) {
  state.users ??= [];
  if (state.users.length >= MAX_USERS) throw new Error(`A workspace can have at most ${MAX_USERS} people besides the owner.`);
  const user = {
    id: randomUUID(),
    name: prepared.name || prepared.username,
    username: checkUsername(prepared.username, state),
    role: checkRole(prepared.role),
    ...prepared.password,
    createdAt: new Date().toISOString(),
  };
  state.users.push(user);
  return publicUser(user);
}

export function updateUser(state, id, { role, name, password } = {}) {
  const user = (state.users || []).find((u) => u.id === id);
  if (!user) throw new Error("User not found.");
  if (role !== undefined) user.role = checkRole(role);
  if (name !== undefined) user.name = String(name).trim().slice(0, 80) || user.username;
  if (password) Object.assign(user, password);
  return publicUser(user);
}

export function removeUser(state, id) {
  const before = (state.users || []).length;
  state.users = (state.users || []).filter((u) => u.id !== id);
  if (state.users.length === before) throw new Error("User not found.");
  return { removed: true };
}

export const publicUser = (u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, createdAt: u.createdAt });
export const findUser = (state, username) => (state.users || []).find((u) => u.username === String(username ?? "").trim());

import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export async function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256
  )
    throw new Error("Password must contain 12–256 characters.");
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: (await scrypt(password, salt, 64)).toString("hex") };
}
export async function checkPassword(password, owner) {
  if (typeof password !== "string" || password.length > 256) return false;
  const actual = await scrypt(password, owner.salt, 64);
  return timingSafeEqual(actual, Buffer.from(owner.hash, "hex"));
}
export class Sessions {
  constructor(now = Date.now) {
    this.now = now;
    this.items = new Map();
    this.failures = new Map();
    this.inflight = new Map();
  }
  issue(method = "password") {
    const id = randomBytes(32).toString("base64url");
    const value = {
      csrf: randomBytes(24).toString("base64url"),
      expires: Date.now() + 8 * 60 * 60 * 1000,
      method,
      passkeyVerifiedAt: method === "passkey" ? Date.now() : null,
    };
    this.items.set(id, value);
    return { id, ...value };
  }
  get(request) {
    const id = request.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("mq_session="))
      ?.slice(11);
    const session = this.items.get(id);
    if (!session || session.expires < Date.now()) {
      this.items.delete(id);
      return null;
    }
    return { id, ...session };
  }
  allow(address) {
    const state = this.failures.get(address);
    const active = this.inflight.get(address) || 0;
    const failures = state && state.until > this.now() ? state.count : 0;
    return failures + active < 5 && active < 2;
  }
  failure(address) {
    const old = this.failures.get(address);
    this.failures.set(address, {
      count: old && old.until > this.now() ? old.count + 1 : 1,
      until: this.now() + 15 * 60 * 1000,
    });
    if (this.failures.size > 10000)
      this.failures.delete(this.failures.keys().next().value);
  }
  reserve(address) {
    if (!this.allow(address)) return false;
    this.inflight.set(address, (this.inflight.get(address) || 0) + 1);
    return true;
  }
  finish(address, success) {
    const count = (this.inflight.get(address) || 1) - 1;
    if (count) this.inflight.set(address, count);
    else this.inflight.delete(address);
    if (success) this.failures.delete(address);
    else this.failure(address);
  }
  cookie(id, secure) {
    return `mq_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure ? "; Secure" : ""}`;
  }
}

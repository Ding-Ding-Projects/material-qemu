import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export async function hashPassword(password) { if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Password must contain 12–256 characters.'); const salt = randomBytes(16).toString('hex'); return { salt, hash: (await scrypt(password, salt, 64)).toString('hex') }; }
export async function checkPassword(password, owner) { if (typeof password !== 'string' || password.length > 256) return false; const actual = await scrypt(password, owner.salt, 64); return timingSafeEqual(actual, Buffer.from(owner.hash, 'hex')); }
export class Sessions {
  constructor() { this.items = new Map(); this.failures = new Map(); }
  issue() { const id = randomBytes(32).toString('base64url'); const value = { csrf: randomBytes(24).toString('base64url'), expires: Date.now() + 8 * 60 * 60 * 1000 }; this.items.set(id, value); return { id, ...value }; }
  get(request) { const id = request.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('mq_session='))?.slice(11); const session = this.items.get(id); if (!session || session.expires < Date.now()) { this.items.delete(id); return null; } return { id, ...session }; }
  allow(address) { const state = this.failures.get(address); return !state || state.until < Date.now() || state.count < 8; }
  failure(address) { const old = this.failures.get(address); this.failures.set(address, { count: old && old.until > Date.now() ? old.count + 1 : 1, until: Date.now() + 15 * 60 * 1000 }); if (this.failures.size > 10000) this.failures.delete(this.failures.keys().next().value); }
  cookie(id, secure) { return `mq_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure ? '; Secure' : ''}`; }
}

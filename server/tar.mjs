// Minimal streaming tar (ustar) for machine bundles: regular files only.
// Sizes over 8 GiB use the GNU base-256 size field, so large disks fit.
// Nothing is held in memory beyond one block; file data streams through.
import { createReadStream } from "node:fs";
import { once } from "node:events";

const BLOCK = 512;
const OCTAL_MAX = 0o77777777777;

function header(name, size, mtime = Date.now()) {
  const h = Buffer.alloc(BLOCK);
  const n = Buffer.from(name, "utf8");
  if (n.length > 100) throw new Error("Bundle entry names are at most 100 bytes.");
  n.copy(h, 0);
  h.write("0000644\0", 100, "ascii");
  h.write("0000000\0", 108, "ascii");
  h.write("0000000\0", 116, "ascii");
  if (size <= OCTAL_MAX) h.write(size.toString(8).padStart(11, "0") + "\0", 124, "ascii");
  else {
    // GNU base-256: high bit set, then the size big-endian in the remaining bytes.
    let v = BigInt(size);
    for (let i = 135; i > 124; i--) { h[i] = Number(v & 0xffn); v >>= 8n; }
    h[124] = 0x80;
  }
  h.write(Math.floor(mtime / 1000).toString(8).padStart(11, "0") + "\0", 136, "ascii");
  h.write("        ", 148, "ascii");
  h[156] = 0x30; // regular file
  h.write("ustar\0", 257, "ascii");
  h.write("00", 263, "ascii");
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
  return h;
}

async function write(out, chunk) {
  if (!out.write(chunk)) await once(out, "drain");
}

// entries: [{ name, data } | { name, file, size }] written in order to out.
export async function writeTar(out, entries) {
  for (const e of entries) {
    const size = e.data ? e.data.length : e.size;
    await write(out, header(e.name, size));
    if (e.data) await write(out, e.data);
    else {
      let sent = 0;
      for await (const chunk of createReadStream(e.file)) {
        sent += chunk.length;
        await write(out, chunk);
      }
      if (sent !== size) throw new Error(`${e.name} changed size while it was being exported.`);
    }
    const pad = (BLOCK - (size % BLOCK)) % BLOCK;
    if (pad) await write(out, Buffer.alloc(pad));
  }
  await write(out, Buffer.alloc(BLOCK * 2));
}

function parseSize(field) {
  if (field[0] & 0x80) {
    let v = 0n;
    for (let i = 1; i < field.length; i++) v = (v << 8n) | BigInt(field[i]);
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("A bundle entry is too large.");
    return Number(v);
  }
  const text = field.toString("ascii").replace(/\0.*$/s, "").trim();
  if (!/^[0-7]*$/.test(text)) throw new Error("The bundle is not a valid tar file.");
  return parseInt(text || "0", 8);
}

function checksumOk(h) {
  const stored = parseInt(h.toString("ascii", 148, 156).replace(/\0.*$/s, "").trim(), 8);
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
  return stored === sum;
}

// Reads a tar stream. For each regular file, onEntry({ name, size }) returns a
// writable to receive it (it is ended after the data) or throws to reject the
// bundle. Returns when the end-of-archive blocks arrive.
export async function readTar(input, onEntry) {
  let buffer = Buffer.alloc(0);
  let current = null; // { out, left, pad }
  let zeroBlocks = 0;
  for await (const raw of input) {
    buffer = buffer.length ? Buffer.concat([buffer, raw]) : raw;
    while (true) {
      if (current) {
        if (current.left > 0) {
          if (!buffer.length) break;
          const take = Math.min(current.left, buffer.length);
          if (!current.out.write(buffer.subarray(0, take))) await once(current.out, "drain");
          buffer = buffer.subarray(take);
          current.left -= take;
          if (current.left > 0) continue;
          current.out.end();
          await once(current.out, "finish");
        }
        if (buffer.length < current.pad) break;
        buffer = buffer.subarray(current.pad);
        current = null;
        continue;
      }
      if (buffer.length < BLOCK) break;
      const h = buffer.subarray(0, BLOCK);
      buffer = buffer.subarray(BLOCK);
      if (h.every((b) => b === 0)) {
        if (++zeroBlocks === 2) return;
        continue;
      }
      zeroBlocks = 0;
      if (!checksumOk(h)) throw new Error("The bundle is not a valid tar file.");
      const name = h.toString("utf8", 0, 100).replace(/\0.*$/s, "");
      const type = h[156];
      const size = parseSize(h.subarray(124, 136));
      if (type !== 0x30 && type !== 0) throw new Error("Bundles may only contain plain files.");
      const out = await onEntry({ name, size });
      current = { out, left: size, pad: (BLOCK - (size % BLOCK)) % BLOCK };
      if (size === 0) { out.end(); await once(out, "finish"); current.left = 0; }
    }
  }
  throw new Error("The bundle ended before it was complete.");
}

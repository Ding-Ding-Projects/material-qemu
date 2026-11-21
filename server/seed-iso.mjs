// Writes a small ISO 9660 image with Joliet names, such as the "cidata" seed
// disk cloud-init's NoCloud source reads (user-data, meta-data and optionally
// network-config). Only a flat root directory is supported, which is all a
// seed needs. Plain ISO 9660 names are upper-case 8.3 forms; Joliet keeps the
// real names, which Linux and Windows show when both are present.

const SECTOR = 2048;

function both16(buf, offset, value) {
  buf.writeUInt16LE(value, offset);
  buf.writeUInt16BE(value, offset + 2);
}
function both32(buf, offset, value) {
  buf.writeUInt32LE(value, offset);
  buf.writeUInt32BE(value, offset + 4);
}
function padText(buf, offset, length, text, wide = false) {
  if (wide) {
    for (let i = 0; i < length; i += 2) buf.writeUInt16BE(0x20, offset + i);
    const units = Buffer.from(text, "utf16le").swap16();
    units.copy(buf, offset, 0, Math.min(units.length, length));
  } else {
    buf.fill(0x20, offset, offset + length);
    buf.write(text.slice(0, length), offset, "ascii");
  }
}
function recordingDate(date) {
  return Buffer.from([date.getUTCFullYear() - 1900, date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), 0]);
}
function volumeDate(date) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  const text = `${p(date.getUTCFullYear(), 4)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}00`;
  return Buffer.concat([Buffer.from(text, "ascii"), Buffer.from([0])]);
}
function directoryRecord({ lba, size, isDirectory, name, date }) {
  const length = 33 + name.length + (name.length % 2 === 0 ? 1 : 0);
  const r = Buffer.alloc(length);
  r[0] = length;
  both32(r, 2, lba);
  both32(r, 10, size);
  recordingDate(date).copy(r, 18);
  r[25] = isDirectory ? 2 : 0;
  both16(r, 28, 1);
  r[32] = name.length;
  name.copy(r, 33);
  return r;
}

// Upper-case 8.3 name for the plain ISO 9660 tree, unique within the image.
function shortName(name, taken) {
  const clean = (s, n) => s.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, n);
  const dot = name.lastIndexOf(".");
  const base = clean(dot > 0 ? name.slice(0, dot) : name, 8) || "FILE";
  const ext = dot > 0 ? clean(name.slice(dot + 1), 3) : "";
  let candidate = `${base}.${ext}`, n = 1;
  while (taken.has(candidate)) candidate = `${base.slice(0, 6)}~${n++}.${ext}`;
  taken.add(candidate);
  return `${candidate};1`;
}

// files: [{ name, data }] with data a string or Buffer. Returns a Buffer.
export function buildSeedIso(files, { volumeId = "cidata", date = new Date() } = {}) {
  if (!Array.isArray(files) || !files.length || files.length > 16) throw new Error("A seed image needs 1–16 files.");
  const entries = files.map((f) => ({ name: String(f.name), data: Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), "utf8") }));
  for (const e of entries) if (!/^[A-Za-z0-9._-]{1,64}$/.test(e.name)) throw new Error("Seed file names use letters, digits, dots, dashes and underscores.");
  if (new Set(entries.map((e) => e.name)).size !== entries.length) throw new Error("Seed file names must be unique.");
  const taken = new Set();
  entries.forEach((e) => (e.short = shortName(e.name, taken)));
  // Layout: 16 empty sectors, the two volume descriptors and the terminator,
  // four path tables, two root directories, then the files.
  const PVD = 16, SVD = 17, TERM = 18, LPATH = 19, MPATH = 20, JLPATH = 21, JMPATH = 22, ROOT = 23, JROOT = 24;
  let next = 25;
  for (const e of entries) {
    e.lba = next;
    next += Math.max(1, Math.ceil(e.data.length / SECTOR));
  }
  const total = next;
  const image = Buffer.alloc(total * SECTOR);
  const sector = (n) => n * SECTOR;

  const rootRecord = (lba) => directoryRecord({ lba, size: SECTOR, isDirectory: true, name: Buffer.from([0]), date });
  const directory = (self, joliet) => {
    const records = [
      directoryRecord({ lba: self, size: SECTOR, isDirectory: true, name: Buffer.from([0]), date }),
      directoryRecord({ lba: self, size: SECTOR, isDirectory: true, name: Buffer.from([1]), date }),
      ...[...entries]
        .sort((a, b) => (joliet ? (a.name < b.name ? -1 : 1) : a.short < b.short ? -1 : 1))
        .map((e) => directoryRecord({ lba: e.lba, size: e.data.length, isDirectory: false, name: joliet ? Buffer.from(e.name, "utf16le").swap16() : Buffer.from(e.short, "ascii"), date })),
    ];
    const body = Buffer.concat(records);
    if (body.length > SECTOR) throw new Error("Too many seed files for one directory sector.");
    return body;
  };
  directory(ROOT, false).copy(image, sector(ROOT));
  directory(JROOT, true).copy(image, sector(JROOT));

  // Path tables: one entry for the root directory.
  const pathEntry = (lba, bigEndian) => {
    const p = Buffer.alloc(10);
    p[0] = 1;
    bigEndian ? p.writeUInt32BE(lba, 2) : p.writeUInt32LE(lba, 2);
    bigEndian ? p.writeUInt16BE(1, 6) : p.writeUInt16LE(1, 6);
    return p;
  };
  pathEntry(ROOT, false).copy(image, sector(LPATH));
  pathEntry(ROOT, true).copy(image, sector(MPATH));
  pathEntry(JROOT, false).copy(image, sector(JLPATH));
  pathEntry(JROOT, true).copy(image, sector(JMPATH));

  const descriptor = (at, joliet) => {
    const d = image.subarray(sector(at), sector(at) + SECTOR);
    d[0] = joliet ? 2 : 1;
    d.write("CD001", 1, "ascii");
    d[6] = 1;
    padText(d, 8, 32, "", joliet);
    padText(d, 40, 32, volumeId, joliet);
    both32(d, 80, total);
    if (joliet) d.write("%/E", 88, "ascii");
    both16(d, 120, 1);
    both16(d, 124, 1);
    both16(d, 128, SECTOR);
    both32(d, 132, 10);
    d.writeUInt32LE(joliet ? JLPATH : LPATH, 140);
    d.writeUInt32BE(joliet ? JMPATH : MPATH, 148);
    rootRecord(joliet ? JROOT : ROOT).copy(d, 156);
    for (const [offset, length] of [[190, 128], [318, 128], [446, 128], [574, 128], [702, 37], [739, 37], [776, 37]]) padText(d, offset, length, "", joliet);
    padText(d, 574, 128, "MATERIAL QEMU", joliet);
    volumeDate(date).copy(d, 813);
    volumeDate(date).copy(d, 830);
    Buffer.from("0000000000000000\0", "ascii").copy(d, 847);
    volumeDate(date).copy(d, 864);
    d[881] = 1;
  };
  descriptor(PVD, false);
  descriptor(SVD, true);
  const term = image.subarray(sector(TERM), sector(TERM) + SECTOR);
  term[0] = 255;
  term.write("CD001", 1, "ascii");
  term[6] = 1;

  for (const e of entries) e.data.copy(image, sector(e.lba));
  return image;
}

// Custom firmware images kept in managed storage. A machine can use one in
// place of the built-in firmware: as -bios for BIOS machines and other targets
// that boot from a -bios image, or as the read-only UEFI code image for UEFI
// machines (their variables still start from the host's template). Files are
// only ever created new; an existing name is never overwritten, and an image a
// machine uses cannot be deleted.
import { open, readdir, stat, unlink, link, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const FIRMWARE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}\.(fd|bin|rom)$/i;
export const MAX_FIRMWARE_BYTES = 64 * 1024 * 1024;

export const firmwareDirectory = (dataDirectory) => path.join(dataDirectory, "firmware");

export function checkFirmwareName(name) {
  const value = String(name ?? "");
  if (!FIRMWARE_NAME.test(value)) throw new Error("Firmware files are named like OVMF_CODE.fd, bios.bin or option.rom.");
  return value;
}

export async function listFirmware(dataDirectory, machines = []) {
  const dir = firmwareDirectory(dataDirectory);
  const names = await readdir(dir).catch(() => []);
  const out = [];
  for (const name of names.filter((n) => FIRMWARE_NAME.test(n)).sort()) {
    const info = await stat(path.join(dir, name)).catch(() => null);
    if (!info?.isFile()) continue;
    out.push({ name, bytes: info.size, usedBy: machines.filter((m) => m.firmwareImage === name).map((m) => m.id) });
  }
  return out;
}

// Receives an upload into a temporary file and links it into place, so a
// name that already exists is refused rather than replaced.
export async function receiveFirmware(request, dataDirectory, rawName) {
  const name = checkFirmwareName(rawName);
  const declared = request.headers["content-length"];
  if (declared !== undefined && (!/^[0-9]+$/.test(declared) || Number(declared) < 1 || Number(declared) > MAX_FIRMWARE_BYTES))
    throw new Error(`Firmware images must contain 1–${MAX_FIRMWARE_BYTES} bytes.`);
  const dir = firmwareDirectory(dataDirectory);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const temporary = path.join(dir, `.upload-${randomBytes(8).toString("hex")}`);
  const destination = path.join(dir, name);
  const file = await open(temporary, "wx", 0o600);
  let size = 0;
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_FIRMWARE_BYTES) throw new Error(`Firmware images must contain 1–${MAX_FIRMWARE_BYTES} bytes.`);
      let offset = 0;
      while (offset < chunk.length) offset += (await file.write(chunk, offset, chunk.length - offset)).bytesWritten;
    }
    if (!size || (declared !== undefined && Number(declared) !== size)) throw new Error("Upload length does not match the received file.");
    await file.sync();
    await file.close();
    try {
      await link(temporary, destination);
    } catch (error) {
      if (error.code === "EEXIST") throw new Error("A firmware image with this name already exists. Choose another name; existing files are never overwritten.");
      throw error;
    }
    return { name, bytes: size };
  } finally {
    await file.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
}

export async function deleteFirmware(dataDirectory, machines, rawName) {
  const name = checkFirmwareName(rawName);
  const users = machines.filter((m) => m.firmwareImage === name);
  if (users.length) throw new Error(`This firmware image is used by ${users.map((m) => m.name).join(", ")}. Choose built-in firmware for them first.`);
  await unlink(path.join(firmwareDirectory(dataDirectory), name)).catch((error) => {
    if (error.code === "ENOENT") throw new Error("Firmware image not found.");
    throw error;
  });
  return { deleted: true, name };
}

// The file a machine boots from, or null for built-in firmware.
export async function firmwareImagePath(dataDirectory, name) {
  if (!name) return null;
  const file = path.join(firmwareDirectory(dataDirectory), checkFirmwareName(name));
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) throw new Error(`The firmware image ${name} is not in managed storage.`);
  return file;
}

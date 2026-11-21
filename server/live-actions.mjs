import path from "node:path";
import { rename, stat } from "node:fs/promises";
import { containedFile } from "./qemu.mjs";
import { ISO_NAME } from "./machine-config.mjs";

export const LIVE_ACTIONS = [
  "pause",
  "resume",
  "reset",
  "powerdown",
  "poweroff",
  "cd-change",
  "cd-eject",
  "send-keys",
  "screenshot",
];
// Allow-listed key combinations. Names map to fixed QEMU key codes only.
export const KEY_SEQUENCES = {
  "ctrl-alt-delete": ["ctrl", "alt", "delete"],
  "ctrl-alt-backspace": ["ctrl", "alt", "backspace"],
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7].map((n) => [`ctrl-alt-f${n}`, ["ctrl", "alt", `f${n}`]]),
  ),
  print: ["print"],
  escape: ["esc"],
  enter: ["ret"],
  tab: ["tab"],
};
export const SCREENSHOT_FILE = "screenshot.png";
const SIMPLE = {
  pause: "stop",
  resume: "cont",
  reset: "system_reset",
  powerdown: "system_powerdown",
};
function cdromId(machine, index) {
  const slot = index === undefined || index === null ? 0 : Number(index);
  if (!Number.isInteger(slot) || slot < 0 || slot >= machine.cdroms.length)
    throw new Error("This machine has no CD-ROM drive with that number.");
  return slot === 0 ? "installation-media" : `installation-media-${slot}`;
}
export function checkLiveAction(body) {
  if (!body || !LIVE_ACTIONS.includes(body.action))
    throw new Error("Unsupported action.");
  if (body.action === "send-keys" && !KEY_SEQUENCES[body.keys])
    throw new Error("Unsupported key sequence.");
  if (body.action === "cd-change" && !ISO_NAME.test(String(body.iso || "")))
    throw new Error("Select an ISO from the managed media directory.");
  return body.action;
}
// Run one validated live action against a running machine through QMP.
export async function performLiveAction(qemu, machine, body) {
  const action = checkLiveAction(body);
  if (action === "poweroff") return qemu.action(machine.id, "stop");
  if (SIMPLE[action]) {
    await qemu.command(machine.id, SIMPLE[action]);
    const status = await qemu.command(machine.id, "query-status");
    qemu.running.get(machine.id).state = status.running
      ? "running"
      : status.status;
    return { ...qemu.status(machine.id), requested: action };
  }
  if (action === "send-keys") {
    await qemu.command(machine.id, "send-key", {
      keys: KEY_SEQUENCES[body.keys].map((data) => ({ type: "qcode", data })),
    });
    return { requested: action, keys: body.keys };
  }
  if (action === "cd-change") {
    const id = cdromId(machine, body.cdrom);
    const file = await containedFile(
      path.join(qemu.directory, "media"),
      body.iso,
    );
    await qemu.command(machine.id, "blockdev-change-medium", {
      id,
      filename: file,
      format: "raw",
    });
    return { requested: action, iso: body.iso };
  }
  if (action === "cd-eject") {
    const id = cdromId(machine, body.cdrom);
    await qemu.command(machine.id, "blockdev-open-tray", { id, force: true });
    await qemu.command(machine.id, "blockdev-remove-medium", { id });
    return { requested: action };
  }
  // screenshot
  const runtime = qemu.runtimeDirectory(machine.id);
  const temporary = path.join(runtime, "screenshot.new.png");
  await qemu.command(
    machine.id,
    "screendump",
    { filename: temporary, format: "png" },
    15000,
  );
  const target = path.join(runtime, SCREENSHOT_FILE);
  await rename(temporary, target);
  const info = await stat(target);
  return {
    requested: action,
    bytes: info.size,
    takenAt: info.mtime.toISOString(),
  };
}

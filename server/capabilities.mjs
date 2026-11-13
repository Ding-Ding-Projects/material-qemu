import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, opendir } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";

const exec = promisify(execFile);
export const targets = {
  x86_64: { executable: "qemu-system-x86_64", machine: "q35", cpu: "max" },
  i386: { executable: "qemu-system-i386", machine: "pc", cpu: "max" },
  aarch64: {
    executable: "qemu-system-aarch64",
    machine: "virt",
    cpu: "cortex-a57",
    firmware: "/usr/share/qemu-efi-aarch64/QEMU_EFI.fd",
  },
  arm: {
    executable: "qemu-system-arm",
    machine: "virt",
    cpu: "cortex-a15",
    firmware: "/usr/share/AAVMF/AAVMF32_CODE.fd",
  },
};
export const targetInventory = [
  "x86_64",
  "i386",
  "aarch64",
  "arm",
  "riscv64",
  "riscv32",
  "ppc64",
  "ppc",
  "s390x",
  "mips64el",
  "mips64",
  "mipsel",
  "mips",
  "loongarch64",
  "sparc64",
  "sparc",
  "m68k",
  "alpha",
  "hppa",
  "sh4",
  "sh4eb",
  "microblaze",
  "microblazeel",
  "or1k",
  "xtensa",
  "xtensaeb",
  "avr",
  "rx",
  "tricore",
];
export function supportedMachine(arch, name) {
  return ["x86_64", "i386"].includes(arch)
    ? /^(pc|q35|pc-(i440fx|q35)-[0-9.]+)$/.test(name)
    : ["arm", "aarch64"].includes(arch) && /^virt(-[0-9.]+)?$/.test(name);
}
export function parseMachines(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.match(/^([a-z0-9][a-zA-Z0-9_.-]*)\s+(.+)$/))
    .filter(Boolean)
    .map(([, name, description]) => ({
      name,
      description: description.slice(0, 400),
    }));
}
export function parseAccelerators(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[a-z0-9_-]+$/.test(line));
}
export async function discoverCapabilities() {
  const result = {};
  const discovered = await installedTargets();
  Object.defineProperty(result, "inventory", {
    value: discovered.diagnostics,
    enumerable: false,
  });
  for (const arch of [
    ...new Set([...targetInventory, ...discovered.targets]),
  ]) {
    const executable = `qemu-system-${arch}`,
      recipe = targets[arch];
    let installed = false,
      versionText;
    try {
      const version = await exec(executable, ["--version"], {
        timeout: 5000,
        maxBuffer: 128 * 1024,
      });
      installed = true;
      versionText = version.stdout.split("\n")[0];
      const [machineHelp, accelHelp] = await Promise.all([
        exec(executable, ["-machine", "help"], {
          timeout: 5000,
          maxBuffer: 512 * 1024,
        }),
        exec(executable, ["-accel", "help"], {
          timeout: 5000,
          maxBuffer: 128 * 1024,
        }),
      ]);
      let firmwareReady = true;
      if (recipe?.firmware) {
        try {
          await access(recipe.firmware, constants.R_OK);
        } catch {
          firmwareReady = false;
        }
      }
      const machines = parseMachines(machineHelp.stdout).map((machine) => ({
        ...machine,
        supported: Boolean(
          recipe && firmwareReady && supportedMachine(arch, machine.name),
        ),
        reason: !recipe
          ? "No supported disk, firmware and display recipe for this target."
          : !firmwareReady
            ? "Required platform firmware is unavailable."
            : !supportedMachine(arch, machine.name)
              ? "This board needs a device/boot recipe not implemented by the current editor."
              : null,
      }));
      const accelerators = [];
      for (const name of parseAccelerators(accelHelp.stdout)) {
        let usable = name === "tcg",
          reason = usable
            ? null
            : "This accelerator has no verified launch route in this runtime.";
        if (name === "kvm") {
          const native =
            ((arch === "x86_64" || arch === "i386") && os.arch() === "x64") ||
            (arch === "aarch64" && os.arch() === "arm64");
          try {
            await access("/dev/kvm", constants.R_OK | constants.W_OK);
            usable = native;
            reason = native
              ? null
              : "The target architecture does not match the host KVM architecture.";
          } catch {
            reason = "The runtime has no read/write access to /dev/kvm.";
          }
        }
        accelerators.push({
          name,
          usable,
          eligible: usable,
          verification:
            name === "tcg"
              ? "software emulation"
              : usable
                ? "eligible; launch unverified"
                : "unavailable",
          reason:
            usable && name === "kvm"
              ? "Device access and architecture are eligible; a successful KVM launch has not been verified by discovery."
              : reason,
        });
      }
      const selectableRecipes = machines
        .filter((machine) => machine.supported)
        .map((machine) => ({
          machineType: machine.name,
          description: machine.description,
        }));
      const available = Boolean(
        recipe &&
          firmwareReady &&
          selectableRecipes.length &&
          accelerators.some((a) => a.usable),
      );
      result[arch] = {
        installed: true,
        available,
        version: version.stdout.split("\n")[0],
        machine: recipe?.machine || null,
        accelerator: "tcg",
        firmwareReady,
        discoveredMachines: machines,
        discoveredUnsupported: machines.filter((m) => !m.supported),
        selectableRecipes,
        accelerators,
        reason: available
          ? null
          : !recipe
            ? "Executable is installed, but its platform device recipe is not implemented."
            : !firmwareReady
              ? "Required platform firmware is unavailable."
              : "No supported usable machine and accelerator combination was discovered.",
      };
    } catch (error) {
      result[arch] = {
        installed,
        available: false,
        discoveryIncomplete: installed,
        version: versionText,
        reason:
          !installed && error.code === "ENOENT"
            ? `${executable} is not installed.`
            : `${executable} is ${installed ? "installed, but its" : "not verified;"} capability discovery did not complete.`,
        discoveredMachines: [],
        discoveredUnsupported: [],
        selectableRecipes: [],
        accelerators: [],
      };
    }
  }
  return result;
}
async function installedTargets() {
  const directories = [
    ...new Set((process.env.PATH || "").split(path.delimiter).filter(Boolean)),
  ];
  const targets = new Set();
  let truncated = directories.length > 64,
    unreadableDirectories = 0;
  for (const directory of directories.slice(0, 64)) {
    try {
      const handle = await opendir(directory);
      let count = 0;
      for await (const entry of handle) {
        if (++count > 4096) {
          truncated = true;
          break;
        }
        if (!entry.isFile() && !entry.isSymbolicLink()) continue;
        const match = entry.name.match(
          /^qemu-system-([a-z0-9_-]+?)(?:\.exe)?$/i,
        );
        if (match && targets.size < 128) targets.add(match[1].toLowerCase());
        else if (match) truncated = true;
      }
    } catch {
      unreadableDirectories++;
    }
  }
  return {
    targets: [...targets],
    diagnostics: {
      pathDirectoriesInspected: Math.min(directories.length, 64),
      unreadableDirectories,
      truncated,
      maximumDirectories: 64,
      maximumEntriesPerDirectory: 4096,
      maximumAdditionalTargets: 128,
    },
  };
}

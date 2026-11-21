import { parseCpuFlags } from "./cpu-numa.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const exec = promisify(execFile);

export const cpuModelAllowList = [
  "host",
  "max",
  "qemu64",
  "Skylake-Client",
  "EPYC",
];

const linuxSets = {
  x86_64: [
    {
      code: "/usr/share/OVMF/OVMF_CODE_4M.fd",
      secureCode: "/usr/share/OVMF/OVMF_CODE_4M.secboot.fd",
      vars: "/usr/share/OVMF/OVMF_VARS_4M.fd",
    },
    {
      code: "/usr/share/OVMF/OVMF_CODE.fd",
      secureCode: "/usr/share/OVMF/OVMF_CODE.secboot.fd",
      vars: "/usr/share/OVMF/OVMF_VARS.fd",
    },
    {
      code: "/usr/share/qemu/edk2-x86_64-code.fd",
      secureCode: "/usr/share/qemu/edk2-x86_64-secure-code.fd",
      vars: "/usr/share/qemu/edk2-i386-vars.fd",
    },
  ],
  i386: [
    {
      code: "/usr/share/qemu/edk2-i386-code.fd",
      secureCode: "/usr/share/qemu/edk2-i386-secure-code.fd",
      vars: "/usr/share/qemu/edk2-i386-vars.fd",
    },
  ],
};
const bundledNames = {
  x86_64: {
    code: "edk2-x86_64-code.fd",
    secureCode: "edk2-x86_64-secure-code.fd",
    vars: "edk2-i386-vars.fd",
  },
  i386: {
    code: "edk2-i386-code.fd",
    secureCode: "edk2-i386-secure-code.fd",
    vars: "edk2-i386-vars.fd",
  },
};

async function readable(file) {
  try {
    await access(file, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
export function firmwareCandidates(arch, qemuDirectories = []) {
  const sets = [...(linuxSets[arch] || [])];
  const names = bundledNames[arch];
  if (names)
    for (const directory of qemuDirectories)
      sets.push({
        code: path.join(directory, "share", names.code),
        secureCode: path.join(directory, "share", names.secureCode),
        vars: path.join(directory, "share", names.vars),
      });
  return sets;
}
// Pick the first firmware set whose code and variable template are readable.
export async function findFirmware(arch, qemuDirectories = [], check = readable) {
  for (const set of firmwareCandidates(arch, qemuDirectories)) {
    if (!(await check(set.code)) || !(await check(set.vars))) continue;
    return {
      uefi: true,
      code: set.code,
      vars: set.vars,
      secureBoot: await check(set.secureCode),
      secureCode: (await check(set.secureCode)) ? set.secureCode : null,
    };
  }
  return { uefi: false, secureBoot: false, code: null, secureCode: null, vars: null };
}
export function parseCpuModels(output) {
  const models = new Set();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:x86\s+)?([A-Za-z0-9][A-Za-z0-9._-]*)(?:\s{2,}|\s*$)/);
    if (!match || /^(Available|Recognized)$/i.test(match[1])) continue;
    models.add(match[1]);
    if (models.size >= 2000) break;
  }
  return [...models];
}
export async function findOnPath(names) {
  for (const directory of (process.env.PATH || "").split(path.delimiter)) {
    if (!directory) continue;
    for (const name of names) {
      const file = path.join(directory, name);
      if (await readable(file)) return file;
    }
  }
  return null;
}
// Discover the optional features the launch builder may use on this host.
export async function discoverHost(capabilities = {}) {
  const directories = [];
  for (const executable of ["qemu-system-x86_64", "qemu-system-i386"]) {
    const found = await findOnPath([executable, `${executable}.exe`]);
    if (found) directories.push(path.dirname(found));
  }
  const firmware = {};
  for (const arch of ["x86_64", "i386"])
    firmware[arch] = await findFirmware(arch, [...new Set(directories)]);
  const swtpm = await findOnPath(["swtpm", "swtpm.exe"]);
  const cpuModels = {};
  const cpuFlags = {};
  for (const arch of ["x86_64", "i386"]) {
    if (!capabilities[arch]?.installed) continue;
    try {
      const { stdout } = await exec(`qemu-system-${arch}`, ["-cpu", "help"], {
        timeout: 5000,
        maxBuffer: 512 * 1024,
      });
      cpuModels[arch] = parseCpuModels(stdout);
      cpuFlags[arch] = parseCpuFlags(stdout);
    } catch {
      /* Fall back to the allow-list. */
    }
  }
  return { firmware, swtpm, cpuModels, cpuFlags };
}
export function hostSummary(host, capabilities) {
  const available = Object.entries(capabilities).filter(([, c]) => c.available);
  const accelerators = [
    ...new Set(
      available.flatMap(([, c]) =>
        c.accelerators.filter((a) => a.usable).map((a) => a.name),
      ),
    ),
  ];
  const x86 = host.firmware.x86_64;
  const discovered = host.cpuModels.x86_64;
  return {
    qemuVersion: (
      capabilities.x86_64?.version ||
      available[0]?.[1].version ||
      ""
    ).replace(/^QEMU emulator version\s*/i, ""),
    accelerators,
    targets: available.map(([arch]) => arch),
    firmware: { uefi: x86.uefi, secureBoot: x86.secureBoot },
    swtpm: Boolean(host.swtpm),
    cpuModels: discovered?.length
      ? cpuModelAllowList.filter(
          (m) => m === "host" || discovered.includes(m),
        )
      : cpuModelAllowList,
    cpuFlags: host.cpuFlags?.x86_64 || [],
  };
}

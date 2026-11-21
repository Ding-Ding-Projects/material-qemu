// Read-only discovery of virtualization hardware on a Linux host: IOMMU groups,
// hugepages, VFIO, nested virtualization and confidential computing (AMD SEV,
// Intel TDX). Nothing is changed or loaded. Inside a container only what the
// container can see is reported. Other platforms are reported as not checked.
import { readFile, readdir, access } from "node:fs/promises";

const defaultFs = {
  read: (p) => readFile(p, "utf8"),
  list: (p) => readdir(p),
  exists: (p) => access(p).then(() => true, () => false),
};
const flag = (text) => (text == null ? null : /^\s*(1|y|yes|on)\s*$/i.test(text));

export async function hardwareFacts({ platform = process.platform, fs = defaultFs } = {}) {
  if (platform !== "linux") return { checked: false, reason: "Hardware discovery reads Linux /sys and /proc; it is not checked on this host platform." };
  const read = (p) => fs.read(p).catch(() => null);
  const list = (p) => fs.list(p).catch(() => null);
  const groups = await list("/sys/kernel/iommu_groups");
  const iommuUnits = await list("/sys/class/iommu");
  const meminfo = (await read("/proc/meminfo")) || "";
  const pages = Number(meminfo.match(/^HugePages_Total:\s+(\d+)/m)?.[1] ?? NaN);
  const freePages = Number(meminfo.match(/^HugePages_Free:\s+(\d+)/m)?.[1] ?? NaN);
  const pageKiB = Number(meminfo.match(/^Hugepagesize:\s+(\d+)\s*kB/m)?.[1] ?? NaN);
  const thp = (await read("/sys/kernel/mm/transparent_hugepage/enabled"))?.match(/\[(\w+)\]/)?.[1] ?? null;
  const cpuinfo = (await read("/proc/cpuinfo")) || "";
  const cpuFlags = new Set((cpuinfo.match(/^flags\s*:\s*(.*)$/m)?.[1] || "").split(/\s+/).filter(Boolean));
  const nested = flag(await read("/sys/module/kvm_intel/parameters/nested")) ?? flag(await read("/sys/module/kvm_amd/parameters/nested"));
  return {
    checked: true,
    iommu: { enabled: Boolean((groups && groups.length) || (iommuUnits && iommuUnits.length)), groups: groups ? groups.length : null },
    hugepages: { total: Number.isFinite(pages) ? pages : null, free: Number.isFinite(freePages) ? freePages : null, sizeKiB: Number.isFinite(pageKiB) ? pageKiB : null, transparent: thp },
    vfio: { device: await fs.exists("/dev/vfio/vfio"), module: await fs.exists("/sys/module/vfio_pci") },
    nestedVirtualization: nested,
    confidential: {
      sev: flag(await read("/sys/module/kvm_amd/parameters/sev")),
      sevEs: flag(await read("/sys/module/kvm_amd/parameters/sev_es")),
      sevSnp: flag(await read("/sys/module/kvm_amd/parameters/sev_snp")),
      tdx: flag(await read("/sys/module/kvm_intel/parameters/tdx")),
      cpuAdvertises: ["sev", "sev_es", "sev_snp", "tdx_host_platform"].filter((f) => cpuFlags.has(f)),
    },
  };
}

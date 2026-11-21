import test from "node:test";
import assert from "node:assert/strict";
import { hardwareFacts } from "../server/hardware-facts.mjs";

function fakeFs(files, dirs = {}) {
  return {
    read: async (p) => { if (p in files) return files[p]; throw new Error("ENOENT"); },
    list: async (p) => { if (p in dirs) return dirs[p]; throw new Error("ENOENT"); },
    exists: async (p) => p in files || p in dirs,
  };
}

test("a Linux host with IOMMU, hugepages, VFIO, nesting and SEV is described", async () => {
  const facts = await hardwareFacts({
    platform: "linux",
    fs: fakeFs({
      "/proc/meminfo": "MemTotal: 32000000 kB\nHugePages_Total:     512\nHugePages_Free:      500\nHugepagesize:       2048 kB\n",
      "/sys/kernel/mm/transparent_hugepage/enabled": "always [madvise] never\n",
      "/proc/cpuinfo": "processor : 0\nflags : fpu vmx sev sev_es\n",
      "/sys/module/kvm_amd/parameters/nested": "1\n",
      "/sys/module/kvm_amd/parameters/sev": "Y\n",
      "/sys/module/kvm_amd/parameters/sev_es": "N\n",
      "/dev/vfio/vfio": "",
    }, { "/sys/kernel/iommu_groups": ["0", "1", "2"], "/sys/module/vfio_pci": [] }),
  });
  assert.equal(facts.checked, true);
  assert.deepEqual(facts.iommu, { enabled: true, groups: 3 });
  assert.deepEqual(facts.hugepages, { total: 512, free: 500, sizeKiB: 2048, transparent: "madvise" });
  assert.deepEqual(facts.vfio, { device: true, module: true });
  assert.equal(facts.nestedVirtualization, true);
  assert.equal(facts.confidential.sev, true);
  assert.equal(facts.confidential.sevEs, false);
  assert.equal(facts.confidential.tdx, null);
  assert.deepEqual(facts.confidential.cpuAdvertises, ["sev", "sev_es"]);
});

test("missing files are reported as unknown or absent, never invented", async () => {
  const facts = await hardwareFacts({ platform: "linux", fs: fakeFs({}) });
  assert.deepEqual(facts.iommu, { enabled: false, groups: null });
  assert.equal(facts.hugepages.total, null);
  assert.deepEqual(facts.vfio, { device: false, module: false });
  assert.equal(facts.nestedVirtualization, null);
});

test("other platforms are not checked", async () => {
  const facts = await hardwareFacts({ platform: "win32" });
  assert.equal(facts.checked, false);
  assert.match(facts.reason, /not checked on this host platform/);
});

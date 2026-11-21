import test from "node:test";
import assert from "node:assert/strict";
import { parseCpuFlags, validateCpuFlags, validateNuma, cpuArgument, numaLayout, numaArguments } from "../server/cpu-numa.mjs";

const help = `x86 max    Enables all features supported by the accelerator
Recognized CPUID flags:
  3dnow abm aes avx avx2
  sse4.1 sse4.2 vmx x2apic
`;

test("flag names are read from QEMU's recognized flag list", () => {
  assert.deepEqual(parseCpuFlags(help), ["3dnow", "abm", "aes", "avx", "avx2", "sse4.1", "sse4.2", "vmx", "x2apic"]);
  assert.deepEqual(parseCpuFlags("no flags here"), []);
});

test("CPU flags are checked against the build and rendered as on or off", () => {
  const host = { cpuFlags: { x86_64: parseCpuFlags(help) } };
  const flags = validateCpuFlags([{ name: "AVX2", on: false }, { name: "vmx" }], { arch: "x86_64", host });
  assert.deepEqual(flags, [{ name: "avx2", on: false }, { name: "vmx", on: true }]);
  assert.equal(cpuArgument("max", flags), "max,avx2=off,vmx=on");
  assert.equal(cpuArgument("max"), "max");
  assert.throws(() => validateCpuFlags([{ name: "nonsense" }], { arch: "x86_64", host }), /does not recognize/);
  assert.throws(() => validateCpuFlags([{ name: "avx" }, { name: "avx" }], { arch: "x86_64", host }), /only once/);
  assert.throws(() => validateCpuFlags([{ name: "avx,kvm=off" }], { arch: "x86_64" }), /lowercase letters/);
  assert.throws(() => validateCpuFlags([{ name: "avx" }], { arch: "aarch64" }), /x86 targets only/);
  assert.deepEqual(validateCpuFlags(undefined, { arch: "aarch64" }), []);
});

test("NUMA splits memory and CPUs evenly and refuses impossible layouts", () => {
  assert.deepEqual(validateNuma({ nodes: 2 }, { memory: 1024, cpus: 4 }), { nodes: 2 });
  assert.deepEqual(validateNuma({ nodes: 1 }, { memory: 1024, cpus: 4 }), { nodes: 0 });
  assert.deepEqual(validateNuma(undefined, { memory: 1024, cpus: 4 }), { nodes: 0 });
  assert.throws(() => validateNuma({ nodes: 4 }, { memory: 1024, cpus: 2 }), /at least one virtual CPU/);
  assert.throws(() => validateNuma({ nodes: 3 }, { memory: 128, cpus: 4 }), /64 MiB/);
  assert.throws(() => validateNuma({ nodes: 9 }, { memory: 4096, cpus: 16 }), /0–8/);
  assert.deepEqual(numaLayout({ nodes: 3 }, 1000, 5), [
    { node: 0, memory: 334, first: 0, last: 1 },
    { node: 1, memory: 333, first: 2, last: 3 },
    { node: 2, memory: 333, first: 4, last: 4 },
  ]);
  assert.deepEqual(numaArguments({ nodes: 2 }, 512, 2), [
    "-object", "memory-backend-ram,id=numa-mem0,size=256M", "-numa", "node,nodeid=0,cpus=0,memdev=numa-mem0",
    "-object", "memory-backend-ram,id=numa-mem1,size=256M", "-numa", "node,nodeid=1,cpus=1,memdev=numa-mem1",
  ]);
  assert.deepEqual(numaArguments({ nodes: 0 }, 512, 2), []);
});

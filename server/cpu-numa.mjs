// Individual CPU feature flags and NUMA nodes. Flags are names from QEMU's own
// "Recognized CPUID flags" list, turned on or off on top of the CPU model.
// NUMA splits the machine's memory and virtual CPUs evenly across 2 to 8 nodes.

export const MAX_CPU_FLAGS = 24;
export const MAX_NUMA_NODES = 8;
const FLAG_NAME = /^[a-z0-9][a-z0-9_.-]{0,39}$/;

// Collects the flag names QEMU lists after "Recognized CPUID flags:".
export function parseCpuFlags(output) {
  const flags = new Set();
  let inFlags = false;
  for (const line of String(output).split(/\r?\n/)) {
    if (/^Recognized CPUID flags:/i.test(line)) { inFlags = true; continue; }
    if (!inFlags) continue;
    if (!/^\s+\S/.test(line)) break;
    for (const name of line.trim().split(/\s+/)) if (FLAG_NAME.test(name)) flags.add(name);
    if (flags.size >= 2000) break;
  }
  return [...flags];
}

// input: [{ name, on }]. Returns the cleaned list. Flags exist for x86 targets.
export function validateCpuFlags(input, { arch, host } = {}) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > MAX_CPU_FLAGS)
    throw new Error(`Use at most ${MAX_CPU_FLAGS} CPU flags.`);
  if (input.length && !["x86_64", "i386"].includes(arch))
    throw new Error("CPU flags are available for x86 targets only.");
  const known = host?.cpuFlags?.[arch];
  const seen = new Set();
  return input.map((f) => {
    const name = String(f?.name ?? "").trim().toLowerCase();
    if (!FLAG_NAME.test(name)) throw new Error("CPU flag names use lowercase letters, digits, dots, dashes and underscores.");
    if (known?.length && !known.includes(name)) throw new Error("This QEMU build does not recognize that CPU flag.");
    if (seen.has(name)) throw new Error("Each CPU flag can be listed only once.");
    seen.add(name);
    return { name, on: f.on !== false };
  });
}

// input: { nodes } with 0 or 1 meaning no NUMA. Each node needs at least one
// virtual CPU and 64 MiB of memory.
export function validateNuma(input, { memory, cpus }) {
  const nodes = input === undefined || input === null || input === "" ? 0 : Number(input?.nodes ?? input);
  if (!Number.isInteger(nodes) || nodes < 0 || nodes > MAX_NUMA_NODES)
    throw new Error(`NUMA nodes must be 0–${MAX_NUMA_NODES}.`);
  if (nodes < 2) return { nodes: 0 };
  if (cpus < nodes) throw new Error("Each NUMA node needs at least one virtual CPU.");
  if (memory < nodes * 64) throw new Error("Each NUMA node needs at least 64 MiB of memory.");
  return { nodes };
}

// The -cpu value: the model followed by flag=on or flag=off for each flag.
export function cpuArgument(model, flags = []) {
  return [model, ...flags.map((f) => `${f.name}=${f.on ? "on" : "off"}`)].join(",");
}

// Even split of memory (the first nodes take any remainder) and of CPU
// indexes (contiguous ranges, the first nodes take any extra CPUs).
export function numaLayout(numa, memory, cpus) {
  const n = numa?.nodes || 0;
  if (n < 2) return [];
  const baseMem = Math.floor(memory / n), extraMem = memory % n;
  const baseCpu = Math.floor(cpus / n), extraCpu = cpus % n;
  const out = [];
  let cpu = 0;
  for (let i = 0; i < n; i++) {
    const count = baseCpu + (i < extraCpu ? 1 : 0);
    out.push({ node: i, memory: baseMem + (i < extraMem ? 1 : 0), first: cpu, last: cpu + count - 1 });
    cpu += count;
  }
  return out;
}

export function numaArguments(numa, memory, cpus) {
  return numaLayout(numa, memory, cpus).flatMap((n) => [
    "-object", `memory-backend-ram,id=numa-mem${n.node},size=${n.memory}M`,
    "-numa", `node,nodeid=${n.node},cpus=${n.first === n.last ? n.first : `${n.first}-${n.last}`},memdev=numa-mem${n.node}`,
  ]);
}

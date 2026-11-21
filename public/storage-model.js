// Normalizes the storage inventory from GET /api/storage, or derives one from the machine list.
const GIB = 1073741824;
const num = (...values) => {
  for (const v of values) if (Number.isFinite(Number(v)) && v !== null && v !== "") return Number(v);
  return null;
};
export function normalizeStorage(data, state) {
  if (data && (Array.isArray(data.disks) || Array.isArray(data.isos))) {
    const names = new Map(state.machines.map((m) => [m.id, m.name]));
    return {
      source: "server",
      disks: (data.disks || []).map((entry, i) => {
        const d = entry.disk ? { ...entry, ...entry.disk } : entry;
        return {
        id: d.machineId ? `${d.machineId}:${d.id ?? i}` : String(d.id ?? d.name ?? i),
        diskId: String(d.id ?? d.name ?? i),
        name: String(d.name ?? d.file ?? `disk-${i + 1}`),
        diskName: d.name,
        snapshots: Array.isArray(d.snapshots) ? d.snapshots.length : num(d.snapshots),
        machineId: d.machineId ?? d.machine?.id ?? null,
        machineName: d.machineName ?? (typeof d.machine === "string" ? d.machine : d.machine?.name) ?? names.get(d.machineId) ?? "",
        bytes: num(d.bytes, d.sizeBytes, d.virtualBytes, d.sizeGiB != null ? d.sizeGiB * GIB : null),
        usedBytes: num(d.usedBytes, d.used, d.actualBytes),
        format: String(d.format ?? "qcow2"),
      };
      }),
      isos: (data.isos || []).map((i) => ({
        name: String(typeof i === "string" ? i : i.name),
        bytes: typeof i === "string" ? null : num(i.bytes, i.size, i.sizeBytes),
      })),
    };
  }
  return {
    source: "derived",
    disks: state.machines.flatMap((m) =>
      (m.disks?.length ? m.disks : [{ id: "system", name: "system", sizeGiB: m.diskGiB, format: "qcow2" }]).map((d) => ({
        id: String(d.id ?? d.name),
        name: `${m.name} · ${d.name || "disk"}`,
        diskName: d.name || "system",
        machineId: m.id,
        machineName: m.name,
        bytes: num(d.sizeGiB) != null ? d.sizeGiB * GIB : null,
        usedBytes: null,
        format: String(d.format || "qcow2"),
      })),
    ),
    isos: state.media.map((name) => ({ name, bytes: null })),
  };
}
export function kindOfUpload(fileName) {
  const ext = String(fileName).toLowerCase().split(".").pop();
  // A machine bundle exported from another Material QEMU host.
  if (ext === "tar" || String(fileName).toLowerCase().endsWith(".mqvm.tar")) return "bundle";
  if (ext === "iso") return "iso";
  if (["qcow2", "raw", "img", "vmdk", "vdi", "vhdx"].includes(ext)) return "disk";
  return null;
}

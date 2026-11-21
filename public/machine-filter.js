export function filterMachines(
  machines,
  { query = "", state = "all", folder = "", now = Date.now(), matcher = null } = {},
) {
  const result = machines.filter((machine) => {
    const text =
      `${machine.name} ${machine.notes || ""} ${machine.folder || ""} ${machine.arch} ${(machine.tags || []).join(" ")}`.toLowerCase();
    const recent =
      machine.lastUsed &&
      Number.isFinite(Date.parse(machine.lastUsed)) &&
      Date.parse(machine.lastUsed) >= now - 7 * 24 * 60 * 60 * 1000;
    const matches =
      state === "all" ||
      (state === "favourites" && machine.favourite) ||
      (state === "attention" &&
        Boolean(machine.error || machine.state === "error")) ||
      (state === "recent" && recent) ||
      machine.state === state;
    return (
      (matcher ? matcher(machine) : !query || text.includes(query.toLowerCase())) &&
      matches &&
      (!folder || machine.folder === folder)
    );
  });
  return state === "recent"
    ? result.sort((a, b) => Date.parse(b.lastUsed) - Date.parse(a.lastUsed))
    : result;
}

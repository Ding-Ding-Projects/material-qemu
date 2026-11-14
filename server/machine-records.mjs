import { event } from "./store.mjs";

export function removeMachine(state, id, request, runtimeState) {
  const machine = state.machines.find((value) => value.id === id);
  if (!machine) throw new Error("Machine no longer exists.");
  if (runtimeState !== "stopped")
    throw new Error(
      "Stop the machine before removing it. No disk or definition was changed.",
    );
  if (request.confirmName !== machine.name || request.retainDisk !== true)
    throw new Error(
      "Confirm the exact machine name and explicitly retain its disk.",
    );
  const removed = state.removedMachines || [];
  if (removed.length >= 1000)
    throw new Error(
      "Retained machine archive is full. No machine was removed.",
    );
  removed.push({
    ...machine,
    removedAt: new Date().toISOString(),
    diskRetained: true,
  });
  state.removedMachines = removed;
  state.machines = state.machines.filter((value) => value.id !== id);
  event(
    state,
    `Removed ${machine.name} from the workspace; definition and disk retained.`,
  );
  return { removed: true, id, diskRetained: true, restoreAvailable: true };
}
export function restoreMachine(state, id) {
  const machine = state.removedMachines?.find((value) => value.id === id);
  if (!machine) throw new Error("Retained machine no longer exists.");
  if (state.machines.some((value) => value.id === id))
    throw new Error("Machine identity is already active.");
  if (state.machines.length >= 100)
    throw new Error("Active machine limit reached.");
  const { removedAt, diskRetained, ...restored } = machine;
  if (restored.folder && !state.folders.includes(restored.folder))
    restored.folder = "";
  state.machines.push(restored);
  state.removedMachines = state.removedMachines.filter(
    (value) => value.id !== id,
  );
  event(state, `Restored ${restored.name} with its retained disk.`);
  return { restored: true, id, folder: restored.folder };
}

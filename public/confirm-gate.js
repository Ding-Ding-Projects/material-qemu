// Two-key super confirmation as a pure state machine.
// Phases: locked -> armed (both keys on) -> sliding -> done, or cancelled at any time.
export const GATE_MAX = 100;
export function createGate() {
  return { keys: [false, false], value: 0, phase: "locked" };
}
const phaseFor = (gate) =>
  gate.keys[0] && gate.keys[1]
    ? gate.value >= GATE_MAX
      ? "done"
      : gate.value > 0
        ? "sliding"
        : "armed"
    : "locked";
export function toggleKey(gate, index) {
  if (gate.phase === "done" || gate.phase === "cancelled") return gate;
  const keys = [...gate.keys];
  keys[index] = !keys[index];
  const next = { ...gate, keys, value: keys[0] && keys[1] ? gate.value : 0 };
  return { ...next, phase: phaseFor(next) };
}
export function slide(gate, raw) {
  if (gate.phase === "done" || gate.phase === "cancelled") return gate;
  if (!(gate.keys[0] && gate.keys[1])) return { ...gate, value: 0 };
  const value = Math.max(0, Math.min(GATE_MAX, Number(raw) || 0));
  const next = { ...gate, value };
  return { ...next, phase: phaseFor(next) };
}
// Letting go anywhere short of the end snaps the slider back; a completed gate stays done.
export function release(gate) {
  if (gate.phase !== "sliding") return gate;
  return { ...gate, value: 0, phase: "armed" };
}
export function cancel(gate) {
  return gate.phase === "done" ? gate : { ...gate, phase: "cancelled" };
}
export const isUnlocked = (gate) => gate.keys[0] && gate.keys[1];
export const isDone = (gate) => gate.phase === "done";

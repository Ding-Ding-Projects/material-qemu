// Detects the "release input" chord: Ctrl and Alt pressed together and let go
// with no other key in between. Ctrl+Alt+Del and other combinations still reach
// the guest because another key is pressed while the modifiers are held.
export function createReleaseChord(onRelease) {
  let ctrl = false;
  let alt = false;
  let armed = false;
  let spoiled = false;
  const isCtrl = (k) => k === "Control";
  const isAlt = (k) => k === "Alt" || k === "AltGraph";
  return {
    keydown(event) {
      if (isCtrl(event.key)) ctrl = true;
      else if (isAlt(event.key)) alt = true;
      else spoiled = true;
      if (ctrl && alt && !spoiled) armed = true;
    },
    keyup(event) {
      const fire = armed && !spoiled && (isCtrl(event.key) || isAlt(event.key));
      if (isCtrl(event.key)) ctrl = false;
      if (isAlt(event.key)) alt = false;
      if (!ctrl && !alt) {
        armed = false;
        spoiled = false;
      }
      if (fire) {
        armed = false;
        spoiled = true;
        onRelease();
        return true;
      }
      return false;
    },
    reset() {
      ctrl = alt = armed = spoiled = false;
    },
  };
}

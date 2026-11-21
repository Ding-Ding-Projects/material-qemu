import test from "node:test";
import assert from "node:assert/strict";
import {
  schemeFor,
  contrastRatio,
  TEXT_PAIRS,
  SEEDS,
  seedToLch,
  toneColor,
  relativeLuminance,
  cssVarName,
} from "../public/md3-color.js";

const seeds = [
  ...SEEDS.map((s) => s[1]),
  "#ffff00",
  "#000000",
  "#ffffff",
  "#808080",
  "#00ff00",
];
test("every text role pair meets 4.5:1 for light and dark across seeds", () => {
  for (const seed of seeds)
    for (const mode of ["light", "dark"]) {
      const scheme = schemeFor(seed, mode);
      for (const [fg, bg] of TEXT_PAIRS)
        assert.ok(
          contrastRatio(scheme[fg], scheme[bg]) >= 4.5,
          `${seed} ${mode} ${fg} on ${bg} = ${contrastRatio(scheme[fg], scheme[bg]).toFixed(2)}`,
        );
    }
});
test("tones are monotonic in luminance and exact at the ends", () => {
  assert.equal(toneColor(30, 0.15, 0), "#000000");
  assert.equal(toneColor(30, 0.15, 100), "#ffffff");
  let last = -1;
  for (const tone of [10, 30, 50, 70, 90]) {
    const y = relativeLuminance(toneColor(30, 0.15, tone));
    assert.ok(y > last);
    last = y;
  }
});
test("seed hue is recovered and roles are valid hex", () => {
  const { h } = seedToLch("#ff0000");
  assert.ok(h > 15 && h < 45);
  for (const value of Object.values(schemeFor("#7a5af8", "dark")))
    assert.match(value, /^#[0-9a-f]{6}$/);
  assert.equal(cssVarName("onSurfaceVariant"), "--on-surface-variant");
});

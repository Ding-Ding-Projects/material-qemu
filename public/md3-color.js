// Material Design 3 colour roles generated from a seed colour.
// Tones are exact in relative luminance (CIE L*), so role pairs keep their contrast.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const toLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const fromLinear = (c) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]) {
  return `#${[r, g, b]
    .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}
export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => toLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (hi + 0.05) / (lo + 0.05);
}
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
export function seedToLch(hex) {
  const rgb = hexToRgb(hex) || [255, 153, 92];
  const [L, a, b] = linearToOklab(rgb.map((v) => toLinear(v / 255)));
  return {
    L,
    C: Math.hypot(a, b),
    h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
  };
}
const inGamut = (lin) => lin.every((v) => v >= -0.0005 && v <= 1.0005);
function lchToLinear(L, C, h) {
  const r = (h * Math.PI) / 180;
  return oklabToLinear([L, C * Math.cos(r), C * Math.sin(r)]);
}
function toneToY(tone) {
  const fy = (tone + 16) / 116;
  return fy > 6 / 29 ? fy ** 3 : (108 / 841) * (fy - 4 / 29);
}
const lum = (lin) => 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
// Colour at a hue, as much of the chroma as fits the sRGB gamut, at the exact tone.
export function toneColor(h, C, tone) {
  if (tone <= 0) return "#000000";
  if (tone >= 100) return "#ffffff";
  const targetY = toneToY(tone);
  const at = (L) => {
    let lo = 0,
      hi = C,
      lin = lchToLinear(L, 0, h);
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2,
        cand = lchToLinear(L, mid, h);
      if (inGamut(cand)) {
        lo = mid;
        lin = cand;
      } else hi = mid;
    }
    return lin.map((v) => clamp(v, 0, 1));
  };
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    lum(at(mid)) < targetY ? (lo = mid) : (hi = mid);
  }
  return rgbToHex(at((lo + hi) / 2).map((v) => fromLinear(v) * 255));
}
export function tonalPalettes(seedHex) {
  const { C, h } = seedToLch(seedHex);
  const chroma = clamp(C, 0.09, 0.2);
  return {
    primary: { h, C: chroma },
    secondary: { h, C: 0.045 },
    tertiary: { h: (h + 60) % 360, C: Math.max(0.07, chroma * 0.7) },
    neutral: { h, C: 0.008 },
    neutralVariant: { h, C: 0.016 },
    error: { h: 29, C: 0.2 },
  };
}
// Role -> [palette, lightTone, darkTone]
const ROLES = {
  primary: ["primary", 40, 80],
  onPrimary: ["primary", 100, 20],
  primaryContainer: ["primary", 90, 30],
  onPrimaryContainer: ["primary", 10, 90],
  secondary: ["secondary", 40, 80],
  onSecondary: ["secondary", 100, 20],
  secondaryContainer: ["secondary", 90, 30],
  onSecondaryContainer: ["secondary", 10, 90],
  tertiary: ["tertiary", 40, 80],
  onTertiary: ["tertiary", 100, 20],
  tertiaryContainer: ["tertiary", 90, 30],
  onTertiaryContainer: ["tertiary", 10, 90],
  error: ["error", 40, 80],
  onError: ["error", 100, 20],
  errorContainer: ["error", 90, 30],
  onErrorContainer: ["error", 10, 90],
  surface: ["neutral", 98, 6],
  surfaceDim: ["neutral", 87, 6],
  surfaceContainerLowest: ["neutral", 100, 4],
  surfaceContainerLow: ["neutral", 96, 10],
  surfaceContainer: ["neutral", 94, 12],
  surfaceContainerHigh: ["neutral", 92, 17],
  surfaceContainerHighest: ["neutral", 90, 22],
  onSurface: ["neutral", 10, 90],
  onSurfaceVariant: ["neutralVariant", 30, 80],
  outline: ["neutralVariant", 50, 60],
  outlineVariant: ["neutralVariant", 80, 30],
  inverseSurface: ["neutral", 20, 90],
  inverseOnSurface: ["neutral", 95, 20],
  inversePrimary: ["primary", 80, 40],
};
export const TEXT_PAIRS = [
  ["onPrimary", "primary"],
  ["onPrimaryContainer", "primaryContainer"],
  ["onSecondary", "secondary"],
  ["onSecondaryContainer", "secondaryContainer"],
  ["onTertiary", "tertiary"],
  ["onTertiaryContainer", "tertiaryContainer"],
  ["onError", "error"],
  ["onErrorContainer", "errorContainer"],
  ["onSurface", "surface"],
  ["onSurface", "surfaceContainerHighest"],
  ["onSurfaceVariant", "surface"],
  ["onSurfaceVariant", "surfaceContainerHighest"],
  ["inverseOnSurface", "inverseSurface"],
  ["primary", "surface"],
  ["primary", "surfaceContainerHighest"],
  ["error", "surface"],
];
export function schemeFor(seedHex, mode) {
  const palettes = tonalPalettes(seedHex),
    dark = mode === "dark",
    out = {};
  for (const [role, [palette, light, darkTone]] of Object.entries(ROLES)) {
    const p = palettes[palette];
    out[role] = toneColor(p.h, p.C, dark ? darkTone : light);
  }
  return out;
}
export const cssVarName = (role) =>
  `--${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
export const SEEDS = [
  ["ember", "#ff8a4c", "Ember", "琥珀"],
  ["ocean", "#1b8aa6", "Ocean", "海洋"],
  ["violet", "#7a5af8", "Violet", "紫羅蘭"],
  ["forest", "#3f9b5c", "Forest", "森林"],
  ["rose", "#e0457b", "Rose", "玫瑰"],
];
export function seedHex(value) {
  const preset = SEEDS.find(([id]) => id === value);
  return preset ? preset[1] : hexToRgb(value) ? value : SEEDS[0][1];
}
export function applyScheme(root, seed, mode) {
  const scheme = schemeFor(seedHex(seed), mode);
  for (const [role, value] of Object.entries(scheme))
    root.style.setProperty(cssVarName(role), value);
  root.style.setProperty("color-scheme", mode);
  return scheme;
}

// Runs regex toolkit operations off the page so a pattern that backtracks
// catastrophically can be stopped. Posts back { ok, result } or { ok: false, error }.
import { findMatches, previewReplace, previewSplit } from "./regex-tools.js";

const ops = { findMatches, previewReplace, previewSplit };
self.onmessage = (event) => {
  const { id, op, args } = event.data || {};
  try {
    const started = performance.now();
    const result = ops[op](...args);
    self.postMessage({ id, ok: true, result, ms: Math.round(performance.now() - started) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message || error) });
  }
};

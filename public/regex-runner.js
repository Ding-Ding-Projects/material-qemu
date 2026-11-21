// Runs a toolkit operation in a fresh worker with a time limit. A pattern that
// runs past the limit (usually catastrophic backtracking) is stopped and
// reported instead of freezing the page.
export const TIME_LIMIT_MS = 1000;

export function runBounded(op, args, { limit = TIME_LIMIT_MS, Worker: W = globalThis.Worker, url = new URL("./regex-worker.js", import.meta.url) } = {}) {
  return new Promise((resolve) => {
    if (typeof W !== "function") return resolve({ ok: false, error: "Background workers are unavailable in this browser.", unavailable: true });
    const worker = new W(url, { type: "module" });
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ ok: false, timedOut: true, error: `Stopped after ${limit / 1000} second: the pattern backtracks too much on this text.` });
    }, limit);
    worker.onmessage = (event) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ ok: false, error: event.message || "The pattern could not be run." });
    };
    worker.postMessage({ id: 1, op, args });
  });
}

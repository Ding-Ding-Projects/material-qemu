// Running jobs: long operations (uploads, imports, resizes, clones, snapshots)
// registered while they run, with byte progress for uploads. Finished jobs
// stay listed for ten minutes so their outcome can be seen. Nothing is stored
// on disk; the list starts empty when the server starts.
import { Transform, pipeline } from "node:stream";
import { randomUUID } from "node:crypto";

export const JOB_KINDS = ["upload-iso", "import-disk", "resize-disk", "clone", "snapshot-create", "snapshot-restore", "snapshot-delete"];
const KEEP_FINISHED_MS = 10 * 60 * 1000;
const MAX_FINISHED = 30;

export function createJobs({ now = () => Date.now() } = {}) {
  const jobs = new Map();
  const prune = () => {
    const done = [...jobs.values()].filter((j) => j.state !== "running").sort((a, b) => b.finishedAt - a.finishedAt);
    done.forEach((j, i) => { if (i >= MAX_FINISHED || now() - j.finishedAt > KEEP_FINISHED_MS) jobs.delete(j.id); });
  };
  function start({ kind, label, machineId = null, totalBytes = null }) {
    if (!JOB_KINDS.includes(kind)) throw new Error("Unknown job kind.");
    const job = { id: randomUUID(), kind, label: String(label || "").slice(0, 120), machineId, state: "running", startedAt: now(), finishedAt: null, bytes: 0, totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : null, error: null };
    jobs.set(job.id, job);
    prune();
    return {
      id: job.id,
      progress(bytes) { job.bytes += bytes; },
      done() { if (job.state === "running") Object.assign(job, { state: "done", finishedAt: now() }); },
      fail(error) { if (job.state === "running") Object.assign(job, { state: "failed", finishedAt: now(), error: String(error?.message || error).slice(0, 300) }); },
    };
  }
  // Runs fn as a job; the job ends as done or failed with fn's outcome.
  async function run(details, fn) {
    const handle = start(details);
    try {
      const result = await fn(handle);
      handle.done();
      return result;
    } catch (error) {
      handle.fail(error);
      throw error;
    }
  }
  function list() {
    prune();
    return [...jobs.values()]
      .sort((a, b) => (b.state === "running") - (a.state === "running") || b.startedAt - a.startedAt)
      .map((j) => ({ ...j, elapsedMs: (j.finishedAt ?? now()) - j.startedAt, fraction: j.totalBytes ? Math.min(1, j.bytes / j.totalBytes) : null }));
  }
  return { start, run, list };
}

// Wraps an upload request so the bytes read are counted for a job. The
// returned stream carries the request's headers; errors (including a
// destroyed request) reach whoever reads it.
export function countedRequest(request, handle) {
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      handle.progress(chunk.length);
      callback(null, chunk);
    },
  });
  pipeline(request, counter, () => {});
  counter.headers = request.headers;
  return counter;
}

import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createJobs, countedRequest } from "../server/jobs.mjs";

test("jobs run, report progress and outcome, running first", async () => {
  let t = 1000;
  const jobs = createJobs({ now: () => t });
  const upload = jobs.start({ kind: "upload-iso", label: "debian.iso", totalBytes: 400 });
  upload.progress(100);
  t += 50;
  await jobs.run({ kind: "resize-disk", label: "system to 20 GiB", machineId: "m1" }, async () => { t += 20; });
  await assert.rejects(jobs.run({ kind: "clone", label: "web" }, async () => { throw new Error("No space left."); }), /No space/);
  const list = jobs.list();
  assert.deepEqual(list.map((j) => [j.kind, j.state]), [["upload-iso", "running"], ["clone", "failed"], ["resize-disk", "done"]]);
  assert.equal(list[0].fraction, 0.25);
  assert.equal(list[1].error, "No space left.");
  assert.equal(list[2].elapsedMs, 20);
  assert.throws(() => jobs.start({ kind: "rm-rf" }), /Unknown job kind/);
});

test("finished jobs are dropped after ten minutes; running ones stay", () => {
  let t = 0;
  const jobs = createJobs({ now: () => t });
  jobs.start({ kind: "clone", label: "a" }).done();
  jobs.start({ kind: "upload-iso", label: "b" });
  t += 11 * 60 * 1000;
  assert.deepEqual(jobs.list().map((j) => j.label), ["b"]);
});

test("a counted request passes every byte through and keeps the headers", async () => {
  const jobs = createJobs();
  const handle = jobs.start({ kind: "import-disk", label: "disk.vmdk", totalBytes: 10 });
  const request = Readable.from([Buffer.from("hello"), Buffer.from("world")]);
  request.headers = { "content-length": "10" };
  const counted = countedRequest(request, handle);
  assert.equal(counted.headers["content-length"], "10");
  let text = "";
  for await (const chunk of counted) text += chunk;
  assert.equal(text, "helloworld");
  assert.equal(jobs.list()[0].fraction, 1);
});

test("a destroyed request fails whoever is reading the counted stream", async () => {
  const jobs = createJobs();
  const handle = jobs.start({ kind: "upload-iso", label: "x" });
  const request = new Readable({ read() {} });
  request.headers = {};
  const counted = countedRequest(request, handle);
  setTimeout(() => request.destroy(new Error("Upload exceeded the 15-minute limit.")), 10);
  await assert.rejects((async () => { for await (const _ of counted); })(), /15-minute limit/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { MetricSampler } from "../server/resources.mjs";
import { chartPoints } from "../public/charts.js";
test("metric sampler keeps a bounded history of actual reader results", async () => {
  let value = 0;
  const sampler = new MetricSampler(
    async () => ({
      cpuPercent: value++,
      sampledAt: new Date(value * 2000).toISOString(),
    }),
    3,
  );
  for (let i = 0; i < 5; i++) await sampler.sample();
  assert.deepEqual(
    sampler.history.map((s) => s.cpuPercent),
    [2, 3, 4],
  );
  assert.equal(sampler.latest.cpuPercent, 4);
});
test("sampling errors retain prior samples without inventing replacements", async () => {
  let fail = false;
  const sampler = new MetricSampler(async () => {
    if (fail) throw new Error("fixture");
    return { cpuPercent: 10, sampledAt: "2026-11-13T00:00:00Z" };
  });
  await sampler.sample();
  fail = true;
  await sampler.sample();
  assert.equal(sampler.history.length, 1);
  assert.equal(sampler.latest.cpuPercent, 10);
  assert.match(sampler.error, /unavailable/);
});
test("chart coordinates use recorded timestamps and omit missing samples", () => {
  const samples = [
    { sampledAt: "2026-11-13T00:00:00Z", cpuPercent: 0 },
    { sampledAt: "2026-11-13T00:00:02Z", cpuPercent: null },
    { sampledAt: "2026-11-13T00:00:04Z", cpuPercent: 100 },
  ];
  assert.equal(chartPoints(samples.slice(0, 1), "cpu"), null);
  const chart = chartPoints(samples, "cpu");
  assert.equal(chart.count, 2);
  assert.equal(chart.points, "0.00,84.00 320.00,6.00");
});

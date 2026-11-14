import test from "node:test";
import assert from "node:assert/strict";
import { formatBuildTimestamp } from "../public/provenance.js";
test("build timestamp preserves source time while showing explicit local zone and seconds", () => {
  const raw = "2026-11-14T00:08:12.1756938Z";
  const result = formatBuildTimestamp(raw, { timeZone: "America/Toronto" });
  assert.equal(result.datetime, raw);
  assert.equal(result.display, "2026-11-13 19:08:12 America/Toronto (GMT-5)");
  assert.match(
    formatBuildTimestamp(raw, { timeZone: "UTC" }).display,
    /2026-11-14 00:08:12 UTC/,
  );
});
test("missing and invalid build dates stay unavailable instead of using the current clock", () => {
  for (const value of [
    null,
    undefined,
    "",
    "2026-11-13",
    "not-a-date",
    "2026-02-30T12:00:00Z",
    "2026-11-13T25:00:00Z",
  ])
    assert.equal(formatBuildTimestamp(value), null);
  assert.equal(
    formatBuildTimestamp("2026-11-13T12:00:00Z", { timeZone: "Invalid/Zone" }),
    null,
  );
});

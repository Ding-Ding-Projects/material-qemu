import test from "node:test";
import assert from "node:assert/strict";
import { redactPaths } from "../scripts/redact-paths.mjs";

test("local folder paths are removed from evidence text", () => {
  const data = "C:\\Users\\someone\\Documents\\Material QEMU VMs\\check";
  const text = JSON.stringify({ a: `${data}\\firmware\\x.fd`, b: "C:\\Users\\other\\file.txt", c: "C:/Users/third/x" });
  const out = redactPaths(text, { data, home: "C:\\Users\\someone" });
  assert.doesNotMatch(out, /someone|other|third/);
  assert.match(out, /<data>\\\\firmware\\\\x\.fd/);
  assert.match(out, /<home>/);
  assert.equal(redactPaths("plain text, no paths"), "plain text, no paths");
});

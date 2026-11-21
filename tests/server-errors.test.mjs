import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SERVER_ERRORS,
  SERVER_ERROR_PATTERNS,
  cantoneseServerError,
  localizeServerError,
} from "../public/server-errors.js";

const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server");

function serverMessages() {
  const plain = new Set();
  const templates = new Set();
  for (const file of readdirSync(serverDir).filter((f) => f.endsWith(".mjs"))) {
    const source = readFileSync(path.join(serverDir, file), "utf8");
    for (const m of source.matchAll(/(?:new Error|error:)\s*\(?\s*"((?:[^"\\]|\\.){6,})"/g)) plain.add(m[1]);
    for (const m of source.matchAll(/(?:new Error|error:)\s*\(?\s*`([^`]{6,})`/g)) templates.add(m[1]);
  }
  return { plain, templates };
}

test("every fixed server message has a Cantonese translation", () => {
  const { plain } = serverMessages();
  assert.ok(plain.size > 100, `expected the server's messages, found ${plain.size}`);
  const missing = [...plain].filter((message) => !Object.hasOwn(SERVER_ERRORS, message));
  assert.deepEqual(missing, []);
});

test("every templated server message has a Cantonese pattern", () => {
  const { templates } = serverMessages();
  const known = new Set(SERVER_ERROR_PATTERNS.map((p) => p.source));
  const missing = [...templates].filter((source) => !known.has(source));
  assert.deepEqual(missing, []);
});

test("translations carry Chinese text and keep the variable parts", () => {
  for (const [en, yue] of Object.entries(SERVER_ERRORS)) assert.match(yue, /[一-鿿]/, en);
  assert.equal(cantoneseServerError("A snapshot named nightly already exists."), "已有名為 nightly 的快照。");
  assert.equal(cantoneseServerError("Use at most 16 port forwards."), "最多使用 16 個端口轉送。");
  assert.equal(cantoneseServerError("qemu-system-x86_64: some raw QEMU output"), null);
});

test("localization follows the chosen language", () => {
  const en = (a) => a;
  const yue = (_a, b) => b;
  const both = (a, b) => `${a} · ${b}`;
  const message = "Machine is not running.";
  assert.equal(localizeServerError(message, en), message);
  assert.equal(localizeServerError(message, yue), "機器未有運行。");
  assert.equal(localizeServerError(message, both), "Machine is not running. · 機器未有運行。");
  assert.equal(localizeServerError("unexpected text", yue), "unexpected text");
});

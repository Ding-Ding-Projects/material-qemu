// Removes local folder paths from evidence text before it is committed. A path
// under the user's profile (which names the account) becomes "<home>", and the
// test data folder becomes "<data>", so only the part inside them remains.
// Usage as a module: redactPaths(text, { data }); or from the command line:
// node scripts/redact-paths.mjs <file>... (rewrites each file in place)
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function redactPaths(text, { data, home = os.homedir() } = {}) {
  let out = String(text);
  const variants = (p) => {
    const back = p.replace(/\//g, "\\"), fwd = p.replace(/\\/g, "/");
    return [back, back.replace(/\\/g, "\\\\"), fwd];
  };
  for (const [p, label] of [[data, "<data>"], [home, "<home>"]]) {
    if (!p) continue;
    for (const v of variants(p)) out = out.replace(new RegExp(escapeRe(v), "gi"), label);
  }
  // Any other profile path still names an account.
  return out.replace(/[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)[^\\/"\s]+/g, "<home>");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of process.argv.slice(2)) writeFileSync(file, redactPaths(readFileSync(file, "utf8"), { data: process.env.DATA_DIR }));
}

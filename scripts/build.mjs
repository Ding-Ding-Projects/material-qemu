import { mkdir, cp, writeFile, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
await rm('dist', { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const folder of ["server", "public", "node_modules"])
  await cp(folder, `dist/${folder}`, { recursive: true });
for (const file of ["package.json", "package-lock.json"])
  await cp(file, `dist/${file}`);
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const receipt = {
  version: JSON.parse(await readFile("package.json", "utf8")).version,
  source,
  dirty: Boolean(execFileSync('git',['status','--porcelain','--untracked-files=all'],{encoding:'utf8'}).trim()),
  builtAt: new Date().toISOString(),
  lockSha256: createHash("sha256")
    .update(await readFile("package-lock.json"))
    .digest("hex"),
  runtime: "node >=22",
  entrypoint: "server/index.mjs",
};
await writeFile("dist/build-receipt.json", JSON.stringify(receipt, null, 2));
console.log(
  `Runnable runtime staged in dist. Source: ${source}. Uncommitted source: ${receipt.dirty}. This is not an installer.`,
);

// Regenerates the prepared GitHub wiki pages in docs/wiki/pending from the
// current articles in docs/features, with a Home page, a sidebar and a manifest
// that records each source and page hash. Publishing waits until the wiki's
// first page exists (GitHub only creates the wiki repository then).
// Usage: node scripts/build-wiki.mjs [--check]
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const features = path.join(root, "docs", "features");
const out = path.join(root, "docs", "wiki", "pending");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const titleOf = (text, fallback) => (text.match(/^#\s+(.+)$/m)?.[1] || fallback).trim();

export function wikiPages() {
  const sources = readdirSync(features).filter((f) => f.endsWith(".md")).sort();
  const pageName = (file) => (file === "README.md" ? "feature-index" : file.replace(/\.md$/, ""));
  const pages = [];
  for (const file of sources) {
    const text = readFileSync(path.join(features, file), "utf8").replace(/\r\n/g, "\n");
    // Links between articles become wiki page links; other repository links point at GitHub.
    const body = text.replace(/\]\(([^)\s]+)\)/g, (m, target) => {
      if (/^[a-z]+:|^#/.test(target)) return m;
      const [p, hash] = target.split("#");
      if (/^[\w.-]+\.md$/.test(p)) return `](${pageName(p)}${hash ? "#" + hash : ""})`;
      const repoPath = path.posix.normalize(path.posix.join("docs/features", p));
      return `](https://github.com/Ding-Ding-Projects/material-qemu/blob/main/${repoPath}${hash ? "#" + hash : ""})`;
    });
    pages.push({ source: `docs/features/${file}`, sourceSha256: sha(text), page: `${pageName(file)}.md`, title: titleOf(text, pageName(file)), body });
  }
  const list = pages.map((p) => `- [${p.title}](${p.page.replace(/\.md$/, "")})`).join("\n");
  const home = `# Material QEMU guides\n\nMaterial QEMU runs QEMU virtual machines from a browser on hardware you own: on this computer, in VirtualBox or VMware, in Docker, from a USB drive or installed on a PC. These pages are generated from the articles in the repository's docs/features folder.\n\n${list}\n`;
  const sidebar = `[Home](Home)\n\n${list}\n`;
  return { pages, home, sidebar };
}

const check = process.argv.includes("--check");
const { pages, home, sidebar } = wikiPages();
const files = [["Home.md", home], ["_Sidebar.md", sidebar], ...pages.map((p) => [p.page, p.body])];
if (check) {
  const stale = files.filter(([name, text]) => !existsSync(path.join(out, name)) || readFileSync(path.join(out, name), "utf8").replace(/\r\n/g, "\n") !== text);
  if (stale.length) {
    console.error(`Stale wiki pages: ${stale.map(([n]) => n).join(", ")}. Run node scripts/build-wiki.mjs`);
    process.exit(1);
  }
  console.log(`${files.length} wiki pages are current.`);
} else {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const [name, text] of files) writeFileSync(path.join(out, name), text);
  let commit = "unknown";
  try { commit = execSync("git rev-parse HEAD", { cwd: root }).toString().trim(); } catch {}
  const manifest = {
    sourceCommit: commit,
    wikiRemote: "https://github.com/Ding-Ding-Projects/material-qemu.wiki.git",
    publicationState: "pending-first-page",
    pages: pages.map(({ source, sourceSha256, page, body }) => ({ source, sourceSha256, page, pageSha256: sha(body) })),
  };
  writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote ${files.length} wiki pages to docs/wiki/pending.`);
}

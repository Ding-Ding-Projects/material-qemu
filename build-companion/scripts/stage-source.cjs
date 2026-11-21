'use strict';
// Packs the complete source of the current commit into build/source.zip (with
// git archive, so only committed files are included) and records the commit.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const app = path.join(__dirname, '..');
const root = path.join(app, '..');
const out = path.join(app, 'build');
fs.mkdirSync(out, { recursive: true });
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
execFileSync('git', ['archive', '--format=zip', '-o', path.join(out, 'source.zip'), 'HEAD'], { cwd: root });
const version = process.env.VERSION || require(path.join(root, 'package.json')).version;
fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify({ commit, version, packedAt: new Date().toISOString() }, null, 2) + '\n');
fs.copyFileSync(path.join(root, 'node_modules/@fontsource-variable/roboto-flex/files/roboto-flex-latin-full-normal.woff2'), (fs.mkdirSync(path.join(app, 'renderer', 'fonts'), { recursive: true }), path.join(app, 'renderer', 'fonts', 'roboto-flex.woff2')));
console.log(`Packed ${commit} (${(fs.statSync(path.join(out, 'source.zip')).size / 1048576).toFixed(1)} MiB).`);

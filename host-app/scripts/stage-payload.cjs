'use strict';
// Copies the Material QEMU web service into host-app/payload with only its
// production dependencies, and the interface font into the renderer, so
// electron-builder can ship them as resources.
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const app = path.join(__dirname, '..');
const root = path.join(app, '..');
const payload = path.join(app, 'payload');
fs.rmSync(payload, { recursive: true, force: true });
fs.mkdirSync(payload, { recursive: true });
for (const dir of ['server', 'public']) fs.cpSync(path.join(root, dir), path.join(payload, dir), { recursive: true });
for (const file of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(root, file), path.join(payload, file));
execSync('npm ci --omit=dev --ignore-scripts --no-audit --no-fund', { cwd: payload, stdio: 'inherit' });
fs.mkdirSync(path.join(app, 'renderer', 'fonts'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/@fontsource-variable/roboto-flex/files/roboto-flex-latin-full-normal.woff2'), path.join(app, 'renderer', 'fonts', 'roboto-flex.woff2'));
console.log('Staged the web service into host-app/payload.');

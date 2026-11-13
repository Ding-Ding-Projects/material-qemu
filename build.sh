#!/bin/sh
set -eu
cd "$(dirname "$0")"
node --version
npm ci --ignore-scripts
npm run build
case " $* " in *" --container "*) docker build -t material-qemu:0.1.0 . ;; esac
case " $* " in *" --run "*) exec npm start ;; esac

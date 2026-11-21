#!/usr/bin/env bash
# Boot the appliance disk once under QEMU on a throwaway overlay (the shipped
# disk is never modified) and confirm the web service reports healthy.
# Usage: appliance/boot-check.sh <disk.qcow2> <log-dir>
set -euo pipefail
disk=$(readlink -f "$1")
logs=$2
mkdir -p "$logs"
overlay="$logs/boot-check-overlay.qcow2"
# A 64 GiB overlay also exercises the grow-to-fill service.
qemu-img create -f qcow2 -b "$disk" -F qcow2 "$overlay" 64G >/dev/null
accel=tcg
if [ -w /dev/kvm ]; then accel=kvm; fi
echo "Booting with accel=$accel"
qemu-system-x86_64 -machine q35,accel=$accel -m 3072 -smp 2 \
  -drive file="$overlay",if=virtio \
  -nic user,model=e1000,hostfwd=tcp:127.0.0.1:18080-:8080 \
  -serial file:"$logs/serial.log" -display none -daemonize -pidfile "$logs/qemu.pid"
deadline=$((SECONDS + 1500))
status=1
while [ $SECONDS -lt $deadline ]; do
  if grep -a -q 'MQ-FAILED' "$logs/serial.log" 2>/dev/null; then break; fi
  line=$(grep -a 'MQ-READY' "$logs/serial.log" 2>/dev/null | tail -n1 || true)
  if [ -n "$line" ]; then
    url=$(printf '%s' "$line" | sed -n 's/.* url=\([^ ]*\).*/\1/p')
    host=$(printf '%s' "$url" | sed 's#^[a-z]*://##; s#/.*##')
    if curl -fsS --max-time 10 -H "Host: $host" http://127.0.0.1:18080/health; then
      echo
      echo "Appliance reported $url and answered /health through the forwarded port."
      status=0
    fi
    break
  fi
  sleep 5
done
kill "$(cat "$logs/qemu.pid")" 2>/dev/null || true
rm -f "$overlay"
grep -a 'MQ-' "$logs/serial.log" || echo "No appliance report lines were written."
if [ $status -ne 0 ]; then echo "Appliance boot check failed." >&2; fi
exit $status

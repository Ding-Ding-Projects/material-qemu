#!/usr/bin/env bash
# Boot the appliance disk once under QEMU on a throwaway overlay (the shipped
# disk is never modified) and confirm the web service reports healthy.
# Usage: appliance/boot-check.sh <disk.qcow2> <log-dir>
set -euo pipefail
disk=$(readlink -f "$1")
mkdir -p "$2"
# Absolute, because QEMU changes to / when it daemonizes and writes the
# console picture relative to that.
logs=$(readlink -f "$2")
overlay="$logs/boot-check-overlay.qcow2"
# A 64 GiB overlay also exercises the grow-to-fill service.
qemu-img create -f qcow2 -b "$disk" -F qcow2 "$overlay" 64G >/dev/null
accel=tcg
if [ -w /dev/kvm ]; then accel=kvm; fi
echo "Booting with accel=$accel"
qemu-system-x86_64 -machine q35,accel=$accel -m 3072 -smp 2 \
  -drive file="$overlay",if=virtio \
  -nic user,model=e1000,hostfwd=tcp:127.0.0.1:18080-:8080 \
  -serial file:"$logs/serial.log" -display none -daemonize -pidfile "$logs/qemu.pid" \
  -qmp unix:"$logs/qmp.sock",server=on,wait=off
# Take a picture of the local console through QMP, so the check can read what
# a person in front of the machine sees.
screendump() {
  python3 - "$logs/qmp.sock" "$1" <<'PY'
import json, socket, sys
s = socket.socket(socket.AF_UNIX)
s.connect(sys.argv[1])
f = s.makefile("rw")
def cmd(c, **a):
    f.write(json.dumps({"execute": c, "arguments": a} if a else {"execute": c}) + "\n"); f.flush()
    while True:
        r = json.loads(f.readline())
        if "return" in r or "error" in r:
            return r
json.loads(f.readline())
cmd("qmp_capabilities")
r = cmd("screendump", filename=sys.argv[2], format="png")
if "error" in r:
    print("screendump failed:", r["error"].get("desc"), file=sys.stderr)
    sys.exit(1)
PY
}
# Read the console text with OCR, scaled up so the VGA font is easier to read.
console_text() {
  screendump "$1" || return 1
  if command -v convert >/dev/null; then
    convert "$1" -filter point -resize 300% -colorspace gray -negate "$1.ocr.png"
  else
    cp "$1" "$1.ocr.png"
  fi
  tesseract "$1.ocr.png" - 2>/dev/null || true
}
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
      # The console must show the address too. The login screen is redrawn
      # after the service reports ready, so allow it a little time.
      ip=$(grep -a 'MQ-BOOT' "$logs/serial.log" | tail -n1 | sed -n 's/.* ip=\([^ ]*\).*/\1/p')
      shown=0
      for attempt in 1 2 3 4 5 6; do
        sleep 10
        text=$(console_text "$logs/console.png" || true)
        printf '%s\n' "$text" > "$logs/console.txt"
        if printf '%s' "$text" | grep -q "IP address: *${ip//./\\.}"; then shown=1; break; fi
      done
      if [ $shown -eq 1 ]; then
        echo "The console shows IP address: $ip."
        status=0
      else
        echo "The console does not show IP address: $ip. Its text was:" >&2
        cat "$logs/console.txt" >&2
      fi
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

#!/usr/bin/env bash
# Boot the Raspberry Pi image once under QEMU's raspi3b machine (the closest
# Raspberry Pi model QEMU emulates), using the image's own 64-bit kernel and
# device tree, on a throwaway overlay. Confirms the service reports healthy.
# Usage: appliance/boot-check-rpi.sh <image.img> <log-dir>
set -euo pipefail
img=$(readlink -f "$1")
logs=$2
mkdir -p "$logs"
boot="$logs/boot"; mkdir -p "$boot"
loop=$(sudo losetup -rfP --show "$img")
mnt=$(mktemp -d)
sudo mount -o ro "${loop}p1" "$mnt"
cp "$mnt/kernel8.img" "$mnt/bcm2710-rpi-3-b-plus.dtb" "$boot/"
sudo umount "$mnt"; sudo losetup -d "$loop"; rmdir "$mnt"

overlay="$logs/rpi-overlay.qcow2"
qemu-img create -f qcow2 -b "$img" -F raw "$overlay" 8G >/dev/null
qemu-system-aarch64 -M raspi3b -m 1G -smp 4 \
  -kernel "$boot/kernel8.img" -dtb "$boot/bcm2710-rpi-3-b-plus.dtb" \
  -append "rw console=ttyAMA0,115200 root=/dev/mmcblk0p2 rootwait rootfstype=ext4 dwc_otg.lpm_enable=0" \
  -drive file="$overlay",if=sd,format=qcow2 \
  -device usb-net,netdev=net0 -netdev user,id=net0,hostfwd=tcp:127.0.0.1:18081-:8080 \
  -serial file:"$logs/rpi-serial.log" -display none -daemonize -pidfile "$logs/rpi-qemu.pid"
deadline=$((SECONDS + 5400))
status=1
while [ $SECONDS -lt $deadline ]; do
  if grep -a -q 'MQ-FAILED' "$logs/rpi-serial.log" 2>/dev/null; then break; fi
  line=$(grep -a 'MQ-READY' "$logs/rpi-serial.log" 2>/dev/null | tail -n1 || true)
  if [ -n "$line" ]; then
    url=$(printf '%s' "$line" | sed -n 's/.* url=\([^ ]*\).*/\1/p')
    host=$(printf '%s' "$url" | sed 's#^[a-z]*://##; s#/.*##')
    if curl -fsS --max-time 30 -H "Host: $host" http://127.0.0.1:18081/health; then
      echo
      echo "Raspberry Pi image reported $url and answered /health under raspi3b emulation."
      status=0
    fi
    break
  fi
  sleep 15
done
kill "$(cat "$logs/rpi-qemu.pid")" 2>/dev/null || true
rm -f "$overlay"
grep -a 'MQ-' "$logs/rpi-serial.log" || { echo "No appliance report lines were written. Last console lines:"; tail -n 40 "$logs/rpi-serial.log" || true; }
[ $status -eq 0 ] || echo "Raspberry Pi boot check failed." >&2
exit $status

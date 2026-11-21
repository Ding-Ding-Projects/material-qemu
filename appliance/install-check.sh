#!/usr/bin/env bash
# Install the appliance from the installer ISO onto a blank 16 GiB disk under
# QEMU (automatic mode, booted with the ISO's own kernel and initramfs), then
# boot the installed disk with boot-check.sh and confirm the service answers.
# Usage: appliance/install-check.sh <installer.iso> <log-dir>
set -euo pipefail
iso=$(readlink -f "$1")
logs=$(mkdir -p "$2" && cd "$2" && pwd)
here=$(cd "$(dirname "$0")" && pwd)
target="$logs/installed.qcow2"
rm -f "$target" "$logs/install-serial.log"
qemu-img create -q -f qcow2 "$target" 16G
xorriso -osirrox on -indev "$iso" -extract /boot/vmlinuz "$logs/vmlinuz" -extract /boot/initrd.img "$logs/initrd.img" >/dev/null 2>&1
accel=tcg
if [ -w /dev/kvm ]; then accel=kvm; fi
echo "Installing with accel=$accel"
timeout 1200 qemu-system-x86_64 -machine q35,accel=$accel -m 2048 -smp 2 \
  -kernel "$logs/vmlinuz" -initrd "$logs/initrd.img" \
  -append "mq.install=auto console=ttyS0,115200 console=tty0" \
  -cdrom "$iso" -drive file="$target",if=virtio \
  -serial file:"$logs/install-serial.log" -display none -no-reboot || true
grep -a 'MQ-INSTALL' "$logs/install-serial.log" || true
if ! grep -a -q 'MQ-INSTALLED' "$logs/install-serial.log"; then
  echo "The installer did not report a finished installation." >&2
  exit 1
fi
echo "Installed. Booting the installed disk."
bash "$here/boot-check.sh" "$target" "$logs/installed-boot"
rm -f "$target" "$logs/vmlinuz" "$logs/initrd.img"

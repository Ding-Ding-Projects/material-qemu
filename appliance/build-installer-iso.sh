#!/usr/bin/env bash
# Build the bare-metal installer ISO from a finished appliance disk.
#
# Usage: appliance/build-installer-iso.sh <appliance.qcow2> <usb.img.gz> <usb.img.json> <version> <out.iso>
#
# The appliance's own Debian kernel boots an installer initramfs built in a
# throwaway overlay of the appliance disk (the shipped disk is not changed).
# The ISO carries the same compressed disk image as the USB release; the
# installer (installer/mq-install) writes it to an internal disk and checks it.
# grub-mkrescue makes the ISO hybrid: it boots on BIOS and UEFI from a DVD or a
# USB drive written with Rufus, the deploy assistant or dd.
set -euo pipefail

disk=$(readlink -f "$1")
payload=$(readlink -f "$2")
record=$(readlink -f "$3")
version=$4
out=$5
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
mnt="$work/mnt"
nbd=/dev/nbd1
connected=0
cleanup() {
  set +e
  for m in "$mnt/dev/pts" "$mnt/dev" "$mnt/proc" "$mnt/sys" "$mnt/run" "$mnt"; do
    mountpoint -q "$m" && sudo umount "$m"
  done
  [ "$connected" = 1 ] && sudo qemu-nbd --disconnect "$nbd" >/dev/null 2>&1
  sudo rm -rf "$work"
}
trap cleanup EXIT

echo "::group::Build the installer initramfs in an overlay"
qemu-img create -q -f qcow2 -b "$disk" -F qcow2 "$work/overlay.qcow2"
sudo modprobe nbd max_part=16
sudo qemu-nbd --connect="$nbd" "$work/overlay.qcow2"; connected=1
for _ in $(seq 1 20); do [ -e "${nbd}p1" ] && break; sleep 0.5; done
mkdir -p "$mnt"
sudo mount "${nbd}p1" "$mnt"
for d in dev dev/pts proc sys run; do sudo mount --bind "/$d" "$mnt/$d"; done
sudo install -D -m 0755 "$here/installer/mq-install" "$mnt/opt/mq-installer/mq-install"
sudo chroot "$mnt" /bin/bash -euxc '
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends busybox initramfs-tools udev
  conf=/tmp/mq-initramfs
  rm -rf "$conf"
  cp -a /etc/initramfs-tools "$conf"
  sed -i "s/^MODULES=.*/MODULES=most/; s/^BUSYBOX=.*/BUSYBOX=y/" "$conf/initramfs.conf"
  grep -q "^BUSYBOX=" "$conf/initramfs.conf" || echo BUSYBOX=y >> "$conf/initramfs.conf"
  mkdir -p "$conf/hooks" "$conf/scripts/init-premount"
  cat > "$conf/hooks/mq-installer" <<"HOOK"
#!/bin/sh
PREREQ=""
prereqs() { echo "$PREREQ"; }
case "$1" in prereqs) prereqs; exit 0 ;; esac
. /usr/share/initramfs-tools/hook-functions
manual_add_modules isofs sr_mod cdrom usb_storage uas sd_mod ahci nvme virtio_blk virtio_scsi virtio_pci xhci_pci ehci_pci
copy_file script /opt/mq-installer/mq-install /usr/sbin/mq-install
HOOK
  cat > "$conf/scripts/init-premount/mq-installer" <<"PREMOUNT"
#!/bin/sh
PREREQ="udev"
prereqs() { echo "$PREREQ"; }
case "$1" in prereqs) prereqs; exit 0 ;; esac
grep -q "mq.install=" /proc/cmdline || exit 0
exec /usr/sbin/mq-install
PREMOUNT
  chmod 0755 "$conf/hooks/mq-installer" "$conf/scripts/init-premount/mq-installer"
  kver=$(ls /lib/modules | sort -V | tail -n1)
  mkinitramfs -d "$conf" -o /tmp/mq-installer-initrd.img "$kver"
  cp "/boot/vmlinuz-$kver" /tmp/mq-installer-vmlinuz
  ls -l /tmp/mq-installer-initrd.img /tmp/mq-installer-vmlinuz
'
mkdir -p "$work/iso/boot/grub"
sudo cp "$mnt/tmp/mq-installer-vmlinuz" "$work/iso/boot/vmlinuz"
sudo cp "$mnt/tmp/mq-installer-initrd.img" "$work/iso/boot/initrd.img"
sudo chown "$(id -u):$(id -g)" "$work/iso/boot/vmlinuz" "$work/iso/boot/initrd.img"
echo "::endgroup::"

echo "::group::Assemble the hybrid ISO"
cp "$payload" "$work/iso/material-qemu.img.gz"
cp "$record" "$work/iso/material-qemu.img.json"
printf '%s\n' "${version#v}" > "$work/iso/version"
cat > "$work/iso/boot/grub/grub.cfg" <<'GRUB'
set timeout=15
set default=0
insmod all_video
menuentry "Install Material QEMU on this computer (asks before writing to a disk)" {
  linux /boot/vmlinuz mq.install=ask console=ttyS0,115200 console=tty0 quiet
  initrd /boot/initrd.img
}
menuentry "Install automatically to the only blank disk" {
  linux /boot/vmlinuz mq.install=auto console=ttyS0,115200 console=tty0 quiet
  initrd /boot/initrd.img
}
menuentry "Restart" {
  reboot
}
GRUB
grub-mkrescue -o "$out" "$work/iso" -- -volid MQ_INSTALLER
ls -l "$out"
echo "::endgroup::"

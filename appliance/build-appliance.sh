#!/usr/bin/env bash
# Build the Material QEMU appliance disk (8 GiB, grows to fill its boot disk)
# on an x86_64 Ubuntu host. The workflow turns it into the OVA and the USB image.
#
# Usage: appliance/build-appliance.sh <image-archive.tar.gz> <image-ref> <version> <output-dir>
#
# The appliance is a Debian 13 base with Docker. On first boot it loads the
# bundled container image (no registry access needed), starts the service on
# port 8080 and reports its LAN URL on the first serial port and the console.
# The disk is attached with qemu-nbd and customized in a native chroot that
# uses the host's network and DNS.
set -euo pipefail

archive=$(readlink -f "$1")
image_ref=$2
version=$3
out=$4
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
mnt="$work/mnt"
nbd=/dev/nbd0
connected=0
unmount_all() {
  for m in "$mnt/boot/efi" "$mnt/dev/pts" "$mnt/dev" "$mnt/proc" "$mnt/sys" "$mnt/run" "$mnt"; do
    mountpoint -q "$m" && sudo umount "$m"
  done
  return 0
}
cleanup() {
  set +e
  unmount_all
  [ "$connected" = 1 ] && sudo qemu-nbd --disconnect "$nbd" >/dev/null 2>&1
  sudo rm -rf "$work"
}
trap cleanup EXIT

base_url=https://cloud.debian.org/images/cloud/trixie/latest
base_name=debian-13-generic-amd64.qcow2

echo "::group::Download and verify the Debian base image"
curl -fsSL --retry 3 -o "$work/$base_name" "$base_url/$base_name"
curl -fsSL --retry 3 -o "$work/SHA512SUMS" "$base_url/SHA512SUMS"
(cd "$work" && grep " $base_name\$" SHA512SUMS | sha512sum -c -)
mv "$work/$base_name" "$work/disk.qcow2"
echo "::endgroup::"

echo "::group::Expand the root partition to 8 GiB in place"
# Debian cloud images put the root partition (1) last on the disk, after the
# BIOS boot (14) and EFI (15) partitions, so it grows without renumbering.
qemu-img resize "$work/disk.qcow2" 8G
sudo modprobe nbd max_part=16
sudo qemu-nbd --connect="$nbd" "$work/disk.qcow2"; connected=1
for _ in $(seq 1 20); do [ -e "${nbd}p1" ] && break; sleep 0.5; done
sudo sgdisk -e "$nbd"
sudo growpart "$nbd" 1
sudo e2fsck -fy "${nbd}p1"
sudo resize2fs "${nbd}p1"
sudo lsblk "$nbd"
echo "::endgroup::"

echo "::group::Install Docker and the Material QEMU services"
mkdir -p "$mnt"
sudo mount "${nbd}p1" "$mnt"
sudo mount "${nbd}p15" "$mnt/boot/efi"
for d in dev dev/pts proc sys run; do sudo mount --bind "/$d" "$mnt/$d"; done
# Debian links resolv.conf into /run (bound from the host above), so the
# host's resolver answers inside the chroot.
sudo chroot "$mnt" /bin/bash -euxc '
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends docker.io open-vm-tools curl cloud-guest-utils
  apt-get purge -y openssh-server || true
  apt-get autoremove -y
  apt-get clean
  rm -rf /var/lib/apt/lists/*
'
sudo install -d -m 0755 "$mnt/opt/material-qemu" "$mnt/etc/material-qemu"
for f in "$here"/rootfs/usr/local/sbin/*; do sudo install -m 0755 "$f" "$mnt/usr/local/sbin/"; done
for f in "$here"/rootfs/etc/systemd/system/*; do sudo install -m 0644 "$f" "$mnt/etc/systemd/system/"; done
for f in "$here"/rootfs/etc/systemd/network/*; do sudo install -m 0644 "$f" "$mnt/etc/systemd/network/"; done
sudo install -m 0644 "$archive" "$mnt/opt/material-qemu/image.tar.gz"
printf 'MQ_IMAGE=%s\n' "$image_ref" | sudo tee "$mnt/opt/material-qemu/image.env" >/dev/null
printf '%s\n' "$version" | sudo tee "$mnt/opt/material-qemu/version" >/dev/null
sudo chroot "$mnt" /bin/bash -euxc '
  rm -f /etc/network/interfaces.d/*cloud* /etc/netplan/*.yaml
  touch /etc/cloud/cloud-init.disabled
  systemctl enable systemd-networkd systemd-networkd-wait-online docker material-qemu-growroot material-qemu-load material-qemu material-qemu-report
  echo material-qemu > /etc/hostname
  printf "127.0.0.1 localhost\n127.0.1.1 material-qemu\n" > /etc/hosts
  ln -sf /usr/share/zoneinfo/UTC /etc/localtime
  passwd -l root
  truncate -s 0 /etc/machine-id
  rm -f /var/lib/dbus/machine-id
'
sudo df -h "$mnt"
unmount_all
sudo qemu-nbd --disconnect "$nbd"; connected=0
echo "::endgroup::"

mkdir -p "$out"
mv "$work/disk.qcow2" "$out/material-qemu-appliance.qcow2"
echo "Appliance disk written to $out/material-qemu-appliance.qcow2"

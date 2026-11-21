#!/usr/bin/env bash
# Build the Raspberry Pi (arm64) image on a native arm64 Ubuntu host.
#
# Usage: appliance/build-rpi.sh <image-archive.tar.gz> <image-ref> <version> <output-dir>
#
# Base: Raspberry Pi OS Lite (64-bit), verified against its published SHA-256.
# The image boots on Raspberry Pi 4 and 5, expands to fill the card on first
# boot (Raspberry Pi OS's own resize), loads the bundled container image and
# shows the Material QEMU address on the HDMI console.
set -euo pipefail

archive=$(readlink -f "$1")
image_ref=$2
version=$3
out=$4
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
mnt="$work/mnt"
loop=""
cleanup() {
  set +e
  for m in "$mnt/boot/firmware" "$mnt/dev/pts" "$mnt/dev" "$mnt/proc" "$mnt/sys" "$mnt/run" "$mnt"; do
    mountpoint -q "$m" && sudo umount -l "$m"
  done
  [ -n "$loop" ] && sudo losetup -d "$loop"
  sudo rm -rf "$work"
}
trap cleanup EXIT

echo "::group::Download and verify Raspberry Pi OS Lite (64-bit)"
url=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://downloads.raspberrypi.com/raspios_lite_arm64_latest)
echo "Base image: $url"
curl -fsSL --retry 3 -o "$work/base.img.xz" "$url"
expected=$(curl -fsSL --retry 3 "$url.sha256" | awk '{print $1}')
echo "$expected  $work/base.img.xz" | sha256sum -c -
xz -d -T0 "$work/base.img.xz"
echo "$url" > "$work/base-url.txt"
echo "::endgroup::"

echo "::group::Make room for Docker and the container image"
truncate -s 6G "$work/base.img"
loop=$(sudo losetup -fP --show "$work/base.img")
sudo growpart "$loop" 2
sudo e2fsck -fy "${loop}p2"
sudo resize2fs "${loop}p2"
mkdir -p "$mnt"
sudo mount "${loop}p2" "$mnt"
sudo mount "${loop}p1" "$mnt/boot/firmware"
for d in dev dev/pts proc sys run; do sudo mount --bind "/$d" "$mnt/$d"; done
echo "::endgroup::"

echo "::group::Install Docker and the Material QEMU services"
# Use the host's resolver inside the chroot, then put the image's own file back.
sudo cp -a "$mnt/etc/resolv.conf" "$work/resolv.conf.orig" 2>/dev/null || sudo touch "$work/resolv.conf.orig"
sudo cp --remove-destination -L /etc/resolv.conf "$mnt/etc/resolv.conf"
sudo chroot "$mnt" /bin/bash -euxc '
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends docker.io iptables curl
  # Newer Debian releases ship the CLI separately; install it when the package exists.
  if apt-cache show docker-cli >/dev/null 2>&1; then apt-get install -y --no-install-recommends docker-cli; fi
  test -x /usr/bin/docker
  apt-get clean
  rm -rf /var/lib/apt/lists/*
'
sudo install -d -m 0755 "$mnt/opt/material-qemu" "$mnt/etc/material-qemu"
sudo install -m 0755 "$here/rootfs/usr/local/sbin/material-qemu-env" "$here/rootfs/usr/local/sbin/material-qemu-report" "$mnt/usr/local/sbin/"
sudo install -m 0644 "$here/rootfs/etc/systemd/system/material-qemu-load.service" "$here/rootfs/etc/systemd/system/material-qemu.service" "$here/rootfs/etc/systemd/system/material-qemu-report.service" "$mnt/etc/systemd/system/"
sudo install -m 0644 "$archive" "$mnt/opt/material-qemu/image.tar.gz"
printf 'MQ_IMAGE=%s\n' "$image_ref" | sudo tee "$mnt/opt/material-qemu/image.env" >/dev/null
printf '%s\n' "$version" | sudo tee "$mnt/opt/material-qemu/version" >/dev/null
sudo chroot "$mnt" /bin/bash -euxc '
  systemctl enable docker material-qemu-load material-qemu material-qemu-report
  # No interactive first-boot user wizard and no SSH: this is an appliance.
  systemctl disable userconfig.service 2>/dev/null || true
  systemctl disable ssh.service sshswitch.service 2>/dev/null || true
  echo material-qemu > /etc/hostname
  sed -i "s/raspberrypi/material-qemu/g" /etc/hosts
  passwd -l root
  truncate -s 0 /etc/machine-id
'
sudo cp -a --remove-destination "$work/resolv.conf.orig" "$mnt/etc/resolv.conf"
echo "::endgroup::"

cleanup_mounts() {
  for m in "$mnt/boot/firmware" "$mnt/dev/pts" "$mnt/dev" "$mnt/proc" "$mnt/sys" "$mnt/run" "$mnt"; do
    mountpoint -q "$m" && sudo umount "$m"
  done
  sudo losetup -d "$loop"; loop=""
}
cleanup_mounts

mkdir -p "$out"
mv "$work/base.img" "$out/material-qemu-rpi.img"
cp "$work/base-url.txt" "$out/rpi-base-url.txt"
echo "Raspberry Pi image written to $out/material-qemu-rpi.img"

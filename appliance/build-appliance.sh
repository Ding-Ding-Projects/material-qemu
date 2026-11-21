#!/usr/bin/env bash
# Build the Material QEMU appliance disk (8 GiB, grows to fill its boot disk)
# on an Ubuntu host. The workflow turns it into the OVA and the USB image.
#
# Usage: appliance/build-appliance.sh <image-archive.tar.gz> <image-ref> <version> <output-dir>
#
# The appliance is a Debian 13 base with Docker. On first boot it loads the
# bundled container image (no registry access needed), starts the service on
# port 8080 and reports its LAN URL on the first serial port and the console.
set -euo pipefail

archive=$1
image_ref=$2
version=$3
out=$4
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

base_url=https://cloud.debian.org/images/cloud/trixie/latest
base_name=debian-13-generic-amd64.qcow2

echo "::group::Download and verify the Debian base image"
curl -fsSL --retry 3 -o "$work/$base_name" "$base_url/$base_name"
curl -fsSL --retry 3 -o "$work/SHA512SUMS" "$base_url/SHA512SUMS"
(cd "$work" && grep " $base_name\$" SHA512SUMS | sha512sum -c -)
echo "::endgroup::"

echo "::group::Expand the root partition to 8 GiB in place"
# Debian cloud images put the root partition (1) last on the disk, after the
# BIOS boot (14) and EFI (15) partitions, so it can grow to the end of the
# disk without renumbering anything.
mv "$work/$base_name" "$work/disk.qcow2"
qemu-img resize "$work/disk.qcow2" 8G
sudo modprobe nbd max_part=16
nbd=/dev/nbd0
sudo qemu-nbd --connect="$nbd" "$work/disk.qcow2"
trap 'sudo qemu-nbd --disconnect "$nbd" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
for _ in $(seq 1 20); do [ -e "${nbd}p1" ] && break; sleep 0.5; done
sudo sgdisk -e "$nbd"
sudo growpart "$nbd" 1
sudo e2fsck -fy "${nbd}p1"
sudo resize2fs "${nbd}p1"
sudo lsblk "$nbd"
sudo qemu-nbd --disconnect "$nbd"
trap 'rm -rf "$work"' EXIT
echo "::endgroup::"

echo "::group::Prepare guest files"
stage="$work/rootfs"
cp -r "$here/rootfs" "$stage"
chmod 0755 "$stage/usr/local/sbin/"*
chmod 0644 "$stage/etc/systemd/system/"* "$stage/etc/systemd/network/"*
mkdir -p "$stage/opt/material-qemu"
cp "$archive" "$stage/opt/material-qemu/image.tar.gz"
printf 'MQ_IMAGE=%s\n' "$image_ref" > "$stage/opt/material-qemu/image.env"
printf '%s\n' "$version" > "$stage/opt/material-qemu/version"
(cd "$stage" && find . -type f | sort > "$work/files.txt")
tar -C "$stage" -cf "$work/rootfs.tar" --owner=0 --group=0 --no-recursion -T "$work/files.txt"
echo "::endgroup::"

echo "::group::Customize the guest"
virt-customize -a "$work/disk.qcow2" --network \
  --run-command 'mkdir -p /opt/material-qemu /etc/material-qemu' \
  --install docker.io,open-vm-tools,curl,cloud-guest-utils \
  --run-command 'apt-get purge -y openssh-server || true' \
  --tar-in "$work/rootfs.tar:/" \
  --run-command 'rm -f /etc/network/interfaces.d/*cloud* /etc/netplan/*.yaml || true' \
  --run-command 'touch /etc/cloud/cloud-init.disabled' \
  --run-command 'systemctl enable systemd-networkd systemd-networkd-wait-online docker material-qemu-growroot material-qemu-load material-qemu material-qemu-report' \
  --hostname material-qemu \
  --timezone UTC \
  --root-password disabled \
  --run-command 'apt-get clean && rm -rf /var/lib/apt/lists/*' \
  --run-command 'truncate -s 0 /etc/machine-id && rm -f /var/lib/dbus/machine-id'
echo "::endgroup::"

mkdir -p "$out"
mv "$work/disk.qcow2" "$out/material-qemu-appliance.qcow2"
echo "Appliance disk written to $out/material-qemu-appliance.qcow2"

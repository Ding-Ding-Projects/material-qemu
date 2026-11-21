#!/usr/bin/env bash
# Installs Material QEMU from the installer ISO into a new VirtualBox VM the way a
# person would on a PC, taking a screenshot of the VM screen at each step.
#
# Usage: scripts/virtualbox-install-walkthrough.sh <installer.iso> <out-dir> [vm-name] [bios|efi]
#
# The VM gets an empty 20 GiB disk, the ISO in its DVD drive and a bridged
# network adapter. Keys are typed with VBoxManage, the DVD is removed after the
# install, and the VM restarts into the installed system. The VM is kept so the
# installed appliance can be opened; delete it with VBoxManage unregistervm --delete.
set -euo pipefail
iso=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
out=$2
name=${3:-mq-install-test}
firmware=${4:-bios}
vbox=${VBOXMANAGE:-"/c/Program Files/Oracle/VirtualBox/VBoxManage.exe"}
mkdir -p "$out"
out=$(cd "$out" && pwd)
base="$HOME/Documents/Material QEMU VMs/virtualbox"
serial="$out/serial.log"
n=0
win() { cygpath -w "$1" 2>/dev/null || printf '%s' "$1"; }
shot() { # slug title
  n=$((n + 1))
  file=$(printf '%02d-%s.png' "$n" "$1")
  "$vbox" controlvm "$name" screenshotpng "$(win "$out/$file")"
  printf '%s\t%s\n' "$file" "$2" >> "$out/steps.tsv"
  echo "saved $file - $2"
}
wait_serial() { # pattern seconds
  local deadline=$((SECONDS + $2))
  while [ $SECONDS -lt $deadline ]; do
    grep -a -q "$1" "$serial" 2>/dev/null && return 0
    sleep 3
  done
  echo "timed out waiting for $1" >&2
  return 1
}
type_line() {
  [ -n "$1" ] && "$vbox" controlvm "$name" keyboardputstring "$1"
  "$vbox" controlvm "$name" keyboardputscancode 1c 9c
}

rm -f "$out/steps.tsv" "$out"/*.png "$serial"
adapter=$("$vbox" list bridgedifs | sed -n 's/^Name: *//p' | grep -i -m1 'ethernet' || "$vbox" list bridgedifs | sed -n 's/^Name: *//p' | head -n1)
"$vbox" createvm --name "$name" --ostype Debian_64 --basefolder "$(win "$base")" --register >/dev/null
"$vbox" modifyvm "$name" --memory 4096 --cpus 2 --firmware "$firmware" --nested-hw-virt on \
  --nic1 bridged --bridgeadapter1 "$adapter" --nictype1 82540EM \
  --uart1 0x3F8 4 --uartmode1 file "$(win "$serial")" --boot1 dvd --boot2 disk --boot3 none --boot4 none \
  --graphicscontroller vmsvga --vram 16
disk="$base/$name/$name.vdi"
"$vbox" createmedium disk --filename "$(win "$disk")" --size 20480 --format VDI >/dev/null
"$vbox" storagectl "$name" --name SATA --add sata --controller IntelAhci --portcount 2
"$vbox" storageattach "$name" --storagectl SATA --port 0 --device 0 --type hdd --medium "$(win "$disk")"
"$vbox" storageattach "$name" --storagectl SATA --port 1 --device 0 --type dvddrive --medium "$(win "$iso")"
"$vbox" startvm "$name" --type headless >/dev/null

sleep 8
shot boot-menu "The installer's boot menu; the first entry starts after 15 seconds"
wait_serial 'Disks that can hold it' 300
sleep 4
shot disk-list "The installer lists the internal disks that can hold Material QEMU"
type_line sda
sleep 3
shot writing "The disk name is typed in and writing starts"
wait_serial 'Check passed' 900
sleep 2
shot verified "The written disk is read back and matches the release's SHA-256"
wait_serial 'MQ-INSTALLED' 60
sleep 2
shot installed "Installed: remove the installer and press Enter to restart"
"$vbox" storageattach "$name" --storagectl SATA --port 1 --device 0 --type dvddrive --medium emptydrive --forceunmount
type_line ""
sleep 20
shot first-boot "The PC restarts from its own disk into Material QEMU"
wait_serial 'MQ-READY' 900
sleep 5
shot ready "The console shows the address to open"
url=$(grep -a 'MQ-READY' "$serial" | tail -n1 | sed -n 's/.* url=\([^ ]*\).*/\1/p' | tr -d '\r')
echo "url=$url" | tee "$out/url.txt"

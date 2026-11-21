# Hosting with the deploy assistant

The deploy assistant (`material-qemu-deploy-<version>-portable.exe`, one portable Windows file) runs Material QEMU outside your Windows session in four ways:

| Target | What it uses | Result |
| --- | --- | --- |
| VirtualBox | `material-qemu-appliance-<version>.ova` | A VM with its own LAN address |
| VMware Workstation | the same OVA | A VM with its own LAN address |
| Docker on this computer | `ghcr.io/ding-ding-projects/material-qemu:<version>` | A container on a port of this computer's LAN address |
| USB drive | `material-qemu-usb-x86_64-<version>.img.gz` | A spare Intel or AMD PC that boots straight into Material QEMU |

The interface is available in English, Cantonese, or both side by side (Language selector in the side bar). Animations can be turned off there too, and they also follow the system's reduced-motion setting.

## Deploying to VirtualBox or VMware

1. The assistant detects VirtualBox (`VBoxManage.exe`) and VMware Workstation (`vmrun.exe` plus `OVFTool\ovftool.exe`) in their standard install folders. A hypervisor that is missing or incomplete is shown disabled with the reason.
2. Choose the latest release (downloaded once, cached, and checked against its published SHA-256) or a local `.ova` file.
3. Name the instance and set CPUs, memory and, for VirtualBox, the network adapter to bridge. Nested virtualization is on by default so QEMU guests can use hardware acceleration when the host allows it.
4. Select **Deploy**. The assistant imports the OVA, switches the network adapter to bridged mode, attaches the first serial port to a log file, starts the VM headless, waits for the appliance to report its LAN address, then checks `/health` at that address from this computer.

The appliance disk is 64 GiB in the VM and grows its root filesystem to fill it on first boot. VM files are stored under `Documents\Material QEMU VMs`.

### How the address is found

On every boot the appliance reads the address its network assigned, sets `PUBLIC_ORIGIN` to `http://<address>:8080`, starts the container and, once `/health` answers, writes one line to its first serial port:

```
MQ-READY version=<version> url=http://<address>:8080/ setup=<code or none>
```

The assistant reads that line from the serial log file. The same address is shown on the VM console login screen, so a manually imported OVA is usable without the assistant. To pin a different origin (for example a DNS name), write it to `/etc/material-qemu/public-origin` inside the appliance.

### VMware bridged networking

VMware Workstation bridges every VM through its `VMnet0` network, which by default picks a host adapter automatically. On a computer that also has VirtualBox, it can pick the VirtualBox host-only adapter, where no router answers DHCP; the appliance then reports `MQ-FAILED reason=no-lan-address`. Fix it once in VMware: **Edit → Virtual Network Editor → Change Settings → VMnet0 → Bridged to:** your real Ethernet or Wi-Fi adapter. This affects every VMware VM that uses bridged networking.

## Deploying to Docker on this computer

Pick **Docker on this computer**, choose which of this computer's LAN addresses to use and a port (default 8080). The assistant pulls the release's container image, creates a container named `material-qemu-<name>` with a data volume `material-qemu-<name>-data`, sets `PUBLIC_ORIGIN` to `http://<address>:<port>`, starts it, waits for `/health`. Ports already used by this computer or by another instance are refused before anything is created.

Docker Desktop's engine must be running. If it is installed but stopped, the Docker card says so and stays disabled.

## Flashing a USB drive or SD card

The **Flash** page writes a ready-to-boot image:

- **PC from a USB drive**: the x86_64 appliance (BIOS or UEFI). Any drive of 8 GB or more; the system grows to fill it on first boot.

Only disks Windows reports as removable USB or SD, and that do not hold the running system, are listed; nothing is preselected. Disks over 512 GB get an extra warning that they may be backup drives. Writing uses the same two-key slider gate as Remove and names the exact disk and size.

Writing raw disks needs administrator rights, so Windows shows its administrator approval prompt. Declining writes nothing. The writer (`flash-writer.ps1`, shipped beside the app) re-checks the disk, takes it offline, writes the decompressed image, then reads the written range back and compares its SHA-256 with the release's recorded hash before reporting success.

After flashing, boot the device with a network cable. The address appears on its screen after a few minutes.

## Instance manager

The **Instances** page lists only machines and containers the assistant created, with target, version, live health and link. Start, stop, restart, open and copy link act on that one instance. Health is checked when the page opens or on **Refresh**; nothing is reported healthy without a fresh check.

**Remove** uses the destructive-action super confirmation: two independent keys unlock a full-range slider, and only a completed slider powers off and deletes the VM and its disk files, or the container and its data volume (including every QEMU guest stored inside). **Emergency exit** or Escape cancels with nothing changed.

If the saved instance list is damaged, the assistant keeps the unreadable file aside, starts with an empty list, and says so in a banner. Virtual machines and containers are not touched.

## Failure handling

A failed step opens a full-screen failure view that stays until dismissed. It shows the failing command line, exit code, elapsed time and the last lines of real output. A failure before the VM starts leaves any imported machine listed under Instances so it can be removed.

## Security notes

- Every hypervisor and Docker command runs with an argument array, never a shell string. Instance names are limited to letters, digits, dots, dashes and underscores; Docker removal only touches containers named `material-qemu-…`.
- The appliance images have no SSH server and a locked root account. Their only network service is Material QEMU on port 8080, reachable on your LAN. The assistant never publishes anything to the internet.
- The portable exe and the images are unsigned. Windows may show an unknown-publisher warning.
- The first account created on a new instance becomes its owner, so open the link and set it up right after deploying, before anyone else on your network does.

## Known limits

- Plain HTTP on a LAN address is not a secure browser context, so passkey sign-in needs HTTPS in front of the service; password sign-in works.
- QEMU guests use software emulation unless nested virtualization reaches the VM. When the appliance sees `/dev/kvm` at boot it passes the device and its group into the web service container, so the new-machine form offers KVM; without it only TCG is offered.
- Only Intel and AMD (x86_64) machines are supported. Raspberry Pi and other Arm boards are deliberately out of scope.
- Network cards that need non-free firmware may not work when booting the USB image on a physical PC.

## How the files are built

`.github/workflows/build.yml` builds on every push:

1. The x86_64 container image, pushed to `ghcr.io/<owner>/material-qemu:<version>`.
2. The x86_64 appliance (`appliance/build-appliance.sh`): Debian 13 generic cloud image verified against its SHA512SUMS, grown to 8 GiB, customized in a chroot over `qemu-nbd`, booted once under QEMU on a throwaway 64 GiB overlay (`appliance/boot-check.sh`), then packaged as the OVA (`appliance/make-ova.mjs`) and the gzip-compressed USB image with a size and hash record.
3. The portable deploy assistant (`companion/`), built with electron-builder on Windows.
4. One normal GitHub release with all files, their SHA-256 sums and workflow timing.

Local checks: `npm test` in `companion/` runs the assistant's unit tests, including the disk writer against an ordinary file.

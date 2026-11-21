# Hosting with the deploy assistant

The deploy assistant (`material-qemu-deploy-<version>-portable.exe`, one portable Windows file) runs Material QEMU outside your Windows session in four ways:

| Target | What it uses | Result |
| --- | --- | --- |
| VirtualBox | `material-qemu-appliance-<version>.ova` | A VM with its own LAN address |
| VMware Workstation | the same OVA | A VM with its own LAN address |
| Docker on this computer | `ghcr.io/ding-ding-projects/material-qemu:<version>` | A container on a port of this computer's LAN address |
| USB drive | `material-qemu-usb-x86_64-<version>.img.gz` | A spare Intel or AMD PC that boots straight into Material QEMU |
| Internal disk of a PC | `material-qemu-installer-x86_64-<version>.iso` | A PC that runs Material QEMU from its own disk after a one-time install |

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

## Installing on a PC's internal disk

`material-qemu-installer-x86_64-<version>.iso` installs the appliance onto a computer's own disk, so the USB drive is only needed once.

1. Write the ISO to a USB drive with Rufus (DD or ISO mode), balenaEtcher, `dd`, or the deploy assistant's Flash page (**Installer for an internal disk**). It can also be used as a DVD, or attached as a virtual CD in VirtualBox or VMware.
2. Boot the PC from it (BIOS or UEFI). The menu's first entry, **Install Material QEMU on this computer**, is chosen after 15 seconds.
3. The installer lists every internal disk large enough for the 8 GiB image, with its size and model and whether it is blank. The installer drive itself is never listed. Type the disk name; a disk that already has partitions also needs `ERASE` typed.
4. It writes the image, reads it back and compares the SHA-256 with the value recorded when the release was built.
5. Remove the USB drive and press Enter. The PC restarts into Material QEMU, grows the system to fill the disk and shows its address on screen.

The second menu entry, **Install automatically to the only blank disk**, writes without asking only when exactly one listed disk has no partitions at all; otherwise it falls back to asking. The release build runs this automatic install under QEMU onto a blank disk and then boots the installed disk until the web service answers (`appliance/install-check.sh`).

## Updating an appliance

The appliance checks GitHub for a newer release once a day and shows the result in **Settings > Appliance updates**. **Check now** asks again. When a newer release exists, **Update and restart** (behind the two-key slider, which warns how many machines are running) pulls that release's container image from `ghcr.io/ding-ding-projects/material-qemu`, restarts the web service on the same data volume and waits for it to report healthy. Machines, disks, ISOs and settings live in that volume and are kept. Running machines stop when the service restarts. If the new release does not become healthy within three minutes, the previous image is restored and the card says so.

The web service cannot restart its own container, so it writes `update-request` into its data volume; `material-qemu-update.path` notices it and runs `/usr/local/sbin/material-qemu-update`, which writes `update-status.json` back. `material-qemu-update.timer` runs the same script daily, and that run only checks. Outside the appliance (the container on Docker, or the native test host) the card is not shown.

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

## Windows host app

`material-qemu-host-0.1.<build>-setup.exe` (in each release, or from `build-installer.bat`) installs **Material QEMU Host** for the current Windows user with Squirrel.Windows. It runs the web service on this computer for your network and shows the address to open, with **Open in browser**, **Copy address**, **Start** and **Stop**, whether QEMU is installed (with **Install QEMU**, which uses Chocolatey and asks Windows for approval), the data folder (`Documents\Material QEMU VMs\host`), the port and the last 200 log lines. If port 8090 is taken it uses the next free port and says so. It can start when you sign in. Closing the window stops the service and the machines it started. Uninstall it from Windows Settings > Apps. The installer is unsigned, so Windows may warn about an unknown publisher (evidence/host-app).

## Portable build companion

`material-qemu-build-<version>-portable.exe` (in each release) is one file that carries the complete source of its release. It unpacks it under `Documents\Material QEMU Build\<commit>` and offers **Build** (`build.bat`), **Build and run** (`build.bat /run`, stopped with **Stop**) and **Build installer** (`build-installer.bat`, which produces the Windows host app setup), with a live log, the elapsed time, the result and buttons to open the source and installer folders. Missing Node.js is installed with Chocolatey by the build scripts, which ask Windows for approval. Without a git checkout the build records the commit from `SOURCE_REVISION`, which the companion sets (evidence/build-companion).

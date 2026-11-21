# Material QEMU

A functional, self-hosted QEMU workspace based on the preserved design contract. This initial runtime connects owner sign-in, guided setup, overview, machine management, an eight-step machine editor, and an authenticated live VNC console.

[Public screenshot gallery: current verified views and historical originals](https://ding-ding-projects.github.io/material-qemu-gallery/)

## Run locally

Use Node.js 22 or newer for the web runtime. The container includes QEMU for x86_64 and aarch64 with TCG emulation.

```powershell
.\build.bat -Container
.\host.bat --detached
```

Open http://localhost:8080/ and create the first account: the first account created becomes the owner, and every later visitor has to sign in. Set it up right after starting it, before anyone else on your network opens the page.

The default Compose port is loopback-only. Remote access requires a reviewed HTTPS reverse proxy and an exact `PUBLIC_ORIGIN`. LAN delivery and image-registry publication are not yet verified. Preserve the data volume during updates.

## One-click test host on this computer

`go-host.bat` runs Material QEMU directly on Windows for quick testing, with no container and no virtual machine. Double-click it, or run it from a terminal:

```powershell
.\go-host.bat
```

It installs QEMU for Windows through Chocolatey when it is missing (Windows asks for administrator approval), builds the runtime, starts the server on port 8090 at this computer's LAN address, waits for `/health`, and prints the link. Open it and create the first account to become the owner. `go-host.bat --status` and `go-host.bat --stop` check and stop it; `--port` and `--ip` override the defaults. Test data lives in `Documents\Material QEMU VMs\go-test`, separate from every other deployment, and is kept when it stops.

This is a test bench, not the appliance: guests use software emulation, the Arm targets report their firmware as unavailable on Windows, and a result here says nothing about the OVA or USB images.

## Host in VirtualBox, VMware, Docker or on a USB drive

Each release from the build workflow carries a portable Windows deploy assistant (`material-qemu-deploy-<version>-portable.exe`), an appliance VM (`material-qemu-appliance-<version>.ova`), and a USB image for spare Intel or AMD PCs. Run the assistant and pick a target:

- **VirtualBox or VMware Workstation**: it imports the appliance, bridges it onto your network, waits for it to report its address, checks its health, then shows the LAN link.
- **Docker on this computer**: it runs the release container on a port of this computer's LAN address.
- **Flash**: it writes the PC image to a removable USB or SD disk behind a two-key slider gate, then reads the disk back to verify it.

The **Instances** page starts, stops, restarts and removes what it created. The interface is in English, Cantonese, or both. See [hosting with the deploy assistant](docs/features/vm-hosting.md).

![Deploy assistant detecting VirtualBox and VMware on a real Windows host](evidence/deploy-assistant/deploy-wizard.png)

![Deploy page in Cantonese, showing Docker detected but its engine stopped](evidence/deploy-assistant/deploy-cantonese-docker.png)

![Flash page listing only the removable USB disk, with the backup-drive warning and locked keys](evidence/deploy-assistant/flash-page-cantonese.png)

![Two-key remove gate armed with the slider part-way](evidence/deploy-assistant/remove-gate-armed.png)

The assistant screens were designed first on a canvas; the source boards are in `design/deploy-assistant/`.

## Install on a PC, step by step

The installer ISO in each release puts Material QEMU on a computer's own disk. Write `material-qemu-installer-x86_64-<version>.iso` to a USB drive with [Rufus](https://rufus.ie), balenaEtcher, `dd` or the deploy assistant's Flash page, then boot the PC from it. These screenshots come from one run of `scripts/virtualbox-install-walkthrough.sh` with release 0.1.0-build.32 in a VirtualBox VM with an empty 20 GiB disk; on a real PC the screens are the same. The installer never lists the drive it booted from, asks for the disk name, and asks for `ERASE` too if the disk already has partitions. Updates after that come from **Settings > Appliance updates** ([details](docs/features/vm-hosting.md#updating-an-appliance)).

1. The installer's boot menu; the first entry starts after 15 seconds.

   ![The installer's boot menu; the first entry starts after 15 seconds](evidence/installer-virtualbox/01-boot-menu.png)

2. The installer lists the internal disks that can hold Material QEMU.

   ![The installer lists the internal disks that can hold Material QEMU](evidence/installer-virtualbox/02-disk-list.png)

3. The disk name is typed in and writing starts.

   ![The disk name is typed in and writing starts](evidence/installer-virtualbox/03-writing.png)

4. The written disk is read back and matches the release's SHA-256.

   ![The written disk is read back and matches the release's SHA-256](evidence/installer-virtualbox/04-verified.png)

5. Installed: remove the installer and press Enter to restart.

   ![Installed: remove the installer and press Enter to restart](evidence/installer-virtualbox/05-installed.png)

6. The PC restarts from its own disk into Material QEMU.

   ![The PC restarts from its own disk into Material QEMU](evidence/installer-virtualbox/06-first-boot.png)

7. The console shows the address to open.

   ![The console shows the address to open](evidence/installer-virtualbox/07-ready.png)

8. Opening that address shows the first-run page; the first account becomes the owner.

   ![Opening that address shows the first-run page; the first account becomes the owner](evidence/installer-virtualbox/08-browser.png)

## Runtime behavior

- Password authentication uses scrypt; sessions use opaque HttpOnly SameSite cookies and CSRF verification.
- Passkeys use SimpleWebAuthn with origin and relying-party checks. Hardware authenticator verification remains pending.
- Machine disks are sparse QCOW2 images within managed storage. Installation ISOs are operator-managed under `data/media`.
- Machine start, pause, resume, ACPI shutdown and explicit power off use real QEMU processes and QMP.
- The browser console uses locally bundled noVNC through an authenticated WebSocket proxy. VNC and QMP bind only to container loopback.
- The data directory and container are a single-owner trust boundary. Other code running inside that container must be trusted.
- Host measurements are actual readings. Unsupported disk/network throughput and advanced hardware are not synthesized.

## Scope and remaining work

The other 50 design boards remain design-only. The deploy assistant, the appliance OVA and the USB image build in the workflow (Intel and AMD only; Raspberry Pi is out of scope); see the [roadmap](ROADMAP.md) for which of them have been verified on real hypervisors and hardware. The web app was remade in Material Design 3 with UEFI and Secure Boot firmware, CPU topology and models, multiple disks on virtio, SATA, NVMe, SCSI or IDE, network models and port forwards, display, sound, USB, serial and RNG devices, boot order, autostart, live pause, resume, reset, key and CD actions, screenshots, snapshots, and a storage manager with resize, clone and disk import ([QEMU hardware](docs/features/qemu-hardware.md), [interface](docs/features/interface.md)). TPM (swtpm) start-up, KVM, an installed guest OS, migration and native installers are not verified or not delivered. Full required-feature parity, regex tooling, complete translation and production hardening remain incomplete. `build-installer.bat` reports that gap with a nonzero exit code.

See [roadmap](ROADMAP.md), [handoff](HANDOFF.md), [runtime architecture](docs/features/runtime.md) and the original [design contract](design/HANDOFF.md). Design frames illustrate the reference only and are not runtime evidence.

## Step-by-step walkthrough

Every picture below is an unedited screenshot from one run of `scripts/walkthrough.mjs` against a fresh server (native Windows, QEMU 11.1, software emulation), starting from an empty data folder. The machine has a blank disk, so its console shows the UEFI firmware looking for something to boot.

### Sign up and set up

1. First run: create the owner account (the first account becomes the owner).

   ![First run: create the owner account (the first account becomes the owner)](evidence/walkthrough/01-first-run.png)

2. Owner name and a password of at least 12 characters entered.

   ![Owner name and a password of at least 12 characters entered](evidence/walkthrough/02-owner-filled.png)

3. Guided setup starts; progress is saved automatically.

   ![Guided setup starts; progress is saved automatically](evidence/walkthrough/03-onboarding.png)

4. Final review step of setup.

   ![Final review step of setup](evidence/walkthrough/04-onboarding-review.png)

5. The dashboard before any machine exists.

   ![The dashboard before any machine exists](evidence/walkthrough/05-dashboard-empty.png)

### Create a machine

6. New machine: name it and pick a preset.

   ![New machine: name it and pick a preset](evidence/walkthrough/06-new-machine-preset.png)

7. System and firmware: UEFI selected; the launch preview updates on the right.

   ![System and firmware: UEFI selected; the launch preview updates on the right](evidence/walkthrough/07-new-machine-firmware.png)

8. CPU and memory.

   ![CPU and memory](evidence/walkthrough/08-new-machine-cpu.png)

9. Disks: a second data disk added.

   ![Disks: a second data disk added](evidence/walkthrough/09-new-machine-disks.png)

10. Network: a port forward from host port 2222 to guest port 22.

   ![Network: a port forward from host port 2222 to guest port 22](evidence/walkthrough/10-new-machine-network.png)

11. Display and devices.

   ![Display and devices](evidence/walkthrough/11-new-machine-display.png)

12. Boot order and automation.

   ![Boot order and automation](evidence/walkthrough/12-new-machine-boot.png)

### Run it

13. Create and start: the machine page with the live console.

   ![Create and start: the machine page with the live console](evidence/walkthrough/13-machine-running.png)

14. Take snapshot: name it.

   ![Take snapshot: name it](evidence/walkthrough/14-snapshot-dialog.png)

15. The snapshot appears in the timeline.

   ![The snapshot appears in the timeline](evidence/walkthrough/15-snapshot-taken.png)

16. Dashboard with a live thumbnail of the running machine.

   ![Dashboard with a live thumbnail of the running machine](evidence/walkthrough/16-dashboard-running.png)

### Find your way around

17. Machines list with filters and the power button.

   ![Machines list with filters and the power button](evidence/walkthrough/17-machines.png)

18. Storage: both disks, with resize, clone and attach actions.

   ![Storage: both disks, with resize, clone and attach actions](evidence/walkthrough/18-storage.png)

19. Settings: colour seed, theme, language, motion, passkeys and host facts.

   ![Settings: colour seed, theme, language, motion, passkeys and host facts](evidence/walkthrough/19-settings.png)

### Power off safely

20. Power off needs both keys and a full slide.

   ![Power off needs both keys and a full slide](evidence/walkthrough/20-power-off-gate.png)

21. The machine is powered off.

   ![The machine is powered off](evidence/walkthrough/21-powered-off.png)

### On a phone

22. On a phone the rail becomes a bottom bar; nothing is removed.

   ![On a phone the rail becomes a bottom bar; nothing is removed](evidence/walkthrough/22-phone.png)

## Verified runtime images

These images come from the Material Design 3 web app running natively on Windows with QEMU 11.1, driving a real UEFI machine with a virtio system disk and an NVMe data disk. Headless Microsoft Edge captured them at 1440 by 960 and 375 by 812 pixels. The [evidence inventory](evidence/README.md) records the details and limitations; earlier container images are kept there with their provenance.

![Dashboard with host gauges and a live thumbnail taken from the running guest](evidence/lang-gui-remake/real/dark-dashboard.png)

![Machine page showing the live UEFI shell, console toolbar, power controls and snapshots](evidence/lang-gui-remake/real/dark-machine.png)

![Storage manager in the light theme listing both disks with resize, clone and attach actions](evidence/lang-gui-remake/real/light-storage.png)

![New machine form at 375 pixels with the bottom navigation bar](evidence/lang-gui-remake/real/narrow-create.png)

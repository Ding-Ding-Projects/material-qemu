# Hosting in VirtualBox or VMware

Material QEMU can run as a self-contained virtual machine (an appliance) inside Oracle VirtualBox or VMware Workstation on Windows. Two files from each release make this work:

| File | What it is |
| --- | --- |
| `material-qemu-deploy-<version>-portable.exe` | The deploy assistant: a single portable Windows app that imports, configures, starts and manages appliance instances. |
| `material-qemu-appliance-<version>.ova` | The appliance: Debian 13 with Docker and the Material QEMU container image preloaded. |

## One-click deployment

1. Run the deploy assistant. It detects VirtualBox (`VBoxManage.exe`) and VMware Workstation (`vmrun.exe` plus `OVFTool\ovftool.exe`) in their standard install folders. A hypervisor that is missing or incomplete is shown disabled with the reason.
2. Choose the latest release (downloaded once, then cached and checked against the published SHA-256) or a local `.ova` file.
3. Name the instance and set CPUs, memory and, for VirtualBox, the network adapter to bridge. Nested virtualization is on by default so QEMU guests can use hardware acceleration when the host allows it.
4. Select **Deploy**. The assistant imports the OVA, switches the network adapter to bridged mode, attaches the first serial port to a log file, starts the VM headless, waits for the appliance to report its LAN address, then checks `/health` at that address from this computer.

When it finishes, it shows the LAN link and, before the first owner exists, the first-run setup code. Instances are stored under `Documents\Material QEMU VMs`.

### How the address is found

On every boot the appliance reads the address its network assigned, sets `PUBLIC_ORIGIN` to `http://<address>:8080`, starts the container and, once `/health` answers, writes one line to its first serial port:

```
MQ-READY version=<version> url=http://<address>:8080/ setup=<code or none>
```

The assistant reads that line from the serial log file. The same address and setup code are shown on the VM console login screen, so a manually imported OVA is usable without the assistant.

To pin a different origin (for example a DNS name), write it to `/etc/material-qemu/public-origin` inside the appliance.

## Instance manager

The **Instances** page lists only virtual machines the assistant created, with hypervisor, version, live health and link. Start, stop, restart, open, copy link and copy setup code act on that one machine. Health is checked when the page opens or on **Refresh**; nothing is reported healthy without a fresh check.

**Remove** uses the destructive-action super confirmation: two independent keys unlock a full-range slider, and only a completed slider powers off and deletes the VM and its disk files (including every QEMU guest stored inside it). **Emergency exit** or Escape cancels with nothing changed.

## Failure handling

A failed step opens a full-screen failure view that stays until dismissed. It shows the failing command line, exit code, elapsed time and the last lines of real output. A failure before the VM starts leaves any imported machine listed under Instances so it can be removed.

## Security notes

- Every hypervisor command runs with an argument array, never a shell string. Instance names are limited to letters, digits, dots, dashes and underscores.
- The appliance has no SSH server and no root password. Its only network service is Material QEMU on port 8080, reachable on your LAN, never published to the internet by the assistant.
- The portable exe and the OVA are unsigned. Windows may show an unknown-publisher warning.
- The serial log file contains the first-run setup code until an owner is created; it lives in your own Documents folder.

## Known limits

- Plain HTTP on a LAN address is not a secure browser context, so passkey sign-in needs HTTPS in front of the appliance; password sign-in works.
- QEMU guests use software emulation unless nested virtualization is available to the VM.
- Not built yet: Docker host target, USB and Raspberry Pi flashing, Raspberry Pi image, translations.

## How the files are built

`.github/workflows/build.yml` builds on every push:

1. The container image, pushed to `ghcr.io/<owner>/material-qemu:<version>`.
2. The appliance (`appliance/build-appliance.sh`): Debian 13 generic cloud image, verified against its SHA512SUMS, expanded to 64 GiB, customized with `virt-customize`, then booted once under QEMU on a throwaway overlay (`appliance/boot-check.sh`) and packaged as a stream-optimized VMDK inside an OVA (`appliance/make-ova.mjs`).
3. The portable deploy assistant (`companion/`), built with electron-builder on Windows.
4. One normal GitHub release with all files, their SHA-256 sums and workflow timing.

Local checks: `npm test` in `companion/` runs the deploy assistant's unit tests.

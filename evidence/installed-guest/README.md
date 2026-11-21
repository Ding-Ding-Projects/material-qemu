# Installed guest operating system

The system disk of the release appliance (`material-qemu-appliance-0.1.0-build.19.ova`, already downloaded and hash-verified by the deploy assistant) is an installed Debian 13 system. Its VMDK was extracted from the OVA and imported through `POST /api/storage/import` on the native Windows server (QEMU 11.1.0, TCG) by `scripts/verify-installed-guest.mjs`. The server detected the VMDK format, converted it to qcow2 and created the machine `debian-installed` (q35, BIOS, 2 vCPU, 2 GiB, virtio disk).

- The machine was started and the API screenshot was read every 90 seconds. `debian-login.png` is the unedited screenshot at 420 seconds: the Debian 13 login prompt on tty1, with the guest's own container service already started.
- `powerdown` (ACPI power button) was then requested; the guest shut itself down and the machine reported `stopped` 10 seconds later with no error.

Not covered: a guest installed from an ISO with an installer, a Windows guest, or KVM on the Windows host (the Windows hypervisor is not available there).

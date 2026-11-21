# Appliance hardware check: v0.1.0-build.19

Source commit `f4e97ecbf773e29590ac15df556724b0efded64e`, release `v0.1.0-build.19`. The OVA was downloaded and hash-verified by the deploy assistant library, imported into VirtualBox on a Windows 11 host with nested virtualization on (4 vCPU, 6 GiB, bridged Ethernet), and reported healthy over the LAN.

`scripts/verify-appliance-hardware.mjs` then drove the web service API from the Windows host:

- `GET /api/host`: QEMU 7.2.22 (Debian), accelerators `tcg` and `kvm`, UEFI and Secure Boot firmware found, swtpm available.
- A q35 machine with UEFI, Secure Boot, TPM 2.0 (swtpm), KVM, CPU model `host`, 2 cores, 1 GiB and a 4 GiB virtio qcow2 disk was created and started.
- After 25 seconds the machine was running; `uefi-secureboot-tpm-kvm.png` is the unedited screenshot returned by the API (the EDK II shell, since the disk is blank).
- A live snapshot was taken and listed, then the machine was powered off.

The verification VM was deleted afterwards. Build 17, without the `/dev/kvm` hand-off, offered only TCG in the same setup; the same checks passed there with TCG.

Not shown: an installed guest operating system, or Windows recognising the TPM.

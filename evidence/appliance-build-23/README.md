# QEMU inside the appliance on VirtualBox and VMware: v0.1.0-build.23

The release appliance `v0.1.0-build.23` was deployed with the deploy assistant library into VirtualBox (bridged Ethernet, nested virtualization on) and VMware Workstation (bridged VMnet0), 4 vCPU and 6 GiB each. Both reported healthy over the LAN.

`scripts/verify-appliance-hardware.mjs` then created and started a machine inside each appliance through the web service API: q35, UEFI with Secure Boot, TPM 2.0 (swtpm), KVM with CPU model `host`, 2 cores, 1 GiB, a 4 GiB virtio qcow2 disk.

| Hypervisor | Accelerators reported | Machine state | Screenshot | Live snapshot | Power off |
| --- | --- | --- | --- | --- | --- |
| VirtualBox | tcg, kvm | running | `virtualbox-uefi-tpm-kvm.png` (EDK II shell) | created | stopped |
| VMware Workstation | tcg, kvm | running | `vmware-uefi-tpm-kvm.png` (EDK II shell) | created | stopped |

The check used a temporary account, so both appliances were then deleted and deployed again from the same release, leaving them without an owner for the person who hosts them.

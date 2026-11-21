# Discover installed QEMU platforms

Discovery starts with the supplied 29-target catalog and unions it with actual `qemu-system-*` executables found in bounded PATH enumeration. The limits and any truncated/unreadable scan state are returned separately. Each probe uses an argument array, a five-second timeout and bounded output. A successful version probe followed by a failed capability probe remains `installed: true` with `discoveryIncomplete: true`.

The binary's own `-machine help` and `-accel help` output supplies the inventory. Discovered machine boards and unsupported reasons are separate from selectable device recipes. The initial selectable families are x86 PC/q35 and Arm virt; unrelated boards remain visible with a concrete missing-recipe reason rather than inheriting unsafe generic devices.

TCG is the software-emulation route. KVM device read/write access plus matching host architecture establishes eligibility only. The editor explicitly labels eligible KVM as launch-unverified; no discovery field claims hardware acceleration was proven by help text or file access. A real QMP-ready launch is separate evidence.

The container supplies x86_64, i386, aarch64 and arm executables with the firmware needed by their supported recipes. The platform regression attempts a bounded blank-disk launch, QMP status check and stop for each selectable installed platform. It proves process/firmware launch, not a guest operating-system installation or boot. Exact results belong to the built-image receipt.

Existing machine records without `machineType` or `accelerator` retain their prior defaults. Newly selected values must match the current discovered supported inventory before save, preview or execution. Resource presets select only installed runnable platforms and do not imply Windows, cloud-init, Raspberry Pi or confidential-guest support.

Primary references: [QEMU invocation](https://www.qemu.org/docs/master/system/invocation.html), including machine listing and comma escaping; [Debian Arm firmware package files](https://packages.debian.org/bookworm/all/qemu-efi-arm/filelist).

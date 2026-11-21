# Runtime evidence

## Latest verified interface: Material Design 3 remake

Unedited headless Microsoft Edge captures in [lang-gui-remake/real](lang-gui-remake/real/) of the remade web app, served by the native Node.js server on Windows 11 with QEMU 11.1.0 (TCG). The machine `remake-uefi` uses UEFI firmware (edk2 from the QEMU install), a 4 GiB virtio qcow2 system disk and a 2 GiB NVMe qcow2 data disk. Captures cover the dashboard, machines, new machine, storage, settings and machine pages in dark and light at 1440 by 960, and the dashboard, new machine and storage pages at 375 by 812 (document width equal to the viewport, so no horizontal scrolling).

Observed on the real server in the same session: owner creation without a setup code, start, pause, resume, Ctrl+Alt+Del, PNG screenshot (shown as the dashboard thumbnail), stopped and running snapshots, the storage inventory, and the live VNC console showing the UEFI shell. Browser workflows driven by `scripts/verify-browser-workflows.mjs` against the same server are recorded in [lang-gui-remake/workflows](lang-gui-remake/workflows/) with a [result file](lang-gui-remake/workflows/workflows.json): the create form (UEFI, second disk, CPU topology, port forward), disk resize, clone, VMDK import converted to qcow2, snapshot, two-key snapshot restore, and Cantonese and bilingual rendering with no horizontal overflow. Not shown here: an installed guest OS, KVM, or TPM start-up (swtpm is not installed on this Windows host). Captures in [lang-gui-remake](lang-gui-remake/) outside `real/` used mocked API responses during development and are not runtime evidence.

## Earlier verified runtime: 8e7802f

Unedited images from immutable source `8e7802f38df82728a5db4fe58959be70f3a7bc09`. The [receipt](8e7802f/receipt.json) records hashes, dimensions, observed timestamps, viewports, image identity, checks and limitations.

- [Initial owner setup](8e7802f/initial.png)
- [Live QEMU console](8e7802f/console.png)
- [Machine management at 360 pixels](8e7802f/machines-360.png)

The console shows real SeaBIOS on an intentionally blank disk. It does not prove an installed guest OS. Browser verification used isolated Linux Chromium and synthetic data. The newer preservation commits do not relabel this build.

[Earlier originals and provenance](ARCHIVE.md).

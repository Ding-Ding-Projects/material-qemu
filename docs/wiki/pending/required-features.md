# Required-feature inventory

Every required feature of Material QEMU, its state, and where the proof is. **Verified** means a real run on real software (QEMU, a browser, a hypervisor or a release build), recorded in `evidence/` or by a script in `scripts/` that can be run again. **Implemented** means built and covered by unit tests but not yet checked end to end. **Pending** means not built. **Skipped** means the owner chose not to check it. Nothing pending is shown in the product as if it worked.

## Interface

| Feature | State | Proof |
| --- | --- | --- |
| Material Design 3 Expressive interface, dark, light and seed colours, motion that respects reduced motion | Verified | evidence/lang-gui-remake/real, evidence/walkthrough |
| First account becomes the owner, no setup code; guided setup | Verified | evidence/walkthrough (steps 1 to 4) |
| English, Cantonese and bilingual modes, including server messages | Verified | evidence/lang-gui-remake/workflows, `tests/server-errors.test.mjs` |
| Phone width with nothing removed | Verified | `scripts/verify-site.mjs`, evidence/walkthrough step 22 |
| Keyboard-only use with visible focus | Verified | `scripts/verify-keyboard.mjs`, evidence/keyboard |
| Search with an adjacent regular expression builder | Verified | `scripts/verify-search.mjs`, evidence/search |
| Regex explain, test bench with groups, replace and split preview, saved library, one-second time limit | Verified in browser | `scripts/verify-regex-tools.mjs`, evidence/regex-tools |
| Regex step debugger, flavour comparison (PCRE, Python, .NET, Java, Go), code generation in six languages, local file search | Verified in browser | `scripts/verify-regex-tools.mjs`, tests/regex-parity.test.mjs, evidence/regex-tools |
| Header search over disk images, ISO images and help articles; command palette regex search | Verified in browser | `scripts/verify-search-everywhere.mjs`, tests/search-everywhere.test.mjs, evidence/search-everywhere |
| Replace inside searched local files with a per-line preview and downloaded changed copies | Verified in browser | `scripts/verify-regex-tools.mjs`, tests/regex-parity.test.mjs, evidence/regex-tools |
| Running other flavours' own engines | Not planned: differences are reported instead; see ROADMAP.md | docs/features/workspace.md |
| Notifications center | Verified | `scripts/verify-notifications.mjs`, evidence/notifications |
| Workspace tabs, command palette, saved views, folders, tags | Verified | evidence/walkthrough, `tests/` |
| Two-key slider confirmation for destructive actions | Verified | evidence/walkthrough steps 20 and 21, `tests/confirm-gate.test.mjs` |
| Passkeys | Verified with a virtual authenticator; physical key skipped | `scripts/verify-passkeys.mjs` |
| The other 50 boards of the original design | Pending | docs/features/design-coverage.md |

## Machines and QEMU

| Feature | State | Proof |
| --- | --- | --- |
| UEFI, Secure Boot, TPM (swtpm), KVM | Verified in the appliance | evidence/appliance-build-19, evidence/appliance-build-23 |
| CPU model and topology, memory, balloon, SMBIOS UUID | Verified (launch arguments with real QEMU) | `tests/hardware-config.test.mjs`, `tests/qemu-hardware.test.mjs` |
| Up to eight disks on virtio, SATA, NVMe, SCSI or IDE; CD drives | Verified | evidence/lang-gui-remake/real (virtio and NVMe), `tests/` |
| Network models, MAC, port forwards | Verified | evidence/lang-gui-remake/workflows |
| Display, sound, USB, serial, RNG, boot order, autostart | Verified (launch arguments) | `tests/hardware-config.test.mjs` |
| Pause, resume, reset, ACPI shutdown, power off, keys, CD change | Verified | evidence/installed-guest, `tests/qemu-hardware.test.mjs` |
| Snapshots, running and stopped, single and bulk | Verified | evidence/bulk-and-drag, evidence/lang-gui-remake/workflows |
| Storage: resize, clone, VMDK/VDI/VHDX/raw import, ISO library | Verified | evidence/lang-gui-remake/workflows |
| Live console, screenshot PNG matching the framebuffer, recording, annotation, Ctrl+Alt release | Verified | evidence/console, evidence/console-media |
| Live thumbnails and per-guest CPU and memory | Verified on Windows and Linux | evidence/guest-usage |
| Host hardware discovery (IOMMU, hugepages, VFIO, nesting, SEV/TDX) | Verified on Linux | evidence/guest-usage/linux-appliance.txt |
| Installed guest operating system boot and ACPI shutdown | Verified | evidence/installed-guest |
| Network bridges, storage pools, SPICE, USB redirection, multiple users | Pending (bridges and pools would change host networking and disks) | docs/features/design-coverage.md |

## Hosting and delivery

| Feature | State | Proof |
| --- | --- | --- |
| Container image on GHCR, built per release | Verified | release workflow, evidence/appliance-build-23 |
| Appliance OVA in VirtualBox and VMware with LAN address and KVM | Verified | evidence/appliance-build-23 |
| Deploy assistant (portable) for VirtualBox, VMware, Docker and flashing | Verified for VirtualBox and VMware; Docker skipped (no hypervisor on the development host) | evidence/deploy-assistant |
| Bare-metal installer ISO, checked in every release build | Verified | evidence/installer-virtualbox, `appliance/install-check.sh` |
| USB image written to a real drive and booted on a physical PC | Pending owner hardware | ROADMAP.md |
| In-place appliance updates with rollback | Verified (build 31 to 32) | evidence/appliance-update |
| Windows host app with a Squirrel.Windows installer | Verified (installed, run, uninstalled) | evidence/host-app |
| Portable build companion carrying its source | Verified | evidence/build-companion |
| `build.bat` and `build-installer.bat` | Verified | evidence/build-companion |
| One-click native test host (`go-host.bat`) | Verified | README |
| Reachability from a second device on the network | Pending owner check | ROADMAP.md |

## Release and documentation

| Requirement | State | Proof |
| --- | --- | --- |
| Every push to main builds and publishes a normal (not draft, not pre-release) release with checksums | Verified | release workflow readback in each run |
| Documentation site on GitHub Pages with guides, every article and wiki page, regex search, two languages | Verified live | `scripts/verify-site.mjs`, evidence/docs-site |
| Repository homepage points at the documentation site | Verified | `gh repo view --json homepageUrl` |
| README with step-by-step walkthroughs and current screenshots | Verified | README.md, evidence/walkthrough, evidence/installer-virtualbox |
| GitHub wiki | Pages prepared and current; publication waits for the wiki's first page | docs/wiki/pending |

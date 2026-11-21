# Roadmap

## Verified connected core

- [x] Implement authenticated owner access, session/CSRF boundaries and persistent state.
- [x] Verify virtual passkey registration/sign-in and fresh-passkey password-mode changes on their recorded source.
- [x] Implement saved onboarding, exact-step drafts, pre-auth preferences and first-machine creation.
- [x] Verify real QEMU lifecycle and raw/read-only CD recipes for x86_64, i386, aarch64 and arm.
- [x] Implement and verify bounded ISO upload, no-overwrite behavior and actual transfer integrity.
- [x] Implement folders, saved views, tags, collapsed groups and live metadata changes.
- [x] Verify stopped-only record removal retains disk bytes and supports restoration.
- [x] Implement actual sampled Overview history with scope labels and independent filters.
- [x] Implement tabs, catalog and actionable palette for supported destinations.
- [x] Verify closed Overview persistence and keyboard focus across live polling on exact recorded sources.
- [x] Preserve supplied design templates, provenance and earlier source-bound evidence.

## Preserved incomplete console unit

- [x] Preserve inactive framebuffer/recording/annotation helpers and boundary tests.
- [x] Export the console as a PNG (QMP screendump) and prove it decodes pixel-for-pixel to the live framebuffer (scripts/verify-console-export.mjs, evidence/console).
- [x] Record the console to WebM with stop, a 30-second and 16 MiB limit, an unsupported-browser message and a sign-out warning for an undownloaded clip (scripts/verify-console-media.mjs, evidence/console-media).
- [x] Annotate a frozen console frame with lines and text, downloading the original and the annotated frame separately, with unsaved-work warnings (evidence/console-media).
- [x] Release guest input with Ctrl+Alt pressed alone, without catching Ctrl+Alt+Del (tests/input-release.test.mjs, verified with real key events in evidence/console).

## Remaining supplied-design acceptance

- [ ] Complete every remaining control listed in docs/features/design-coverage.md.
  - [x] Machine page Overview, Hardware, Monitor and Log tabs, checked against a running QEMU machine (scripts/verify-machine-tabs.mjs, evidence/machine-tabs).
  - [x] NUMA nodes and individual CPU flags in the create form and the launch, started in QEMU and read back through the monitor (tests/cpu-numa.test.mjs, scripts/verify-cpu-numa.mjs, evidence/cpu-numa).
  - [x] Running jobs on the Overview, with upload progress and outcomes (tests/jobs.test.mjs, scripts/verify-jobs.mjs, evidence/jobs).
  - [x] Custom firmware images in Storage, booted as -bios or as UEFI code (tests/firmware-images.test.mjs, scripts/verify-firmware-images.mjs, evidence/firmware-images).
  - [x] Cloud-init NoCloud seed built at every start and read by Linux by its cidata label (tests/cloud-init.test.mjs, scripts/verify-cloud-init.mjs, evidence/cloud-init). QEMU -readconfig files are deliberately not offered.
  - [x] Guest agent tab and opt-in channel, checked against QEMU without an agent and against a fake agent (tests/guest-agent.test.mjs, scripts/verify-guest-agent.mjs, evidence/guest-agent).
  - [ ] Verify the guest agent tab against a real agent, using the appliance image that now installs qemu-guest-agent.
  - [x] Save and resume tab: a running machine's whole state saved to a file and resumed with an identical screen, with guards while the state exists (tests/saved-state.test.mjs, scripts/verify-saved-state.mjs, evidence/saved-state).
  - [x] Move a machine to another Material QEMU host as one bundle with its disks, firmware variables, TPM state and saved state (tests/machine-bundle.test.mjs, scripts/verify-machine-move.mjs, evidence/machine-move).
  - [x] Storage pools: host folders for new disks, with health in Storage and warnings on the Overview (tests/pools-api.test.mjs, scripts/verify-pools.mjs, evidence/pools). NFS pools are not offered.
  - [x] Multiple people with operator and viewer roles, enforced by the server, managed by the owner in Settings (tests/users-api.test.mjs, scripts/verify-people.mjs, evidence/people). Passkeys stay owner-only.
- [x] Fix deleting ISOs, snapshots and firmware from the browser, which the server refused because a DELETE has no content type (tests/hardware-api.test.mjs).
- [x] Add regex explain, a test bench with groups, replace and split previews, a saved pattern library and a one-second worker time limit to the regex builder (scripts/verify-regex-tools.mjs, evidence/regex-tools).
- [x] Add a step-by-step regex debugger, a comparison with other flavours, code generation in six languages and local file search to the regex builder (tests/regex-parity.test.mjs, scripts/verify-regex-tools.mjs, evidence/regex-tools).
- [x] Extend header search to disk images, ISOs and help articles, and give the command palette its own regex search (tests/search-everywhere.test.mjs, scripts/verify-search-everywhere.mjs, evidence/search-everywhere).
- [x] Replace text inside searched local files, with a per-line preview and downloads of the changed copies (tests/regex-parity.test.mjs, scripts/verify-regex-tools.mjs, evidence/regex-tools).
- ~~Run other regex flavours' own engines.~~ Not planned: it needs those runtimes shipped to the browser, or the server running interpreters on browser-supplied patterns, which the server-owned process rule forbids. The flavour tab reports known differences instead.
- [x] Add the server model for advanced hardware, firmware (UEFI, Secure Boot, TPM), multiple disks, networking, display and devices (see docs/features/qemu-hardware.md).
- [x] Run the remade interface against the v2 server with a real UEFI machine (virtio and NVMe disks): dashboard thumbnail, console, power actions, snapshots and storage inventory (evidence/lang-gui-remake/real).
- [x] Click through the create form against the v2 server: every section, UEFI, a second disk, CPU topology and a port forward saved as a v2 machine (evidence/lang-gui-remake/workflows, scripts/verify-browser-workflows.mjs).
- [x] Add server endpoints for live actions, snapshots, storage, resize, clone and disk import, tested against real QEMU.
- [x] Click through VMDK import, disk resize, clone, snapshot and two-key snapshot restore in the browser against the v2 server.
- [x] Render the remade interface in Cantonese and bilingual modes without horizontal overflow.
- [x] Translate every server error message for Cantonese and bilingual modes, with a test that fails on an untranslated message.
- [x] Verify swtpm TPM start-up, UEFI and Secure Boot discovery and KVM in the built container inside the VirtualBox appliance (evidence/appliance-build-19).
- [x] Boot an installed guest operating system (Debian 13 imported from a VMDK) to its login prompt and shut it down through ACPI (evidence/installed-guest).
- [x] Register a passkey in Settings, sign out and sign in with it in headless Edge using the browser's virtual authenticator (scripts/verify-passkeys.mjs).
- ~~Verify passkeys with a physical security key or phone.~~ Skipped at the owner's request on 2026-11-21; registration and sign-in pass with the browser's virtual authenticator.
- [x] Capture the remade interface from a real server: a 22-step first-run walkthrough (evidence/walkthrough), dark and light pages, Cantonese and bilingual modes, and phone width without horizontal scrolling.
- [x] Verify keyboard-only operation: Tab reaches every visible control on all eight pages with a visible focus ring, and Enter opens a focused rail item (scripts/verify-keyboard.mjs, evidence/keyboard).

## Delivery and broader design

- [ ] Implement and verify the other 50 design boards.
- [x] Publish an immutable container image (GHCR, public, tagged per build) and normal releases with the OVA, USB image and portable deploy assistant (v0.1.0-build.12 is green).
- [x] Add a build workflow that builds the image, appliance OVA and portable deploy assistant and publishes one normal release per push.
- [x] Design the deploy assistant on a canvas (wizard, progress/ready, failure takeover, instance manager, two-key remove gate) and keep the boards in design/deploy-assistant/.
- [x] Build the portable deploy assistant and confirm it detects real VirtualBox and VMware installs on Windows.
- [x] Add a one-click Windows test host (go-host.bat): installs QEMU, builds, starts on the LAN address, health-checked, with status and stop modes.
- [x] Verify a real deployment on VirtualBox: import, bridge, boot, LAN address report and health in under a minute; reachable from this computer on its LAN address.
- [x] Verify the same on VMware: with VMnet0 pinned to the real Ethernet adapter, the appliance got its LAN address at boot and answered healthy (VMware's automatic bridge had picked a network without DHCP).
- [ ] Verify LAN reachability from a second device (only this computer has been checked).
- [x] Add the Docker host target, USB flashing, and English/Cantonese/bilingual modes to the deploy assistant.
- [x] Launch a UEFI, Secure Boot, TPM and KVM machine with QEMU inside the appliance on both VirtualBox and VMware (evidence/appliance-build-23).
- ~~Verify the Docker target against a running Docker engine.~~ Skipped at the owner's request on 2026-11-21: the development host has the Windows hypervisor off, so Docker Desktop cannot run there.
- [ ] Verify a real USB flash and boot on a physical PC.
- [x] Install onto an internal disk from the installer ISO: checked in every release build under QEMU and step by step in VirtualBox (README, evidence/installer-virtualbox).
- ~~Raspberry Pi image and flashing~~: deliberately not doing. The owner decided on 2026-11-21 that this runs on Intel and AMD CPUs only, so the Raspberry Pi job, scripts and Flash option were removed.
- [x] Deliver appliance operating-system images and USB installer: every release carries the OVA and the x86_64 USB image with SHA-256 files (for example v0.1.0-build.23).
- [x] Update an appliance in place from Settings: daily check, pull of the new release image, restart on the same data volume, automatic rollback; verified from build 31 to build 32 with a machine kept (evidence/appliance-update).
- [x] Deliver native packaging: the Windows host app installs with Squirrel.Windows from every release and from build-installer.bat, installed and run on this computer (evidence/host-app). The portable deploy assistant is the hosting companion.
- [x] Deliver a portable build companion that carries its source and runs build.bat and build-installer.bat with a window, built in every release and checked end to end (evidence/build-companion).
- [x] Complete the required-feature inventory: every required feature with its state (verified, implemented, pending, skipped) and proof (docs/features/required-features.md). Pending features stay listed there and below.
- [x] Publish the documentation site on GitHub Pages with every article and wiki page, screenshot guides, search with a regex builder, two languages, light and dark, and phone layouts; checked live (scripts/verify-site.mjs, evidence/docs-site).
- [x] Clean up: merged helper worktrees and branches removed; only main exists locally and on GitHub (read back with git ls-remote on 2026-11-21).

## Preservation and evidence

- [x] Preserve inactive console-export drafts without claiming runtime delivery.
- [x] Preserve inspected runtime screenshots and isolated browser reproduction scripts.
- [x] Prepare complete wiki articles and navigation while its repository is uninitialized.
- [x] Publish and verify the public nine-image screenshot gallery.
- [ ] Publish the prepared wiki after its first page is initialized (owner action: create any first page on the repository Wiki tab; the pages in docs/wiki/pending are current, regenerate with node scripts/build-wiki.mjs).
- [x] Complete the design-control inventory (docs/features/design-coverage.md, current) and the release and delivery requirements: normal releases with checksums for the image, OVA, USB image, installer ISO, deploy assistant, host app installer and build companion, the live documentation site and the homepage link.

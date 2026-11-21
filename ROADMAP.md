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
- [ ] Integrate real raw PNG export and prove decoded output against the actual framebuffer.
- [ ] Integrate bounded recording with actual output, stop/cancel and unsupported-browser proof.
- [ ] Integrate annotation controls, original/edited separation and unsaved-work handling.
- [ ] Integrate and verify Ctrl+Alt input release.

## Remaining supplied-design acceptance

- [ ] Complete every remaining control listed in docs/features/design-coverage.md.
- [ ] Deliver full regex-builder parity and all required search/settings behavior.
- [ ] Complete advanced hardware, firmware, storage and network workflows without unsafe generic defaults.
- [ ] Complete snapshots, import and other pending supported destinations.
- [ ] Verify physical authenticators, installed guest operating-system boot, actual KVM and guest ACPI handling.
- [ ] Verify complete latest-source visual, language, keyboard and narrow-screen parity; retain historical evidence with original provenance.

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
- [ ] Verify the Docker target against a running Docker engine (Docker Desktop on the development host fails at startup).
- [ ] Verify a real USB flash and boot on a physical PC.
- ~~Raspberry Pi image and flashing~~: deliberately not doing. The owner decided on 2026-11-21 that this runs on Intel and AMD CPUs only, so the Raspberry Pi job, scripts and Flash option were removed.
- [ ] Deliver appliance operating-system images and USB installer.
- [ ] Deliver portable hosting/build companions and supported native packaging.
- [ ] Complete the required-feature inventory and remaining acceptance.
- [ ] Publish complete interactive documentation and wiki content; pending source staging is not publication.
- [ ] Complete the requested preservation/cleanup pass with independently verified remote state.

## Preservation and evidence

- [x] Preserve inactive console-export drafts without claiming runtime delivery.
- [x] Preserve inspected runtime screenshots and isolated browser reproduction scripts.
- [x] Prepare complete wiki articles and navigation while its repository is uninitialized.
- [x] Publish and verify the public nine-image screenshot gallery.
- [ ] Publish the prepared wiki after its first page is initialized.
- [ ] Complete the remaining design-control inventory and release/delivery requirements.

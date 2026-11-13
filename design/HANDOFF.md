# Material QEMU design handoff

This folder holds the complete design for **Material QEMU**: a QEMU management web app that ships as its own small appliance operating system (flash or import the image, boot, open the LAN URL), a USB installer with guided onboarding, and a desktop assistant that builds, deploys and verifies the appliance.

This is a design. Nothing here is implemented, verified or shipped behaviour yet.

## Layout

- `project/canvas.json` is the canvas index. It has one **page per feature category**, and every board and title note is tagged with its page.
- `project/*.dc.html` holds the 56 artboards, one self-contained file each.
- `frames/` holds a rendered still of every board at its design width, plus a 390 px phone render for every desktop board.
- `REHEARSAL.md` is the review record.

## Pages and boards

### Appliance front door

- `Main.dc.html` · Front screen: passkey sign-in with password fallback · [desktop](frames/Main@1440.png), [390 px](frames/Main@390.png)
- `Onboarding.dc.html` · First-run setup wizard · [desktop](frames/Onboarding@1440.png), [390 px](frames/Onboarding@390.png)
- `Overview.dc.html` · Overview dashboard · [desktop](frames/Overview@1440.png), [390 px](frames/Overview@390.png)
- `Machines.dc.html` · Machines: folders, saved views and details panel · [desktop](frames/Machines@1440.png), [390 px](frames/Machines@390.png)
- `NewMachine.dc.html` · New machine wizard · [desktop](frames/NewMachine@1440.png), [390 px](frames/NewMachine@390.png)
- `Console.dc.html` · Machine console · [desktop](frames/Console@1440.png), [390 px](frames/Console@390.png)

### Machine hardware: every QEMU device family

- `Processor.dc.html` · Processor and NUMA settings · [desktop](frames/Processor@1440.png), [390 px](frames/Processor@390.png)
- `Memory.dc.html` · Memory settings · [desktop](frames/Memory@1440.png), [390 px](frames/Memory@390.png)
- `Firmware.dc.html` · Firmware, boot and TPM · [desktop](frames/Firmware@1440.png), [390 px](frames/Firmware@390.png)
- `Storage.dc.html` · Storage devices · [desktop](frames/Storage@1440.png), [390 px](frames/Storage@390.png)
- `Network.dc.html` · Network devices · [desktop](frames/Network@1440.png), [390 px](frames/Network@390.png)
- `Display.dc.html` · Display, input and audio · [desktop](frames/Display@1440.png), [390 px](frames/Display@390.png)
- `Passthrough.dc.html` · USB, PCI and passthrough · [desktop](frames/Passthrough@1440.png), [390 px](frames/Passthrough@390.png)
- `GuestAgent.dc.html` · Serial, chardevs and guest agent · [desktop](frames/GuestAgent@1440.png), [390 px](frames/GuestAgent@390.png)
- `OtherDevices.dc.html` · Shared folders and other devices · [desktop](frames/OtherDevices@1440.png), [390 px](frames/OtherDevices@390.png)
- `Security.dc.html` · Security and confidential computing · [desktop](frames/Security@1440.png), [390 px](frames/Security@390.png)

### Lifecycle, monitor and debugging

- `Snapshots.dc.html` · Snapshots · [desktop](frames/Snapshots@1440.png), [390 px](frames/Snapshots@390.png)
- `Migration.dc.html` · Live migration · [desktop](frames/Migration@1440.png), [390 px](frames/Migration@390.png)
- `Jobs.dc.html` · Jobs and backups · [desktop](frames/Jobs@1440.png), [390 px](frames/Jobs@390.png)
- `Monitor.dc.html` · QMP and HMP monitor · [desktop](frames/Monitor@1440.png), [390 px](frames/Monitor@390.png)
- `Debug.dc.html` · Debug and trace · [desktop](frames/Debug@1440.png), [390 px](frames/Debug@390.png)
- `Stats.dc.html` · Live stats · [desktop](frames/Stats@1440.png), [390 px](frames/Stats@390.png)
- `UserMode.dc.html` · User-mode emulation · [desktop](frames/UserMode@1440.png), [390 px](frames/UserMode@390.png)

### Host, storage and the appliance

- `DiskImages.dc.html` · Storage pools and disk images · [desktop](frames/DiskImages@1440.png), [390 px](frames/DiskImages@390.png)
- `Images.dc.html` · ISO library and templates · [desktop](frames/Images@1440.png), [390 px](frames/Images@390.png)
- `HostNetworks.dc.html` · Host networks · [desktop](frames/HostNetworks@1440.png), [390 px](frames/HostNetworks@390.png)
- `Appliance.dc.html` · Host and appliance · [desktop](frames/Appliance@1440.png), [390 px](frames/Appliance@390.png)

### Built-in product features

- `CommandPalette.dc.html` · Command palette and context menu · [desktop](frames/CommandPalette@1440.png), [390 px](frames/CommandPalette@390.png)
- `RegexBuilder.dc.html` · Regex builder · [desktop](frames/RegexBuilder@1440.png), [390 px](frames/RegexBuilder@390.png)
- `SettingsLanguage.dc.html` · Settings: language and voice · [desktop](frames/SettingsLanguage@1440.png), [390 px](frames/SettingsLanguage@390.png)
- `SettingsAppearance.dc.html` · Settings: appearance · [desktop](frames/SettingsAppearance@1440.png), [390 px](frames/SettingsAppearance@390.png)
- `MotionEditor.dc.html` · Animation and transition editor · [desktop](frames/MotionEditor@1440.png), [390 px](frames/MotionEditor@390.png)
- `Locks.dc.html` · Locks, unlock ladder and support tickets · [desktop](frames/Locks@1440.png), [390 px](frames/Locks@390.png)
- `Users.dc.html` · Users, passkeys and authenticator · [desktop](frames/Users@1440.png), [390 px](frames/Users@390.png)
- `History.dc.html` · History, exports and notifications · [desktop](frames/History@1440.png), [390 px](frames/History@390.png)
- `Docs.dc.html` · Docs, changelog and status · [desktop](frames/Docs@1440.png), [390 px](frames/Docs@390.png)
- `Extensions.dc.html` · Extensions and drawing · [desktop](frames/Extensions@1440.png), [390 px](frames/Extensions@390.png)
- `Tabs.dc.html` · New tab catalog and tab tools · [desktop](frames/Tabs@1440.png), [390 px](frames/Tabs@390.png)

### Installer USB onboarding

- `Installer-Boot.dc.html` · USB boot menu · [desktop](frames/Installer-Boot@1280.png), [390 px](frames/Installer-Boot@390.png)
- `Installer-Welcome.dc.html` · Installer: welcome · [desktop](frames/Installer-Welcome@1280.png), [390 px](frames/Installer-Welcome@390.png)
- `Installer-Language.dc.html` · Installer: language and keyboard · [desktop](frames/Installer-Language@1280.png), [390 px](frames/Installer-Language@390.png)
- `Installer-Disk.dc.html` · Installer: disk · [desktop](frames/Installer-Disk@1280.png), [390 px](frames/Installer-Disk@390.png)
- `Installer-Network.dc.html` · Installer: network · [desktop](frames/Installer-Network@1280.png), [390 px](frames/Installer-Network@390.png)
- `Installer-Owner.dc.html` · Installer: owner and access · [desktop](frames/Installer-Owner@1280.png), [390 px](frames/Installer-Owner@390.png)
- `Installer-Review.dc.html` · Installer: review · [desktop](frames/Installer-Review@1280.png), [390 px](frames/Installer-Review@390.png)
- `Installer-Progress.dc.html` · Installer: installing · [desktop](frames/Installer-Progress@1280.png), [390 px](frames/Installer-Progress@390.png)
- `Installer-Done.dc.html` · Installer: done · [desktop](frames/Installer-Done@1280.png), [390 px](frames/Installer-Done@390.png)

### Phone parity

- `Phone-Overview.dc.html` · Phone: overview · [desktop](frames/Phone-Overview@390.png)
- `Phone-Console.dc.html` · Phone: console · [desktop](frames/Phone-Console@390.png)
- `Phone-Settings.dc.html` · Phone: settings · [desktop](frames/Phone-Settings@390.png)

### Desktop build and deploy assistant

- `Assist-Home.dc.html` · Desktop assist: home · [desktop](frames/Assist-Home@1440.png), [390 px](frames/Assist-Home@390.png)
- `Assist-Build.dc.html` · Desktop assist: build image · [desktop](frames/Assist-Build@1440.png), [390 px](frames/Assist-Build@390.png)
- `Assist-BuildProgress.dc.html` · Desktop assist: build progress · [desktop](frames/Assist-BuildProgress@1440.png), [390 px](frames/Assist-BuildProgress@390.png)
- `Assist-Deploy.dc.html` · Desktop assist: deploy · [desktop](frames/Assist-Deploy@1440.png), [390 px](frames/Assist-Deploy@390.png)
- `Assist-Verify.dc.html` · Desktop assist: verify and open · [desktop](frames/Assist-Verify@1440.png), [390 px](frames/Assist-Verify@390.png)
- `Assist-Releases.dc.html` · Desktop assist: releases · [desktop](frames/Assist-Releases@1440.png), [390 px](frames/Assist-Releases@390.png)

## Design system

- Material 3 Expressive, **dark first** with a matching light theme. Every board has a `dark` tweak and a `motion` tweak.
- Neutral warm charcoal surfaces, an ember orange primary (`#FF8A4C` dark / `#C2410C` light) and a teal tertiary (`#5EEAD4` / `#0F766E`). Status colours mean status only.
- Roboto Flex for UI (display sizes use the 96 optical size with tight tracking), Roboto Mono for code, identifiers and the console. Material Symbols Rounded icons, filled at small sizes.
- Glass app bars and overlays (backdrop blur), 28 px cards with a hairline border and layered depth, gradient primary buttons that morph from pill to rounded square on press, connected button groups for tabs and choices, tonal icon tiles in card headers, Liveline-style live charts.
- The browser-style tab strip docks on the left by default, every destination tab starts open, and there are **Open every tab** and **New tab** controls.

## Motion

- Page entry: staggered rise (opacity, 18 px, scale 0.98, blur 4 px to 0) at 55 ms per card, `cubic-bezier(.2,0,0,1)`, 700 ms.
- Dialogs and popovers pop with a spring (`cubic-bezier(.34,1.56,.64,1)`); side panels and sheets slide in from where they open.
- Charts draw in, the live dot pulses, live pills pulse, running jobs shimmer.
- Buttons, chips, tabs and icon buttons morph their corner radius on hover and press; switches stretch their thumb while pressed.
- The **Motion** settings board is the animation and transition editor: every element kind with on/off, duration, delay, stagger, distance, scale, easing presets and a curve editor, global speed, profiles (Calm, Standard, Expressive, Playful) and JSON import/export.
- Reduced motion (system setting, the `motion` tweak, Low stimulation mode) stops all animation; charts snap and stop pulsing.

## Key decisions captured on the boards

- **Sign-in:** passkey first, with a password-only sign-in fallback. The owner can turn password sign-in off, require a passkey for owner actions, and the unlock ladder rate-limits wrong passwords.
- **Machines list:** folders with collapsible groups, saved views (All, Favourites, Running, Needs attention, Recently used), list / compact / cards views, a column picker and a details side panel, so each row only carries name, platform, load, state and a menu.
- **Installer USB:** a boot menu (install, try live, safe graphics, serial console, media check, rescue), then an 8-step onboarding: welcome and hardware check, language and keyboard, disk (two-key erase confirmation), network and bridge, owner and access (passkey claim QR plus optional password fallback), review, progress, and a done screen that says to remove the USB and shows the LAN URL and a QR code. The appliance console keeps showing the URL and QR after every boot.
- **Desktop assistant:** frameless window with its own title bar; Home, Build image (architectures, output formats, base, preinstall, network), build progress with logs, Deploy (flash USB/SD with read-back verification, Proxmox, Hyper-V, VirtualBox/VMware, UTM/libvirt, Docker host with Compose), Verify and open (LAN discovery and health checks), Releases.
- **Releases:** every version publishes the container image (amd64 + arm64), appliance images (qcow2, raw `.img.xz`, installer ISO, OVA, VHDX, aarch64 qcow2 and img), the portable desktop assistant, the portable hosting wizard, `compose.yaml`, `host.bat` and `SHA256SUMS`, with workflow timing in the notes.

## QEMU coverage

Every system target (29), machine types and accelerators (KVM, TCG, Xen, HVF, WHPX, NVMM), CPU models and flags, SMP topology, pinning, NUMA and HMAT, Hyper-V enlightenments, TCG options, memory backends, hugepages, DIMM and virtio-mem hotplug, balloon, NVDIMM, virtio-pmem, CXL, SeaBIOS / OVMF / Secure Boot / pflash / NVRAM, boot order, direct kernel boot, TPM (swtpm, CRB, TIS), SMBIOS, ACPI tables, RTC; every storage frontend, cache and AIO mode, discard, detect-zeroes, iothreads, throttle groups, remote protocols (NBD, iSCSI, RBD, Gluster, SSH, HTTP, NVMe userspace, blkio), every image format and every `qemu-img` subcommand, `qemu-storage-daemon` exports (NBD, vhost-user-blk, FUSE, VDUSE), `qemu-nbd`, `qemu-pr-helper`; every network backend and NIC model, port forwards, packet filters, COLO; every display device and backend (SPICE, VNC with TLS and WebSocket, D-Bus, egl-headless), input devices and keymaps, every audio backend and device; USB controllers and passthrough, VFIO (PCI, mdev, platform, ccw, ap, vfio-user), SR-IOV, vIOMMUs, PCIe topology; chardevs, serial consoles, the full guest agent; virtiofs, 9p, ivshmem, virtio-rng, watchdogs, pvpanic, vmgenid, vsock, virtio-crypto; SEV / SEV-ES / SEV-SNP / TDX / s390x PV / Arm CCA, seccomp sandbox, run-with, TLS creds, secrets, authz, LUKS; internal and external snapshots, overlay chains, live migration with every capability, block jobs and incremental backups with dirty bitmaps; QMP and HMP with the live schema and events, GDB stub, trace events, `-d` logging, record and replay, TCG plugins, introspection, guest memory dumps and `elf2dmp`; live statistics; user-mode emulation and `binfmt_misc`.

## Product features carried

Three language modes with funny-level sliders and the dialog emoji switch; personal vocabulary JSON upload and drop-anywhere apply; School mode; ADHD modes; narrator with voice pickers; action sounds; scheduled settings; renaming the app; dim sum surprise; per-element appearance editor; infinite colour picker and translator; logo customisation; the animation and transition editor; collapsible filters; truthful empty and loading states; first-run onboarding; extensions with declared permissions; browser-style tabs with groups, New tab catalog and close-by-text; a regex builder beside every search; the `Ctrl+Shift+F` command palette with live controls; context menus with filter fields and live controls; rich controls in rows; guided forms with info buttons; presets for blank editors; two-key super confirmation; toy element locks, the unlock ladder and Support Tickets; built-in authenticator and QR pairing; local version history with diff and restore; exports in every format; bulk actions; changelog; offline docs; notifications centre; file converter and Base64 tools; progress where it started; drawing on screendumps; version and updated-at on the front screen; the Status Hub surface; phone parity (nothing removed at 360 px).

Not applicable here and why: the Windows virtual disk manager (the appliance is Linux; QEMU's own image tools cover the same jobs), the Minecraft server manager and world generator (offered as an optional extension template rather than built in), the Ollama suite (out of scope for a VM appliance), the external editor hand-off (no local editor in a browser appliance).

## Stageshow

The pass followed the Stageshow skill from the pinned cache at commit `299140f` because the live install was blocked in the build environment. Read: `SKILL.md`, `references/craft.md`, `references/framing.md`. Closest gold example used for structure: `static-card` (quiet hierarchy, one focal object per card) and `panel-annotation` for the appearance editor over the product. Stageshow rules written for marketing demos that do not fit real app screens (cursor scripts, crop and bleed of a single hero window, loop seams) are not applicable; restraint, type, spacing, icon, colour and motion rules were applied. See `REHEARSAL.md` for the review.

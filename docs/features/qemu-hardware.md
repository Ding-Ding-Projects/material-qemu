# QEMU hardware, live actions, snapshots and storage

This page describes the server API for the full hardware model. The browser controls for these endpoints are built separately; an endpoint that exists here is not a claim that the matching screen exists.

All endpoints need a signed-in session. Every POST, PUT and DELETE also needs the same-origin and CSRF checks that the rest of the API uses. Process arguments are always built on the server from validated records: the browser never supplies raw QEMU arguments, shell commands or raw QMP.

## Machine configuration (version 2)

All fields are optional on input. Older records (`diskGiB`, a `network` string, `iso`) are migrated on read and on validation, and the response still carries the derived `diskGiB` and `iso` fields for older clients.

| Field | Values |
| --- | --- |
| `firmware` | `bios` or `uefi` (x86 only; Arm targets always use their fixed UEFI firmware). |
| `secureBoot` | Boolean. Needs x86 UEFI, a q35 machine and a Secure Boot capable firmware build. |
| `tpm` | Boolean. Needs the `swtpm` emulator on PATH; otherwise the request is rejected with a clear message. |
| `cpuModel` | `host` (KVM only), `max`, `qemu64`, `Skylake-Client`, `EPYC`; checked against `-cpu help` when it could be read. Default: `host` with KVM, `max` on x86 otherwise, the target default on Arm. |
| `sockets`, `cores`, `threads` | Integers; the product is the CPU count (maximum 64). Without topology the CPU count becomes cores. |
| `memory`, `balloon` | 128 to 262144 MiB; virtio balloon device. |
| `cpuFlags` | Up to 24 `{ name, on }` entries, x86 only. Names must be in this QEMU build's own recognized CPUID flag list (from `-cpu help`), each listed once. Passed as `-cpu model,name=on` or `name=off`. |
| `firmwareImage` | Empty for the built-in firmware, or the name of a custom image in managed storage (`.fd`, `.bin` or `.rom`). BIOS machines and other targets boot it as `-bios`; UEFI machines use it as the read-only UEFI code image, with variables still started from the host's template. A missing file stops the start with a clear message. |
| `cloudInit` | `{ enabled, userData, networkConfig }`. When on, user-data (up to 32 KiB, plain text, not empty) and an optional network-config (up to 8 KiB) are written with generated meta-data to a `cidata` seed disc at every start, attached read-only on the media SCSI bus with no boot index. |
| `numa` | `{ nodes }`, 0 (off) or 2 to 8. Memory and virtual CPUs are split evenly: one `memory-backend-ram` and one `-numa node` per node, with contiguous CPU ranges and any remainder on the first nodes. Each node needs at least one virtual CPU and 64 MiB. |
| `disks` | 1 to 8 entries of `{id, name, sizeGiB 1..4096, bus virtio\|sata\|nvme\|scsi\|ide, format qcow2\|raw, cache none\|writeback\|writethrough, discard}`. IDE is x86 only, at most two. On Windows hosts `cache none` launches as `writethrough`, because QEMU for Windows cannot open images with O_DIRECT. |
| `cdroms` | 0 to 4 managed ISO names (replaces `iso`). |
| `network` | `{mode user\|none, model virtio\|e1000e\|e1000\|rtl8139, mac, forwards}`. The MAC (`52:54:00:xx:xx:xx`) is generated when missing. At most 16 forwards of `{proto, hostPort 1024..65535, guestPort 1..65535}`. |
| `display` | `{adapter virtio\|std\|qxl\|ramfb\|none}`. VNC stays on loopback. Default: `std` on x86, `virtio` on Arm. |
| `sound` | `none`, `hda` or `ac97`, on an audio backend that discards output so it works headless. |
| `usb` | `{tablet, keyboard}` on a `qemu-xhci` controller. Defaults: tablet on; keyboard on Arm only. |
| `serial`, `rng`, `bootMenu`, `autostart` | Booleans. Serial output goes to `serial.log` in the machine's private runtime directory. `autostart` starts the machine when the server starts. |
| `bootOrder` | A list of `cdrom`, `disk`, `net` (each at most once). Default `["cdrom","disk"]`. |

Behaviour worth knowing:

- Disk files live in managed storage. The first migrated disk keeps its historical name (`<machine id>.qcow2`). Other disks are `<machine id>-<disk id>.<format>`. Removing a disk from a machine only detaches it; its file stays on storage. Existing disks cannot change size or format through the edit endpoint; use the resize action.
- User-mode networking allows outbound connections (normal NAT). Records migrated from the older `network: "user"` keep their historical `restrict` setting (`network.restrict: true`), which blocks outbound traffic; new machines default to unrestricted. Forwards listen on all host interfaces, so they are reachable from the LAN when the host allows it.
- With UEFI, the per-machine variable store is a qcow2 copy of the firmware template (`OVMF_VARS.qcow2` in the runtime directory). It is qcow2 on purpose: QEMU cannot snapshot a running machine that has a writable raw flash device.
- TPM state lives in the runtime directory and persists. `swtpm` runs as a child process and ends with the machine.
- Firmware is discovered at start-up: standard OVMF locations on Linux and the `share` folder of the QEMU install on Windows. `GET /api/host` reports what was found.

`POST /api/machine-preview` (alias `POST /api/machines/preview`) returns the launch arguments with private paths, ports and sockets replaced by placeholders. It never starts anything.

## Host facts

`GET /api/host` returns `{qemuVersion, accelerators, targets, firmware: {uefi, secureBoot}, swtpm, cpuModels}`.

## Live actions

`POST /api/machines/:id/actions` with `{action}`:

- `start`, `pause`, `resume`, `reset`, `powerdown` (ACPI), `poweroff` (quit).
- `cd-change` with `iso` (managed ISO name) and optional `cdrom` index; `cd-eject` with optional `cdrom` index. The machine must have been started with that CD-ROM attached.
- `send-keys` with `keys`: `ctrl-alt-delete`, `ctrl-alt-backspace`, `ctrl-alt-f1` to `ctrl-alt-f7`, `print`, `escape`, `enter`, `tab`.
- `screenshot`: writes a PNG into the runtime directory. `GET /api/machines/:id/screenshot` serves the latest one with `Cache-Control: no-store`; while the machine runs, a request takes a fresh capture when the stored one is older than two seconds, which keeps dashboard thumbnails live. Live snapshot listings show each name once even when it exists on several disks.

The older `POST /api/machines/:id/action` (`start`, `pause`, `resume`, `shutdown`, `stop`, `reset`) and `/keys` routes keep working.

## Snapshots

Names match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` and must be unique per machine. Only qcow2 disks support snapshots; a machine with any raw disk is refused with a clear message.

- `GET /api/machines/:id/snapshots` lists them. A stopped machine reads the first disk with `qemu-img info`; a running machine asks the monitor for `info snapshots`.
- `POST /api/machines/:id/snapshots` with `{name}` creates one: `savevm` while running (RAM and disks), `qemu-img snapshot -c` on every disk while stopped (disks only).
- `POST /api/machines/:id/snapshots/:name/restore` (`loadvm` or `qemu-img snapshot -a`) and `DELETE /api/machines/:id/snapshots/:name`.

## Storage

- `GET /api/storage` returns every disk with actual and virtual bytes and snapshot count, every ISO with its attachments, and free and total space.
- `POST /api/storage/disks/resize` with `{machineId, diskId, sizeGiB}` only grows a disk of a stopped machine.
- `POST /api/machines/:id/clone` with `{name}` makes a stopped machine's full copy with `qemu-img convert -O qcow2`. The clone has no backing file, a new MAC, no autostart and no snapshots.
- `POST /api/storage/import` takes the raw image bytes as `application/octet-stream` (up to 64 GiB, streamed to a private temporary file). Query: `mode=machine` with `name`, `arch`, `memory`, `cpus`, or `mode=disk` with `machineId`, `diskName`, `bus`. The format (qcow2, raw, vmdk, vdi or vhdx) is detected from the content, never the file name, and anything that is not qcow2 is converted. Images with a backing file, an external data file or extents that point at other host files are refused.
- `DELETE /api/storage/isos/:name` refuses while any machine (including retained ones) has the ISO attached.

## Verification

The tests in `tests/hardware-config.test.mjs`, `tests/qemu-hardware.test.mjs` and `tests/hardware-api.test.mjs` cover validation, migration, every launch option, and, with QEMU and `qemu-img` on PATH, real UEFI and Secure Boot starts, live actions, screenshots, running and stopped snapshots, resize, clone and import. TPM start-up needs `swtpm` and is not exercised on hosts without it. Real-hardware acceleration (KVM) and guest operating-system boot are not covered.

## Guest CPU and memory

While a machine runs, the server measures its QEMU process every 5 seconds: on Linux (the container and the appliance) from `/proc/<pid>/stat` and `statm`, on Windows from one `Get-Process` query for the QEMU processes. CPU is shown as a share of the machine's own vCPUs, so 100% means all of them are busy; memory is the process's resident size, which includes QEMU itself. `/api/state` returns this as `usage` on each running machine with the last 30 CPU readings, and `guestUsageSupported` says whether the host platform is measured at all. The machine page shows it in the CPU and memory tiles and running machine cards show a one-line summary; other platforms show a plain note instead of a guess (evidence/guest-usage).

## Host hardware discovery

`GET /api/host` includes `hardware`. On Linux it is read only from `/sys` and `/proc`: whether an IOMMU is on and how many groups it has, reserved and free hugepages with their size and the transparent hugepage mode, whether VFIO is available, whether KVM allows nested virtualization, and whether AMD SEV, SEV-ES, SEV-SNP or Intel TDX are enabled in KVM or only advertised by the CPU. Nothing is changed or loaded. Inside a container only what the container can see is reported. Other platforms return `checked: false` with the reason. Settings > Host lists these facts.

## NUMA and CPU flags

The create form's CPU and memory section offers the number of NUMA nodes (only counts that leave each node a CPU and 64 MiB) and a list of CPU flags, each turned on or off, with this QEMU build's flag names suggested as you type. The server reports the recognized flag names in `GET /api/host` as `cpuFlags`. The machine page's Hardware tab lists both, and its Monitor tab's **Memory backends** question shows one backend per node. `tests/cpu-numa.test.mjs` checks the parsing, validation and arguments; `scripts/verify-cpu-numa.mjs` sets two nodes and turns AVX2 off through the form, starts the machine in QEMU, and reads back two 512 MiB backends and two CPUs on each node (evidence/cpu-numa).

## Custom firmware images

Storage has a **Firmware** tab for adding firmware files: `.fd`, `.bin` or `.rom`, at most 64 MiB, named with letters, digits, dots, dashes and underscores. Each file is written to a temporary name and then linked into the managed `firmware` folder, so an existing name is refused instead of overwritten. The list shows how many machines use each file, and a file in use cannot be deleted. The create form's System section offers the built-in firmware and every image; the launch preview shows the chosen one as `<firmware image name>`, and the machine page's Hardware tab lists it.

Endpoints: `GET /api/firmware` lists `{ images: [{ name, bytes, usedBy }] }`; `POST /api/firmware?name=…` takes the file as `application/octet-stream` and appears as a running job; `DELETE /api/firmware/{name}` removes an unused file.

`tests/firmware-images.test.mjs` checks names, the no-overwrite rule, deletion while in use, and the `-bios` argument. `scripts/verify-firmware-images.mjs` adds copies of QEMU's own SeaBIOS and OVMF code through the Firmware tab, then starts a BIOS machine and a UEFI machine in QEMU and reads their command lines: one boots the custom file as `-bios`, the other as its UEFI code (evidence/firmware-images).

## Cloud-init seed

Cloud images (Debian, Ubuntu and others, imported in Storage as a qcow2 or raw disk) configure themselves on first boot from cloud-init. The Boot and automation section has **Attach a cloud-init seed**, a user-data editor with an example to start from, and an optional network-config. At every start the server writes `cloud-init-seed.iso` in the machine's runtime folder: an ISO 9660 image with Joliet names and the volume label `cidata`, holding `user-data`, `network-config` when given, and `meta-data` with `instance-id` set to the machine ID and `local-hostname` made from its name. It is attached as a read-only CD on the media SCSI bus and is never a boot device. Because it is rebuilt at every start, edited user-data is on the disc the next time the machine starts; cloud-init itself applies most settings only once per instance ID.

Not offered: QEMU `-readconfig` files, because they would pass arbitrary QEMU configuration from the browser, which the server does not accept.

`tests/cloud-init.test.mjs` reads the image back (label, Joliet names, contents) and checks validation and the launch arguments. `scripts/verify-cloud-init.mjs` turns the seed on in the form, starts the machine in QEMU, reads the seed QEMU was given with 7-Zip, and boots a Debian kernel against it: Linux's `blkid` reports `LABEL="cidata" TYPE="iso9660"` and the mounted disc holds the machine's instance ID (evidence/cloud-init).

## SMBIOS UUID

Every machine passes `-uuid` to QEMU, so the guest sees the same SMBIOS UUID on every boot: the machine's own id unless a UUID is set under **Boot and automation** in the create form. A clone gets a new MAC address and goes back to its own id, so two machines never present the same identity.

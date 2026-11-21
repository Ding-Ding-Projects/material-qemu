# Supplied six-board control inventory

This inventory covers the controls in the supplied Main, Onboarding, Overview, Machines, NewMachine and Console boards. Repeated shell controls apply to every board where shown. A working implementation is not automatically a visual-parity or runtime-verification claim. Evidence records identify the exact verified source.

## Shared shell

| Supplied control | Current state and exact limit |
| --- | --- |
| Brand, version, update timestamp | Implemented; runtime build time is generated or explicitly unavailable. |
| Global search | Implemented for machine name, notes, folder, tags and architecture, with the field choice in the regex builder, and for disk images, ISO images and help articles in an Also found panel (scripts/verify-search-everywhere.mjs). |
| Adjacent full regex builder | Implemented beside the header search: flags, fields searched, token insert buttons, bounded length, live match count and error message, remembered per browser (scripts/verify-search.mjs). Explain, test bench with numbered and named groups, replace and split previews, a saved pattern library and a one-second worker time limit are implemented (scripts/verify-regex-tools.mjs). A step debugger, a comparison with PCRE, Python, .NET, Java and Go, code generation in six languages and local file search are implemented (scripts/verify-regex-tools.mjs). Executing other flavours' engines and replacing inside files remain pending. |
| Command palette shortcut and button | Implemented searchable real workflow commands and live theme/language/motion controls, from header and Ctrl+Shift+F, with its own regular expression search: flags, token buttons, status and explanation (scripts/verify-search-everywhere.mjs). |
| Notifications center | Implemented: bell with unread badge, panel with the last 50 notices, mark read and clear, Escape and focus return (scripts/verify-notifications.mjs). |
| Help | Implemented task-oriented runtime help and the published documentation site with guides, every article and wiki page (scripts/verify-site.mjs). |
| Owner identity | Implemented for one owner; multiple users remain pending. |
| Health/LAN indicator | Actual host connection shown; LAN reachability is not claimed. |
| Workspace tabs, close/pin, Open every tab, New tab catalog | Implemented for actual destinations, with persistent closes, new-destination offering, pin/close controls, keyboard navigation and a searchable catalog. Advanced groups/reordering and unfinished destinations remain pending. |
| Host/tool/advanced navigation destinations | Pending under the corresponding broader design boards; no inert command catalog substitutes for them. |
| Theme, language, reduced motion | Implemented dark/light/system and English/Cantonese/bilingual settings; earlier twelve-tuple evidence remains source-bound. Complete translation of backend diagnostics remains pending. |

## Main sign-in

| Supplied control | Current state and exact limit |
| --- | --- |
| Passkey sign-in | Implemented and previously verified with a virtual WebAuthn authenticator; physical devices unverified. |
| Password sign-in | Implemented with scrypt, sessions and origin/CSRF boundaries. |
| Username | Implemented exact owner-username/password matching with backwards-compatible saved owner names and no anonymous identity disclosure. Scope remains one owner. |
| Disable password sign-in | Implemented explicit Settings choice with registered-passkey prerequisite and fresh verified passkey for disable/re-enable. Saved password and existing sessions are preserved; no password-only recovery endpoint. New browser proof pending. |
| Five-attempt unlock ladder | Five-attempt/fifteen-minute cooldown and bounded in-flight verification implemented. Richer ladder/ticket recovery remains pending, not simulated. |
| Pre-auth language/theme buttons | Implemented browser-local controls; initial choices carry into new-owner setup. Existing account preferences apply after sign-in. |
| Target/accelerator/appliance release facts | Only actual discovered runtime facts shown; 29-target and appliance-OS claims are not made. |

## Onboarding

| Supplied control | Current state and exact limit |
| --- | --- |
| Owner account/passkey | Password owner setup implemented: the first account created becomes the owner; passkey registration lives in Settings, not the owner step. |
| Language | Implemented and persisted. |
| Hardware check | QEMU executable/version, host resources and, on Linux, read-only IOMMU, hugepages, VFIO, nested virtualization and SEV/TDX discovery, shown under Settings > Host. Other platforms say they are not checked. |
| Disk/NFS pool selection | Pending; current runtime uses its managed persistent volume and does not modify host partitions. |
| Pool name/filesystem/reflink settings | Pending; no formatting occurs. |
| Keep data/erase confirmation | Host disk erasure is not implemented or authorized by the runtime workflow. |
| Network bridge configuration | Pending; current guest network is disconnected or restricted user-mode networking. |
| ISO library | File discovery, authenticated streaming upload with bounds and no-overwrite, ISO deletion refused while attached, and the Storage page ISO tab. |
| First machine step | Implemented actual machine editor route inside onboarding, returning to final review after save. |
| Back/Next, save/resume, finish | Implemented, including persisted optional-step skipping and Save and finish later sign-out/resume. |

## Overview

| Supplied control | Current state and exact limit |
| --- | --- |
| Host CPU/memory/uptime | Actual bounded sampled history and CPU/memory charts implemented; host-visible versus container scope is explicit. No fabricated initial history. |
| Disk I/O and network rates | Explicitly unavailable; not simulated. |
| New machine | Implemented. |
| Machine import | Implemented end to end: Storage drop zone or file picker, format detected from content, converted to qcow2 (VMDK import checked in scripts/verify-browser-workflows.mjs). |
| State/architecture chips | Independent persisted Overview state/architecture filters implemented. |
| Machine console/start/pause/details | Implemented against real runtime. |
| Live thumbnails, guest CPU/RAM | Implemented: live console thumbnails on running cards, and per-guest CPU (share of its vCPUs) and resident memory measured from the QEMU process on Linux and Windows (evidence/guest-usage). |
| Recent activity | Persisted actual action history implemented. |
| Running jobs | Implemented on the Overview: uploads with byte progress, disk imports, resizes, clones and snapshots while they run, and finished or failed for ten minutes after (scripts/verify-jobs.mjs). |
| Appliance updates/pool health | Appliance updates implemented and verified from build 31 to build 32 (evidence/appliance-update). Storage pool health remains pending with pools. |

## Machines

| Supplied control | Current state and exact limit |
| --- | --- |
| All/Favourites/Running | Implemented; Paused/Stopped also available. |
| Needs attention/Recently used | Implemented from actual error state and last-use timestamps; recent means the last seven days, newest first. |
| Search, list/compact/cards, columns | Implemented text and regular expression search and three layouts. |
| Folder creation, rename/removal | Implemented; rename preserves machine and view assignments; removal explicitly retains machines in Unfiled. |
| Persisted collapsible folder groups | Implemented across cards/list/compact views, with rename/removal state preservation. |
| Drag to folder / Move to folder menu | Implemented: direct and bulk Move to folder, and dragging a card onto a folder group or chip (scripts/verify-bulk-and-drag.mjs). Running machines keep running. |
| Saved views and deletion | Implemented query/state/folder persistence and confirmed deletion. |
| Details panel and favourites | Implemented, including editable bounded tags. Firmware/network/snapshot details beyond supported hardware remain pending. |
| Bulk Start/Pause | Implemented with individual outcomes. |
| Bulk Snapshot/Shut down/Move/Delete | Implemented: Snapshot selected (one name, result per machine), graceful shutdown, move and confirmed record removal with retained disks. Permanent disk deletion stays a separate, per-disk Storage action. |
| Import | Implemented end to end (qcow2, raw, VMDK, VDI, VHDX; format detected from content, converted to qcow2). |

## New machine

| Supplied control | Current state and exact limit |
| --- | --- |
| Eight-step navigation | Implemented exact-step local draft resume, separate new/edit drafts, legacy migration and browser-safe Enter handling. |
| Presets | Blank, lightweight server and installed-platform Linux resource presets implemented. Windows/cloud-init/microvm/Raspberry Pi/retro/confidential presets retain specific unsupported reasons. |
| All system targets | Supplied 29-target catalog plus bounded PATH discovery implemented. Actual installed targets, incomplete discovery and unavailable recipes are distinguished. No claim that all targets are installed. |
| Machine type and accelerator | Binary-derived inventory and supported recipe selectors implemented. KVM eligibility is explicitly launch-unverified; other unsupported accelerators retain reasons. Final image launch acceptance pending. |
| CPU/memory | Implemented in the server and the create form: sockets, cores, threads, CPU model, up to 64 CPUs, up to 256 GiB, a balloon device, 2–8 NUMA nodes and individual CPU flags checked against the installed QEMU, verified by starting a machine in QEMU (scripts/verify-cpu-numa.mjs). |
| Firmware | Implemented in the server and the create form: BIOS or UEFI, Secure Boot and a swtpm TPM, discovered per host and verified with KVM in the appliance, and custom firmware images added in Storage and booted as -bios or as the UEFI code (scripts/verify-firmware-images.mjs). |
| Storage | Implemented in the server and the browser: up to eight disks (virtio, SATA, NVMe, SCSI, IDE; qcow2 or raw), up to four CD-ROMs, grow-only resize, full-copy clone and import. |
| Network | Implemented in the server and the create form: user mode with port forwards, NIC model and MAC, restricted user mode, or none. Bridges pending. |
| Display/devices | Implemented in the server and the create form: display adapter, sound, USB tablet and keyboard, serial log, RNG, boot order and boot menu. VNC stays loopback-private. |
| Name and UUID | Implemented: the guest sees a stable SMBIOS UUID (the machine id by default) that can be set in the create form; clones get a new one. |
| Start after creating | Implemented explicit opt-in, real QEMU startup and console navigation. Failed startup retains the saved machine and reports the actual error. |
| Readconfig/cloud image/cloud-init import | Cloud images import through Storage as qcow2 or raw disks. A cloud-init NoCloud seed (user-data, network-config, generated meta-data) is built at every start and read by Linux by its cidata label (scripts/verify-cloud-init.mjs). QEMU -readconfig files are deliberately not offered: browser-supplied QEMU configuration is not accepted. |
| Live command preview | Implemented using the same server-owned argument builder as execution, with labelled placeholders for private paths and ports. Preview executes nothing. |

## Console

| Supplied control | Current state and exact limit |
| --- | --- |
| Pause/resume/shutdown/force off | Implemented. Graceful ACPI outcome depends on the guest; forced stop waits for process exit. |
| Reset | Implemented visible confirmation and server-owned QMP command, with pause, resume, ACPI shutdown and power off checked against a real guest. |
| VNC | Actual authenticated noVNC connection implemented. |
| SPICE/D-Bus | Pending transports, never presented as supported. |
| Fit/scaling/fullscreen/reconnect | Implemented controls; complete native fullscreen/device acceptance pending. |
| Keyboard release | Implemented: the Guest input toggle and Ctrl+Alt pressed alone, without catching Ctrl+Alt+Del (scripts/verify-console-export.mjs). |
| Ctrl+Alt+Del | Implemented alongside Ctrl+Alt+F1/F2, Escape, Enter, Print Screen and system key in a bounded key menu. |
| Clipboard/type text | Implemented explicit user text transfer, with 256-character bound and truthful guest-support limitation. Guest acceptance remains unverified. |
| Media change/eject, USB redirection | Media change and eject implemented through QMP (Change CD). USB redirection pending. |
| Screenshot/record/drawing | Implemented: QEMU screenshot proven pixel-identical to the live framebuffer, bounded WebM recording, and annotation with separate original and annotated downloads (scripts/verify-console-export.mjs, scripts/verify-console-media.mjs). |
| Summary/hardware/snapshots/migrate/guest-agent/monitor/stats/log tabs | Overview (console, CPU and memory use, disks, snapshots and activity), Hardware (every saved setting), Monitor (thirteen read-only QEMU queries from a fixed server list) and Log (QEMU messages and the serial log tail) tabs are implemented and checked against a running QEMU machine (scripts/verify-machine-tabs.mjs). Migrate and guest-agent tabs remain pending. |
| Guest FPS/latency/CPU/RAM | Guest CPU and RAM measured from the QEMU process. Display FPS and latency pending; no sample values are shown. |

## Explicit preservation checkpoint

New implementation stopped at the owner's preservation/cleanup request. The latest verified active runtime is source `8e7802f38df82728a5db4fe58959be70f3a7bc09`. Later console-media/controller drafts are preserved but inactive and have no delivered export, recording, annotation or Ctrl+Alt controls. Every pending row above remains pending unless separately supported by an exact later source/image receipt. The full supplied-six objective and broader delivery are not complete.

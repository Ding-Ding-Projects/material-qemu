# Supplied six-board control inventory

This inventory covers the controls in the supplied Main, Onboarding, Overview, Machines, NewMachine and Console boards. Repeated shell controls apply to every board where shown. A working implementation is not automatically a visual-parity or runtime-verification claim. Evidence records identify the exact verified source.

## Shared shell

| Supplied control | Current state and exact limit |
| --- | --- |
| Brand, version, update timestamp | Implemented; runtime build time is generated or explicitly unavailable. |
| Global search | Implemented for machine name, notes, folder and architecture. Other product categories remain pending. |
| Adjacent full regex builder | Pending; no misleading placeholder is displayed. |
| Command palette shortcut and button | Shortcut currently focuses search; a command catalog and live controls remain pending. |
| Notifications center | Pending; transient action notifications exist, not the designed center. |
| Help | Implemented task-oriented runtime help; complete documentation delivery remains pending. |
| Owner identity | Implemented for one owner; multiple users remain pending. |
| Health/LAN indicator | Actual host connection shown; LAN reachability is not claimed. |
| Workspace tabs, close/pin, Open every tab, New tab catalog | Pending. Current navigation switches implemented routes without pretending to implement the complete tab contract. |
| Host/tool/advanced navigation destinations | Pending under the corresponding broader design boards; no inert command catalog substitutes for them. |
| Theme, language, reduced motion | Implemented dark/light/system and English/Cantonese/bilingual settings; earlier twelve-tuple evidence remains source-bound. Complete translation of backend diagnostics remains pending. |

## Main sign-in

| Supplied control | Current state and exact limit |
| --- | --- |
| Passkey sign-in | Implemented and previously verified with a virtual WebAuthn authenticator; physical devices unverified. |
| Password sign-in | Implemented with scrypt, sessions and origin/CSRF boundaries. |
| Username | Implemented exact owner-username/password matching with backwards-compatible saved owner names and no anonymous identity disclosure. Scope remains one owner. |
| Disable password sign-in | Pending; password recovery stays enabled. |
| Five-attempt unlock ladder | Five-attempt/fifteen-minute cooldown and bounded in-flight verification implemented. Richer ladder/ticket recovery remains pending, not simulated. |
| Pre-auth language/theme buttons | Implemented browser-local controls; initial choices carry into new-owner setup. Existing account preferences apply after sign-in. |
| Target/accelerator/appliance release facts | Only actual discovered runtime facts shown; 29-target and appliance-OS claims are not made. |

## Onboarding

| Supplied control | Current state and exact limit |
| --- | --- |
| Owner account/passkey | Password owner setup implemented with protected setup authorization; passkey registration lives in Settings, not the owner step. |
| Language | Implemented and persisted. |
| Hardware check | QEMU executable/version and host resources implemented; IOMMU, hugepages, VFIO and confidential-computing discovery pending. |
| Disk/NFS pool selection | Pending; current runtime uses its managed persistent volume and does not modify host partitions. |
| Pool name/filesystem/reflink settings | Pending; no formatting occurs. |
| Keep data/erase confirmation | Host disk erasure is not implemented or authorized by the runtime workflow. |
| Network bridge configuration | Pending; current guest network is disconnected or restricted user-mode networking. |
| ISO library | File discovery implemented; authenticated streaming import added with bounds, no-overwrite and cleanup tests. New browser proof pending. |
| First machine step | Implemented actual machine editor route inside onboarding, returning to final review after save. |
| Back/Next, save/resume, finish | Implemented, including persisted optional-step skipping and Save and finish later sign-out/resume. |

## Overview

| Supplied control | Current state and exact limit |
| --- | --- |
| Host CPU/memory/uptime | Actual bounded sampled history and CPU/memory charts implemented; host-visible versus container scope is explicit. No fabricated initial history. |
| Disk I/O and network rates | Explicitly unavailable; not simulated. |
| New machine | Implemented. |
| Machine import | Pending. |
| State/architecture chips | Independent persisted Overview state/architecture filters implemented. |
| Machine console/start/pause/details | Implemented against real runtime. |
| Live thumbnails, guest CPU/RAM | Pending guest measurement and framebuffer preview integration. |
| Recent activity | Persisted actual action history implemented. |
| Running jobs | Pending background-job product model. |
| Appliance updates/pool health | Pending; no appliance release or pool-health claim is made. |

## Machines

| Supplied control | Current state and exact limit |
| --- | --- |
| All/Favourites/Running | Implemented; Paused/Stopped also available. |
| Needs attention/Recently used | Implemented from actual error state and last-use timestamps; recent means the last seven days, newest first. |
| Search, list/compact/cards, columns | Implemented text search and three layouts. Full regex builder pending. |
| Folder creation, rename/removal | Implemented; rename preserves machine and view assignments; removal explicitly retains machines in Unfiled. |
| Persisted collapsible folder groups | Implemented across cards/list/compact views, with rename/removal state preservation. |
| Drag to folder / Move to folder menu | Direct and bulk Move to folder controls implemented, preserving running state; drag-and-drop remains pending. |
| Saved views and deletion | Implemented query/state/folder persistence and confirmed deletion. |
| Details panel and favourites | Implemented, including editable bounded tags. Firmware/network/snapshot details beyond supported hardware remain pending. |
| Bulk Start/Pause | Implemented with individual outcomes. |
| Bulk Snapshot/Shut down/Move/Delete | Move, graceful shutdown and confirmed record removal implemented with individual outcomes and retained disks. Snapshot remains pending; permanent disk deletion is not offered. |
| Import | Pending. |

## New machine

| Supplied control | Current state and exact limit |
| --- | --- |
| Eight-step navigation | Implemented exact-step local draft resume, separate new/edit drafts, legacy migration and browser-safe Enter handling. |
| Presets | Blank, lightweight server and installed-platform Linux resource presets implemented. Windows/cloud-init/microvm/Raspberry Pi/retro/confidential presets retain specific unsupported reasons. |
| All system targets | Supplied 29-target catalog plus bounded PATH discovery implemented. Actual installed targets, incomplete discovery and unavailable recipes are distinguished. No claim that all targets are installed. |
| Machine type and accelerator | Binary-derived inventory and supported recipe selectors implemented. KVM eligibility is explicitly launch-unverified; other unsupported accelerators retain reasons. Final image launch acceptance pending. |
| CPU/memory | Bounded actual allocations implemented; topology/NUMA/flags pending. |
| Firmware | Fixed supported SeaBIOS/UEFI paths; Secure Boot, TPM and custom firmware pending. |
| Storage | One managed QCOW2 disk, capacity and ISO selection implemented. Advanced devices, formats and resize pending. |
| Network | Disconnected/restricted user mode implemented; bridges, forwarding and custom NICs pending. |
| Display/devices | Authenticated VNC with platform defaults; selectable display/audio/USB devices pending. |
| Name and UUID | Name implemented; UUID generated server-side. User override pending. |
| Start after creating | Implemented explicit opt-in, real QEMU startup and console navigation. Failed startup retains the saved machine and reports the actual error. |
| Readconfig/cloud image/cloud-init import | Pending. Browser-supplied arbitrary command strings are not accepted. |
| Live command preview | Implemented using the same server-owned argument builder as execution, with labelled placeholders for private paths and ports. Preview executes nothing. |

## Console

| Supplied control | Current state and exact limit |
| --- | --- |
| Pause/resume/shutdown/force off | Implemented. Graceful ACPI outcome depends on the guest; forced stop waits for process exit. |
| Reset | Implemented visible confirmation and server-owned QMP command; newer browser acceptance pending. |
| VNC | Actual authenticated noVNC connection implemented. |
| SPICE/D-Bus | Pending transports, never presented as supported. |
| Fit/scaling/fullscreen/reconnect | Implemented controls; complete native fullscreen/device acceptance pending. |
| Keyboard release | Persistent view-only toggle with visible state and aria-pressed implemented; designed Ctrl+Alt release shortcut pending. |
| Ctrl+Alt+Del | Implemented alongside Ctrl+Alt+F1/F2, Escape, Enter, Print Screen and system key in a bounded key menu. |
| Clipboard/type text | Implemented explicit user text transfer, with 256-character bound and truthful guest-support limitation. Guest acceptance remains unverified. |
| Media change/eject, USB redirection | Pending. |
| Screenshot/record/drawing | Pending. Runtime evidence capture is independent of these product features. |
| Summary/hardware/snapshots/migrate/guest-agent/monitor/stats/log tabs | Pending broader board implementations. |
| Guest FPS/latency/CPU/RAM | Pending real measurements; no sample values are displayed. |

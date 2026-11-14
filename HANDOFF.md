# Implementation handoff

## Delivered source

The six initial workflows now connect to a real authenticated runtime: owner sign-in, saved onboarding, live host overview, machine organization, an eight-step machine editor and authenticated noVNC console. Existing design references remain unchanged. Six readable supplied templates and original-export provenance are retained under `design/imports`.

## Verified evidence

Candidate `e26461e387774b7ba47e294ef498a7e15b97440a`, image `sha256:7ec6a3b1d964112cda302a921ef57d8bf9f134d0b6151885fb2eb8d5a9b16658`, passed six focused container tests. An independent Linux Chromium review exercised actual owner setup, saved onboarding, all eight machine-creation steps, real x86_64 QEMU start, live noVNC display, pause, resume and process stop. Body overflow checks passed at 360 and 1440 pixels with zero page exceptions. The console displayed genuine SeaBIOS on a blank disk, not an installed guest OS.

The subsequent storage-preservation patch is a newer candidate and must retain separate test/build evidence. It moves staged runtime data outside generated output and rejects rebuilding legacy embedded data. No earlier capture is proof for changed source until independently reviewed.

## Remaining acceptance gaps

Within the six workflows, physical passkey registration/authentication, aarch64 guest boot, guest OS installation, guest ACPI shutdown handling, full keyboard/fullscreen interaction, every localization tuple, visual design parity, exhaustive narrow-screen action parity, saved-view deletion and richer folder management remain unverified or incomplete. Host disk/network throughput, guest CPU metrics and thumbnail previews are explicitly unavailable, not simulated.

The other 50 boards, complete required-feature inventory, full regex tools, native onboarding companions, appliance operating-system images, USB installer, portable build/hosting assistants, registry publication, LAN delivery and hosted documentation remain unfinished. Native installer entrypoint exits nonzero honestly. Fresh-machine bootstrap is not fully verified and missing Docker acquisition is not yet implemented.

## Coordination

Task record: https://github.com/Ding-Ding-Projects/material-qemu/issues/1

The coordinating reviewer owns final image verification, evidence promotion, README captures, remote integration and publication. Source changes alone do not claim a release.

## Organization completion pass

Added saved-view deletion, folder rename and explicitly confirmed removal to Unfiled. Rename preserves machine assignments and saved folder filters; removal preserves every machine and disk. Negative tests reject invalid names, collisions, stale references and incorrect confirmation atomically. Saved views now persist the folder filter as well as query and state. Filter/layout/status/review labels are localized, singular counts are corrected, and dialog focus restoration/Enter handling are implemented. Browser acceptance of this newer source remains pending.

The coordinating browser review also verified candidate 224048a with an actual virtual WebAuthn authenticator, real lifecycle/console, twelve language/theme/width combinations and preference persistence. Physical authenticators remain unverified. Earlier evidence is not relabelled to this organization pass.

## ISO import unit

Authenticated ISO import now streams directly into exclusive managed temporary files, confirms actual length and finalizes without overwrite. Two concurrent uploads, 2 GiB per file and a fifteen-minute deadline bound the route. Unit and real HTTP tests cover unauthorized/wrong-origin/CSRF requests, duplicate collisions, overflow, truncated streams, abort cleanup and directory-symlink escape. Browser acceptance of this newer unit remains pending. See the complete six-board control inventory for every known residual.

## Console and presentation unit

Pinned local Roboto Flex and rounded symbol fonts replace generic font/glyph fallbacks; licenses are retained. Narrow notifications reserve layout space and can be dismissed. Console scaling and input show persistent actual state. Reset confirmation, expanded key sequences and explicit clipboard/type-text controls are implemented without claiming guest acceptance. This newer candidate still needs independent browser verification.

## Creation and filtering unit

The machine editor now displays a server-generated launch plan using the same fixed argument builder as execution. Placeholders are explicit and the preview never starts a process. Optional Start after creating performs actual startup, opens the console on success and retains the machine with a truthful error on startup failure. Needs attention/Recently used filters and direct/bulk folder moves are implemented. Unit tests cover argument boundaries and filter semantics; a container-only HTTP test covers inert preview, real immediate startup and moves while running. New browser proof remains pending.

## Capability discovery unit

Binary-derived machine/accelerator discovery now unions the supplied catalog with bounded PATH discovery. Supported PC/q35 and Arm virt recipes are separated from discovered unsupported boards. Version-success/capability-failure states remain honestly installed but incomplete. KVM device access only establishes labelled eligibility, never verified acceleration. The container adds Arm firmware for real i386/arm/aarch64 launch checks; final image results are still pending at this source checkpoint. Native tests pass sixteen cases and skip three runtime-dependent cases because QEMU is absent from this host.

## Onboarding and draft unit

Exact-step new/edit drafts, backwards-compatible draft loading, explicit onboarding skips, save/sign-out/resume, real first-machine creation from onboarding and pre-auth language/theme choices are implemented. Initial browser choices carry into owner setup without persisting credentials. Native unit/API tests pass eighteen cases with three QEMU-dependent skips; newer browser proof remains pending. The preceding capability image independently passed all twenty-three container tests, including actual x86_64/i386/aarch64/arm default-recipe launch/status/stop.

## Media boundary repair

Installation media now has an explicit raw/read-only virtual SCSI CD backend on all supported platforms, preventing uploaded headers from selecting another storage format. The launch-plan regression rejects the old implicit CD path. The per-platform runtime regression uses harmless blank CD bytes; no hostile media is generated. HTTP upload and JSON deadlines are explicit, and successful file storage is reported separately from an activity-write warning. Native tests pass eighteen with three runtime-dependent skips; exact-image verification follows.

## Main authentication unit

Password sign-in now requires the owner username. Existing accounts without a username field retain their saved owner name; anonymous metadata does not disclose it. Five unsuccessful attempts impose fifteen minutes of cooldown, with two in-flight checks maximum and no concurrent sixth attempt while the fifth is pending. Focused limiter and HTTP migration/authentication checks pass; the new username field needs the updated browser journey. This remains a single-owner runtime, and password-disable settings remain pending.

## Overview sampling unit

The backend collects actual resource samples every two seconds into a ninety-point ring. Overview renders CPU/memory history only after two valid samples, exposes host-visible/container scope and retains last-known warnings without fabricated replacements. Independent state/architecture filters persist in account settings. Sampling, chart-coordinate and persistence tests pass; newer browser acceptance remains pending. Resource collection was extracted from QEMU process management into its own module.

## Retained-disk lifecycle unit

Single/bulk confirmed record removal archives definitions and retains disks. Running/paused machines are rejected, and restoration checks the managed disk before returning a stopped definition. Bulk graceful ACPI shutdown, bounded tags and persisted collapsible folder groups are implemented. Unit tests cover reload, negative confirmations, tags and folder state; real HTTP tests compare disk bytes around removal/restoration. New exact-image/browser proof remains pending. No permanent disk deletion is introduced.

## Password-mode and provenance unit

Password disable/re-enable requires a registered passkey and fresh successful passkey authentication. Saved credentials and existing sessions remain intact; direct password-only setting changes and disabled password login are rejected. No unauthenticated recovery route exists. Build provenance is visible in the header at narrow widths and formats the actual timestamp in browser-local time with seconds/zone. Unit and negative HTTP tests pass; actual virtual-authenticator toggle/re-enable browser proof is still pending.

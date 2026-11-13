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

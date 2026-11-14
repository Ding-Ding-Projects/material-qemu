# Implementation handoff

## Current objective and stop state

Implement the supplied six Material QEMU boards as real workflows while preserving the broader design contract. The owner has now explicitly requested preservation and cleanup. New implementation has stopped. The full supplied design is not complete.

The active runtime's latest built source is `8e7802f38df82728a5db4fe58959be70f3a7bc09`, image `sha256:dc1ce0d8c5b43858a97b49ce91316169ff8cef522da142d780bc377f8966d182`. The generated runtime receipt reports that source with `dirty: false` and build time `2026-11-14T00:41:44.620Z`. Later preservation changes contain inactive console-export work only and must not be relabelled as a new verified image.

## Implemented and verified core

- Owner username/password authentication, protected first-owner setup, five-attempt cooldown, bounded verification concurrency, virtual-authenticator passkey registration/sign-in, and fresh-passkey-only password disable/re-enable. Existing credentials and sessions are preserved.
- Persistent onboarding with save-later/resume, explicit optional-step skips, real first-machine creation, exact-step new/edit drafts, and browser-local pre-auth language/theme controls.
- Real QEMU discovery and supported x86_64, i386, aarch64 and arm recipes; server-generated launch preview; optional immediate startup; private QMP and authenticated noVNC; lifecycle controls and bounded text/key actions.
- Authenticated streamed ISO import with size/concurrency/time limits, no-overwrite finalization, symlink containment, abort cleanup, explicit raw/read-only CD format and truthful audit-warning handling.
- Folders, saved views, tags, filters, persistent collapsed groups, bulk graceful requests, stopped-only record removal retaining disk bytes, and restoration of retained definitions.
- Actual bounded CPU/memory sample history with explicit measurement scope, independently persisted Overview filters, locally packaged licensed fonts/icons, visible build provenance and dismissible narrow-screen status.
- Persistent implemented-destination tabs, close/pin/Open every tab, New tab catalog, actionable command palette and live palette settings. Startup preserves deliberately closed Overview, and live polling preserves interactive focus.

## Evidence boundaries

| Source | Evidence |
| --- | --- |
| `fe05e2ce6baa119345822bdbd1a1832f7a72298a` | 38 exact-image tests passed. Independent browser proof exercised fresh virtual-passkey disable/sign-in/re-enable, retained sessions and 360 px build provenance. |
| `8d8e3c896241722b8d3c6e6cd24a312924cdbbcf` | 34 exact-image tests passed, including actual running-removal rejection and unchanged disk bytes around removal/restoration. Independent UI proof covered tags, collapse and restoration. |
| `3e2e033015c4ad5a3cee5fe844eb730584f50b7e` | 31 exact-image tests passed. Focused browser proof verified actual sample growth, chart rendering, filter persistence and narrow layout. |
| `15d82fd68493ae7e77c8b90ec2991919f47f477b` | 44 exact-image tests passed. Independent navigation reproduction proved closed Overview remains closed after reload. |
| `8e7802f38df82728a5db4fe58959be70f3a7bc09` | Seven focused workspace/focus tests passed. The exact updated browser reproduction passed every navigation assertion plus the 5.5-second live-refresh focus assertion, with zero page exceptions. The entire older suite was not rerun for this frontend-only repair. The coordinating final browser run also passed the current full journey, credentials, onboarding/draft resume, ISO transfer, i386 selection, immediate startup, console/lifecycle, organization, local fonts, cooldown and its twelve display tuples. Current screenshots were independently inspected. |

All four supported default platforms have passed real blank-machine QMP launch/status/stop tests, including harmless blank raw-CD fixtures. This does not prove an installed guest operating system boots. Prior twelve-tuple language/theme/width results remain bound to their actual source. Do not silently transfer screenshots or results to newer revisions.

The source README and `evidence/` are managed by the coordinating reviewer. Operational screenshots containing host-specific metrics remain private unless independently approved. The wiki is enabled but its supported repository is uninitialized; the coordinating reviewer owns prepared pending wiki content and its publication status.

## Preserved unfinished work

`public/console-media.js` and `public/console-tools.js` contain bounded framebuffer export, recording and annotation drafts. They are not imported by the application, have no activated controls and have not passed real browser export/recording/annotation acceptance. Both parse successfully, and two media-boundary unit tests pass. Their partial controller, connection lifecycle, unsaved-export handling, actual output validation and Ctrl+Alt integration still require completion. No export capability is claimed from these files.

The complete control inventory is [design coverage](docs/features/design-coverage.md). Remaining work includes full regex-builder parity, advanced tab behavior, unfinished hardware/firmware/storage/network controls, snapshots/migration and other listed destinations, physical authenticators, installed guest OS and actual KVM acceptance, complete latest-source visual parity, registry/LAN delivery, complete hosted documentation, appliance images, USB/native installers and portable companions. The other 50 boards remain incomplete. Installer entrypoints report a nonzero incomplete result honestly.

## Ownership and next steps

The implementation lane used only the primary checkout and `main`; it created no linked checkout, task branch or stash. Its two isolated navigation-proof fixtures were removed after identity checks, and no implementation-owned process or build remains active. The coordinating session owns final source push, remote proof, evidence/wiki preservation and cleanup. No deletion or publication is authorized or performed by this lane during the preservation handoff.

Next session: verify the preserved source and remote state, read the coverage inventory, complete the inactive console unit in a bounded pass, then independently verify actual outputs before marking any item delivered. Preserve existing runtime data and earlier evidence.

Task record: https://github.com/Ding-Ding-Projects/material-qemu/issues/1

## Preservation closeout

Implementation stopped at the owner’s explicit preservation request. Inactive console drafts remain preserved without activation. Current inspected runtime evidence is under `evidence/8e7802f/`; complete prepared wiki pages and navigation are under `docs/wiki/pending/`, with publication awaiting wiki initialization.

The [public screenshot gallery](https://ding-ding-projects.github.io/material-qemu-gallery/) is live and its nine images were hash-verified. Search/filter behavior, empty-state/Escape, 360/1440 layouts and zero page exceptions were independently checked. The source README contains the direct gallery backlink. See `CLOSEOUT_PROMPT.md` for the complete continuation state and the task Discussion for final remote readbacks.

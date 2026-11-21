# Interface (Material Design 3 Expressive)

The browser app is a plain ES-module client in `public/` with no build step and no network dependencies. Fonts and icons are served locally.

## Design system

- `md3-color.js` turns a seed colour into tonal palettes and every colour role for light and dark. Tones are exact in relative luminance, and `tests/md3-color.test.mjs` checks that all text role pairs meet 4.5:1 across several seeds. Roles are written as CSS custom properties on the root element (`--primary`, `--surface-container-high`, and so on) when the seed or theme changes.
- Shapes use 12, 16, 20 and 28 px corners and pills. Type is Roboto Flex. Motion tokens (`--ease-emphasized`, `--ease-spring`, `--dur-*`) drive staggered entrances, gauge sweeps, press ripples and view transitions.
- Motion stops when the operating system asks for reduced motion or the in-app Interface motion setting is off. The View Transitions API is used when available and can be turned off in Settings.
- Under 760 px the navigation rail becomes a bottom bar and the New machine button floats above it. Nothing is removed at narrow widths.

## Screens

Dashboard (host gauges, machines with live thumbnails, activity, quick start), Machines (filter chips, folders, saved views, bulk actions, cards, list and compact layouts), New machine (presets and six hardware sections with a server-generated launch preview), Machine (console toolbar, power controls, snapshots), Storage (upload, disk and ISO tabs), Settings (colour seed, theme, language, motion, passkeys, host facts) and a split sign-in screen. Workspace tabs, the command palette (Ctrl+Shift+F), search, onboarding and the Overview charts are kept.

## Server dependencies and graceful degradation

Newer endpoints (`/api/host`, snapshots, `/api/storage`, resize, clone, `send-keys`, `cd-change`, screenshots, storage import and ISO deletion) are called through a helper that treats 404, 405 and 501 as "not available yet". The affected control shows a plain message, and the rest of the screen keeps working against an older server. Without `/api/host`, UEFI, Secure Boot and TPM are shown disabled with the reason. Without v2 machine support the create form sends the old field set.

## Two-key confirmation

Powering off, removing machines, restoring or deleting a snapshot and deleting an ISO use `confirm-gate.js` (state machine) and `confirm-ui.js`. Two independent key toggles unlock a full-range slider. Sliding shows progress, completion plays its own animation, Emergency exit and Escape cancel, and focus returns to the trigger.

## Verification

`npm test` covers the colour roles, the gate state machine and form serialization. Evidence images in `evidence/lang-gui-remake/` were captured from the real client served by the real server (sign-in and onboarding) and from the same client with mocked API responses (every other screen), because QEMU is not present on the development host. They are not proof of a running guest.

# Console controls and local presentation

The browser uses locally packaged noVNC over an authenticated WebSocket. Scaling and guest-input toggles show their current state in text and `aria-pressed`, persist in browser storage and are reapplied when connecting or reconnecting. The input toggle maps directly to noVNC view-only mode.

Reset opens an explicit warning before issuing the server-owned QMP reset command. The key menu accepts only the implemented key sequences; it cannot submit arbitrary QMP commands. Text typing sends up to 256 characters to the current guest focus through noVNC key events. Clipboard text is explicitly supplied by the user and passed to the guest transport without automatically reading the browser clipboard. Guest clipboard integration and keyboard layout affect acceptance, so the UI reports transmission rather than claiming insertion into a guest application.

On narrow screens the dismissible polite status region participates in layout above the header. It reserves its height rather than obscuring machine controls. Desktop notifications retain their bounded toast duration.

Roboto Flex and Material Symbols Rounded are pinned in the package lockfile and served from local installed packages. Their SIL Open Font License texts are retained under `docs/licenses`. No remote font request is part of the runtime.

Build provenance stays visible in the initial authenticated header at narrow widths. It formats the actual build metadata in the browser timezone with seconds and an explicit zone/offset. Missing or invalid metadata remains unavailable; the current clock is never substituted for a build time.

## Screenshots and releasing input

**Screenshot** downloads a PNG taken by QEMU itself (QMP `screendump`), not a copy of the browser canvas. `scripts/verify-console-export.mjs` decodes that PNG and compares it with the live framebuffer the viewer draws: on a 1280 by 800 UEFI screen every pixel matched (evidence/console/console-export.json).

While guest input is on, the keyboard and mouse go to the guest. Pressing **Ctrl and Alt together and letting go**, with no other key, hands them back, the same idea as a hypervisor host key, and a notice says how to capture them again with **Guest input**. Combinations such as Ctrl+Alt+Del or Ctrl+Alt+F2 are sent to the guest as usual.

## Recording and annotating

**Record** captures the live framebuffer the viewer draws (no audio) into a WebM clip at 10 frames per second. Press it again (**Stop recording**) to finish; a recording also stops by itself after 30 seconds or 16 MiB. The status line shows the elapsed time and size, and **Download recording** saves the clip. A clip that has not been downloaded is not thrown away silently: signing out or leaving the page asks first. Browsers without `MediaRecorder` or canvas capture get a plain message and nothing starts.

**Annotate** freezes the current frame in an editor where you can draw with the pointer, or add lines and text from the keyboard fields, then undo or clear. **Download original PNG** saves the untouched frame and **Download annotated PNG** saves the marked-up copy under a separate name; the guest display is never changed. Unsaved annotations get the same warning as an undownloaded clip.

`scripts/verify-console-media.mjs` checks all of this in headless Edge on a running guest (evidence/console-media).

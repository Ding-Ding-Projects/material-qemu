# Console controls and local presentation

The browser uses locally packaged noVNC over an authenticated WebSocket. Scaling and guest-input toggles show their current state in text and `aria-pressed`, persist in browser storage and are reapplied when connecting or reconnecting. The input toggle maps directly to noVNC view-only mode.

Reset opens an explicit warning before issuing the server-owned QMP reset command. The key menu accepts only the implemented key sequences; it cannot submit arbitrary QMP commands. Text typing sends up to 256 characters to the current guest focus through noVNC key events. Clipboard text is explicitly supplied by the user and passed to the guest transport without automatically reading the browser clipboard. Guest clipboard integration and keyboard layout affect acceptance, so the UI reports transmission rather than claiming insertion into a guest application.

On narrow screens the dismissible polite status region participates in layout above the header. It reserves its height rather than obscuring machine controls. Desktop notifications retain their bounded toast duration.

Roboto Flex and Material Symbols Rounded are pinned in the package lockfile and served from local installed packages. Their SIL Open Font License texts are retained under `docs/licenses`. No remote font request is part of the runtime.

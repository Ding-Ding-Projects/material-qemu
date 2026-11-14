# Workspace tabs and command palette

Every implemented destination starts open on first use. Opening an existing destination focuses its existing tab. Explicitly closed tabs stay closed across reload, newly introduced destinations are offered automatically, and Open every tab reopens available destinations. Overview starts pinned; a pinned tab must be unpinned before closing, and one tab remains open so navigation never disappears.

The New tab catalog searches actual implemented destinations, settings and workflow controls. Unsupported states have explicit reasons, such as registering a passkey before changing password sign-in. The command palette opens from the header or Ctrl+Shift+F and routes to the real control, including its normal confirmations. Theme, language and motion controls inside the palette apply and persist through the same settings consumer.

Tabs support arrow keys, Home/End, accessible selection state, close/pin controls and a horizontally scrollable narrow layout. Machine drafts are saved when navigating away. The catalog's search is independent from machine search and uses plain text. Full regex construction, advanced tab grouping/reordering and destinations belonging to unfinished design boards remain pending; this catalog does not present those as implemented.


Source: [docs/features/workspace.md](https://github.com/Ding-Ding-Projects/material-qemu/blob/2a273d914f9d4a0c4f61be13d391a9011fc38f42/docs/features/workspace.md).

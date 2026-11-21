# Workspace tabs and command palette

Every implemented destination starts open on first use. Opening an existing destination focuses its existing tab. Explicitly closed tabs stay closed across reload, newly introduced destinations are offered automatically, and Open every tab reopens available destinations. Overview starts pinned; a pinned tab must be unpinned before closing, and one tab remains open so navigation never disappears.

The New tab catalog searches actual implemented destinations, settings and workflow controls. Unsupported states have explicit reasons, such as registering a passkey before changing password sign-in. The command palette opens from the header or Ctrl+Shift+F and routes to the real control, including its normal confirmations. Theme, language and motion controls inside the palette apply and persist through the same settings consumer.

Tabs support arrow keys, Home/End, accessible selection state, close/pin controls and a horizontally scrollable narrow layout. Machine drafts are saved when navigating away. The catalog's search is independent from machine search and uses plain text. Full regex construction, advanced tab grouping/reordering and destinations belonging to unfinished design boards remain pending; this catalog does not present those as implemented.

## Search and the regular expression builder

The search box in the header filters machines by name, notes, folder, tags and architecture. The **.\*** button beside it switches to regular expression search and opens a builder under the header: flags (ignore case, multiline, dot matches newline), which fields are searched, insert buttons for common tokens (digit, word, space, any, repeats, alternatives, anchors, groups and sets) and a status line that says how many machines match or why a pattern is not valid. Patterns are limited to 200 characters, an invalid pattern filters nothing out silently, and the choice is remembered in this browser. `scripts/verify-search.mjs` checks this in headless Edge (evidence/search).

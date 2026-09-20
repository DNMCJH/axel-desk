# Axel Desk

A local-first dashboard for Obsidian. It turns notes already in your Vault into a practical home screen without accounts, telemetry, remote APIs, or bundled content.

## Public templates

- **General workspace** — tasks, calendar, active workstreams, recent notes, output rhythm, local image gallery, pinned note, scratchpad, and reusable assets.
- **Computer study** — code-language profile, unresolved concept debt, review queue, and recent technical notes.

This public repository intentionally contains only reusable general and computer-study functionality.

## Highlights

- Reads only the current Vault and never connects to a remote service.
- Detects common folder layouts on first run; every path remains editable.
- Every card can be enabled, disabled, and reordered.
- Checkable dashboard rows move to a reversible Desk recycle bin; source files are not deleted or edited.
- Recycle-bin items auto-archive after 30 days by default (7/30/90/never options).
- Gallery supports any folder inside the current Vault, empty-folder creation, paging, automatic rotation, pause, previous, and next.
- Narrow Obsidian panes collapse correctly based on pane width rather than window width.

## Install

1. Download `axel-desk-x.y.z.zip`.
2. Extract it into `<vault>/.obsidian/plugins/`.
3. Confirm the file path is `<vault>/.obsidian/plugins/axel-desk/main.js`.
4. Enable **Axel Desk** under Obsidian → Settings → Community plugins.

## Development

```bash
npm install
npm run build
npm test
npm run pack
```

The distributable archive contains `main.js`, `manifest.json`, `styles.css`, README, agent guidance, and the MIT license under one `axel-desk/` directory.

## Data and deletion policy

Closing or archiving a dashboard item only changes Axel Desk's local display state. It does not delete, move, rename, or edit the source note. File deletion is deliberately not exposed by this plugin.

## License

MIT

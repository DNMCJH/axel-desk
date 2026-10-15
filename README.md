# Axel Desk

[English](README.md) | [简体中文](README_CN.md)

Current source version: **0.2.0-rc.7**. This is a release candidate; updating the source branch does not create a GitHub Release.

A local-first dashboard for Obsidian. It turns notes already in your Vault into a practical home screen without accounts, telemetry, remote APIs, or bundled content.

## Public templates

- **General workspace** — tasks, calendar, active workstreams, recent notes, output rhythm, local image gallery, pinned note, scratchpad, and reusable assets.
- **Computer study** — code-language profile, unresolved concept debt, review queue, and recent technical notes.

This public repository intentionally contains only reusable general and computer-study functionality.

## Highlights

- Reads only the current Vault and never connects to a remote service.
- Starts without assumed project/inbox paths; choose the folders that fit your Vault.
- Cards can be enabled, disabled, and reordered; the enabled slideshow stays below the header.
- Checkable dashboard rows move to a reversible Desk recycle bin; source files are not deleted or edited.
- Recycle-bin items auto-archive after 30 days by default (7/30/90/never options).
- Gallery supports any folder inside the current Vault, empty-folder creation, paging, automatic rotation, pause, previous, and next.
- Narrow Obsidian panes collapse correctly based on pane width rather than window width.

## Images

Choose a local Vault image folder in settings. The plugin neither downloads pictures nor includes the author's personal reference images. Supply your own images or images you have permission to use.

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

## Personal task board

The image area defaults to a single-image banner immediately below the page header, outside the card grid. It follows the local reference's panoramic composition and overlay navigation. The optional multi-image grid remains a regular card. Slideshow navigation updates only the picture region. Quick actions no longer inject Git or terminal plugin commands: unconfigured or missing folders do not produce entries. Local reference pictures are not bundled in the distributable archive.

The task card has two sections: explicitly curated personal tasks and files containing open Markdown checkboxes. File rows show the full filename, Vault-relative path and uncapped open-checkbox count; historical/template sources are excluded. Counts are not inferred commitments or deadlines. Remove either kind of row into the existing Desk recycle bin and restore it when needed. Removing a file does not edit, complete or delete its source tasks. Removed file rows stay hidden after source edits until explicitly restored. Personal tasks are stored in this Vault's plugin settings and support add/edit/complete/reopen.

Background redraws wait while the scratchpad or personal-task entry is focused, including IME composition. This preserves the existing editor while gallery/data changes are pending.

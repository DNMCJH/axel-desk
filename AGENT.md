# Axel Desk — Agent Setup Guide

## Scope

This public build contains only the general workspace and computer-study templates.

## Install

Extract the archive into `<vault>/.obsidian/plugins/` so the final path is:

```text
<vault>/.obsidian/plugins/axel-desk/main.js
```

Then ask the user to enable **Axel Desk** in Community plugins. Do not reload or restart Obsidian without explicit user approval.

## Safety

- The plugin reads only the current Vault.
- It does not connect to the network.
- Recycle-bin and archive actions affect only plugin display state.
- It does not expose source-file deletion.
- Never copy another user's `data.json`; let first-run detection propose paths.

## Useful settings

- `template`: `general` or `study`
- `workRoot`: optional scan root; blank scans the whole Vault
- `galleryFolder`: any folder inside the Vault
- `trashArchiveDays`: 7, 30, 90, or 0 (never)
- `itemStates`: reversible recycle-bin/archive display records

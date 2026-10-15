# Changelog

## 0.2.0-rc.7 — 2026-10-15

- Isolate banner images from host note-image margins, rounded corners and shadows; render images edge-to-edge with no decorative border.
- Refresh the banner caption and default daily message with original Chinese copy.
- Test banner image coverage using the user's actual Obsidian core CSS, Things theme and enabled snippets, not plugin-only styles.

## 0.2.0-rc.6 — 2026-10-15

- Render the enabled single-image carousel immediately after the page header, outside the regular card grid regardless of saved card order.
- Restore the reference banner composition: panoramic cover image, reference focal positions, lower-left typography, lower-right aligned arrows/dots/pause and top-corner image controls.
- Keep manual/automatic image switching local to the banner, preserving editors and all existing task-board behavior.

## 0.2.0-rc.5 — 2026-10-14

- Remove unconditional Git/terminal actions; only explicitly configured existing folders produce quick entries.
- Add local single-image slideshow with previous/next/dots/pause; retain optional image grid.
- Switch slideshow images without rebuilding the page or disconnecting editors.
- Reference images are installed separately for personal use, not bundled or fetched by the plugin.

## 0.2.0-rc.4 — 2026-10-12

- Replace inferred task ownership tabs with personal tasks and removable source-file summaries.
- Preserve full file names/relative paths and uncapped checkbox counts; exclude historical/template sources.
- Keep removed files hidden across refresh/restart/source edits until restored; never modify source notes.
- Add personal task add/edit/complete/reopen/remove with persistence failure handling and IME protection.
- Defer background full redraws while the scratchpad or task entry has focus.


## 0.2.0-rc.3

- Visual containment batch: keep gallery picker controls inside split panes.
- Exempt compact visual cards from full-width and narrow-pane height caps.
- Keep gallery images/navigation above the Desk footer.
- Use a stable seven-column DAILY LOG grid and verify card/footer containment.
- Add real split-pane geometry regressions and image-based visual QA.

## 0.2.0-rc.2

- RC2: preserve blank optional paths before host normalization so an empty scope means the whole Vault and empty semantic sources stay unconfigured.
- Add slash-normalizing host regression coverage.

## 0.2.0-rc.1

- RC: general defaults now use low-semantic-risk cards only.
- Semantic cards show unconfigured states instead of guessing Vault folders.
- Add a local data-diagnostics drawer for scan counts and source configuration.
- Rename business-heavy labels to neutral activity and learning language.

## 0.1.4

- Read Markdown bodies even when Obsidian metadata hints omit tasks or code sections.
- Keep refreshes efficient through path-and-mtime caching.
- React to both per-file metadata changes and full metadata resolution.

## 0.1.3

- Prevent the active-workstream DAILY LOG footer from shrinking and painting over the next card row.
- Keep the workstream list as the card's internal scroll region.

## 0.1.2

- Refresh the dashboard automatically after Obsidian finishes indexing all note metadata.
- Recover from an empty startup scan without requiring users to create or edit a note.
- Add a finite startup refresh fallback and regression coverage for stale empty models.

## 0.1.1

- Fix the light scrollbar gutter that appeared beside Desk in dark mode.
- Give the host scroll surface and native scrollbar controls explicit dark colours.

## 0.1.0

- Initial public core release with general and computer-study templates.
- Local-only dashboard, Vault folder detection, gallery rotation, and reversible recycle bin/archive.

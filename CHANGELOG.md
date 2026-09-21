# Changelog

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

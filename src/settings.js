'use strict';

const { templateCards } = require('./registry');

/**
 * Defaults. Every key here must be safe in a vault that has none of the folders:
 * a missing folder makes its card show "this vault has no such folder", never a
 * crash and never a misleading empty state.
 */
const DEFAULTS = {
  // identity / chrome
  template: 'general',
  // Grid width: 1, 2 or 3 columns. More columns means narrower, taller cards,
  // which suits a wide monitor; 1 suits a sidebar.
  columns: 2,
  // Optional hero background, read from a vault file. Deliberately a path rather
  // than a bundled asset: shipping images would bloat the package, and loading
  // them remotely would break the "local only, never connects" promise.
  heroImage: '',
  /**
   * Folder the visual card draws from. Empty by default, and that is not laziness:
   * a real vault is mostly UI screenshots (415 images here, nearly all captures),
   * so auto-showing "all images" produces a wall of grey dialogs. The user picks
   * the folder worth looking at; the card explains itself until they do.
   */
  galleryFolder: '',
  galleryCount: 6,
  galleryAutoRotate: true,
  galleryRotateSeconds: 8,
  // Frame shape. Tall suits illustration and posters, wide suits screenshots and
  // site mockups, square is the safe default for mixed folders.
  galleryRatio: 'square',

  // Reversible dashboard cleanup. These records never delete or edit source files.
  itemStates: {},
  // Closed items move to archive when Desk next opens/refreshes after this many days. 0 = never.
  trashArchiveDays: 30,

  // Editable cards. scratchText lives in settings on purpose: it is meant to be
  // throwaway, and a note per stray thought would clutter the vault. The pinned
  // card is the opposite — it edits a real file.
  scratchText: '',
  scratchSavedAt: '',
  pinnedPath: '',
  // Max card height as a fraction of the pane, so a taller pane shows more rows
  // rather than stopping at a fixed pixel height.
  cardMaxVh: 72,
  displayName: '',
  dailyMessage: '把难的事拆小，然后一件一件做完。',
  autoOpen: true,
  cards: '',

  // folders — blank means "this vault does not have one"
  workRoot: '',
  activeFolder: '',
  dailyFolder: '',
  projectFolder: '',
  researchFolder: '',
  blockerFolder: '',
  inboxFolder: '',
  // study template: where a note created from the concept-debt card is filed
  conceptFolder: '',
  // arsenal card: folders holding packaged skills (a folder per skill, each with
  // SKILL.md). These are usually dot-folders, which Obsidian excludes from its
  // file index, so they are read through the vault adapter instead.
  skillFolders: '.claude/skills, .obsidian/.claude/skills',
  templateFolder: '',

  // thresholds
  staleDays: 3,
  taskLimit: 12,
  heatWeeks: 26,
  reviewMinDays: 14,

  // task hygiene: a vault of notes is not a task database
  taskMaxAgeDays: 45,
  taskExcludes: 'node_modules, skills-main, skill-pack, .backup, 08-Templates, 模板, 问卷, 备份, recordings, _archive, 归档, 存档',
  // Cap how many tasks one source note may contribute. A single planning note can
  // hold 80+ checkboxes and would otherwise fill the card, hiding every other
  // project. 6 leaves room for a note's real shortlist without letting it dominate
  // a 12-row card. 0 disables the cap.
  taskPerSource: 6,
  /**
   * Minimum checkbox text length. Was 4, which is wrong outside a CJK vault.
   *
   * 4 characters is a phrase in Chinese but a whole task in English: "gym",
   * "pay rent", "call Bob" were all silently deleted. Measured on the vault this
   * was originally tuned against, 1 through 4 admit the identical 114 tasks — the
   * threshold was protecting against nothing here while quietly discarding real
   * work in anyone else's vault. 2 still drops single-character placeholder rows.
   */
  taskMinLength: 2,
  // Machine-written bookkeeping files, plus vendored bundles. A third-party pack
  // committed into the vault reads as hundreds of notes created on one day, which
  // wrecks the output chart and floods the task list with someone else's docs.
  noteExcludes: 'STATE, STATUS, MANIFEST, LOCK, CHECKPOINT, index.md, README, CHANGELOG, .feishu., source-archive, skill-pack, skills-main, node_modules, .venv, site-packages',

  // ownership
  myNames: '我',
  teamNames: '',
};

/**
 * Preset bundles. Applying a template rewrites folder hints and the card list,
 * but never touches thresholds the user has tuned.
 */
const PRESETS = {
  general: {
    displayName: '',
    cards: () => templateCards('general'),
  },
  study: {
    cards: () => templateCards('study'),
  },
};

/**
 * Vault-shape detection: propose folder settings by looking at what exists.
 * Runs on first load so a fresh install is useful before the user opens settings.
 */
const FOLDER_HINTS = [
  ['activeFolder', [/11-Active$/, /进行中$/, /active$/i, /wip$/i]],
  ['dailyFolder', [/01-Daily$/, /日报$/, /daily$/i, /journal$/i]],
  ['projectFolder', [/02-Projects$/, /项目$/, /projects?$/i]],
  ['researchFolder', [/06-Research$/, /研究$/, /research$/i, /papers?$/i]],
  ['blockerFolder', [/04-Blockers$/, /阻塞$/, /blockers?$/i]],
  ['inboxFolder', [/00-Inbox$/, /收件箱$/, /inbox$/i]],
  ['templateFolder', [/08-Templates$/, /模板$/, /templates?$/i]],
];

/** Which hint keys a folder name matches. */
function matchKeys(name) {
  return FOLDER_HINTS.filter(([, patterns]) => patterns.some((pattern) => pattern.test(name)))
    .map(([key]) => key);
}

/**
 * Paths that look like a snapshot of somewhere else. An archived copy of another
 * vault contains a *complete* folder structure, so it scores higher on hints than
 * the live area and would be chosen as the work root — one real vault picked
 * `比赛 & 项目/_archive_成果库_2026-05-20` over its actual study folders, which
 * then scoped every card to stale files.
 */
// CJK markers need no word boundary — "vault 副本" and "旧版笔记" both qualify —
// while the Latin ones do, so "old" matches but "gold" and "bold" do not.
const ARCHIVE_CJK = /(归档|存档|备份|副本|旧版|废弃)/;
const ARCHIVE_LATIN = /(^|[_\-\s])(archive[d]?|backup|bak|old|deprecated|snapshot|copy)([_\-\s]|$)/i;
// A dated suffix on a folder name is the other common snapshot marker,
// e.g. `成果库_2026-05-20` or `vault-backup-20260520`.
const DATED_SNAPSHOT = /[_-]\d{4}[-_]?\d{2}[-_]?\d{2}$/;

function isArchivePath(folderPath) {
  return folderPath.split('/').some((part) => {
    // A leading underscore is the common "set this aside" convention:
    // _archive_成果库_2026-05-20
    const bare = part.replace(/^_+/, '');
    return ARCHIVE_CJK.test(bare) || ARCHIVE_LATIN.test(bare) || DATED_SNAPSHOT.test(bare);
  });
}

/**
 * Pick the work root first, then resolve sub-folders inside it.
 *
 * Root selection must not be decided by path length: a vault with sibling
 * per-person areas (people/alex/, people/sam/) has structurally identical candidates, and
 * tie-breaking on name length picks an arbitrary — often wrong — colleague's
 * folder. Rank by how many hints a candidate explains, then by note count, so
 * the area actually being used wins.
 *
 * `counts` maps folder path -> number of markdown files beneath it. Optional:
 * without it, ranking falls back to hint count then shallowest path.
 */
function detectWorkRoot(folderPaths, counts = null) {
  const parents = new Map();
  folderPaths.forEach((path) => {
    if (isArchivePath(path)) return;
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    if (!matchKeys(name).length) return;
    const parent = parts.slice(0, -1).join('/');
    if (!parents.has(parent)) parents.set(parent, new Set());
    matchKeys(name).forEach((key) => parents.get(parent).add(key));
  });
  if (!parents.size) return '';
  const weight = (path) => (counts ? (counts[path] || 0) : 0);
  const ranked = [...parents.entries()]
    .map(([path, keys]) => ({ path, hits: keys.size, notes: weight(path) }))
    .sort((a, b) => b.hits - a.hits
      || b.notes - a.notes
      || a.path.split('/').length - b.path.split('/').length);
  const best = ranked[0];
  // Adopting a root narrows every card to that subtree, so the bar is high:
  // it must explain at least three of the hinted folders. A vault with one or
  // two recognisable folders (common in a flat study vault, where `Inbox` and
  // `papers` sit beside unstructured topic folders) stays vault-wide — scoping
  // to `ObsidianKB` there would silently hide most of the notes.
  return best.hits >= 3 ? best.path : '';
}

/**
 * Suggest folder settings from a list of folder paths.
 * When a root is given, only folders inside it are considered, so sibling areas
 * belonging to other people can never leak into the result.
 */
function detectFolders(folderPaths, root = '') {
  const scope = (root
    ? folderPaths.filter((path) => path.startsWith(`${root}/`))
    : folderPaths
  ).filter((path) => !isArchivePath(path));
  const out = {};
  FOLDER_HINTS.forEach(([key, patterns]) => {
    const hits = scope.filter((path) => patterns.some((pattern) => pattern.test(path.split('/').pop())));
    if (!hits.length) return;
    hits.sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length);
    out[key] = hits[0];
  });
  return out;
}

/** One-shot: detect the root, then the folders within it. */
function detectLayout(folderPaths, counts = null) {
  const workRoot = detectWorkRoot(folderPaths, counts);
  return { workRoot, ...detectFolders(folderPaths, workRoot) };
}

module.exports = {
  DEFAULTS, PRESETS, FOLDER_HINTS,
  matchKeys, isArchivePath, detectFolders, detectWorkRoot, detectLayout,
};

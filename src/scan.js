'use strict';

const { parseList, dateKey, startOfDay, daysBetween, inFolder, topEntries, sumValues } = require('./util');
const {
  parseTasks, dedupeTasks, sortTasks, classifyOwner, isRelevantTask, capPerSource,
} = require('./tasks');

/**
 * Vault scanner.
 *
 * Design notes that matter:
 *  - One read pass per refresh, keyed by mtime, so an unchanged file is never
 *    re-read or re-parsed. A cold scan of ~700 notes is ~3s (OneDrive hydration
 *    dominates); a warm refresh is ~200ms.
 *  - metadataCache decides which files are worth opening at all. Files with no
 *    checkbox and no code fence are skipped entirely.
 *  - Derived views (`heat`, `active`, …) are computed lazily via `needs` so a
 *    template that omits a card pays nothing for it.
 */

// How long a skill listing is reused. Skills are configuration files outside the
// vault index: no change events, and staleness cannot be checked more cheaply
// than re-reading. Five minutes keeps refreshes free without stranding an edit.
const SKILL_CACHE_MS = 5 * 60 * 1000;

// Normalise fence languages so py/python and js/javascript do not split counts
const LANG_ALIAS = {
  py: 'python', js: 'javascript', ts: 'typescript', sh: 'bash', shell: 'bash',
  zsh: 'bash', ps1: 'powershell', pwsh: 'powershell', yml: 'yaml',
  md: 'markdown', jsonc: 'json', tsx: 'typescript', jsx: 'javascript',
  'c++': 'cpp', 'c#': 'csharp', golang: 'go', rs: 'rust', kt: 'kotlin',
};
// Prose-only fences carry no signal about a tech stack
const LANG_IGNORE = new Set(['text', 'txt', 'markdown', 'md', 'plaintext', 'output', 'log', '']);

/**
 * Is this a machine-written report whose checkboxes are findings, not todos?
 *
 * Code-review and audit tools (Codex, Claude Code, CI linters) emit notes whose
 * every line is `- [ ] **[file.ps1:770-831]** …`. Those boxes track *findings the
 * tool raised*, not work the user chose to do, and they dominate the task card:
 * measured here, six such notes contributed 37 "tasks", pushing real work off
 * screen with text like "mark-support-uploaded records an operator assertion".
 *
 * Detected by document shape rather than by folder name, because `reviews/` is
 * this vault's convention and a hardcoded path would do nothing for anyone else.
 * All three markers must appear in the head of the file, which on the real vault
 * selects exactly the six generated reports and zero hand-written notes.
 *
 * Note this is about *provenance*, not language: a human-written review checklist
 * has no `Commit:` line, and keeping it is correct.
 */
function isGeneratedReport(content) {
  // Only the head matters, and scanning the whole file would cost more on the
  // large notes this is most likely to hit.
  const head = content.slice(0, 400);
  return /^#\s*Review:/m.test(head)
    && /^Reviewer:/m.test(head)
    && /^Commit:/m.test(head);
}

/**
 * Blocker status vocabulary.
 *
 * Written as an explicit closed/open split rather than one "looks open" regex,
 * because the vault's real values broke the naive version twice:
 *  - `in-progress` matched neither `open` nor `active`, so four live blockers were
 *    silently dropped from the card.
 *  - `resolved-partial` contains `resolved`, so a substring test on the closed
 *    list would hide work that is still half open.
 * So: closed wins only on an exact match; anything else non-empty is open; an
 * absent field is neither (see `readBlockerStatus`).
 */
// Raster and vector formats Obsidian can display. Excludes tif/bmp/heic, which
// Chromium will not render — showing a broken frame is worse than skipping.
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

// A blocker nobody has touched in a month is no longer a blocker in the working
// sense — it is either done and unrecorded, or abandoned. Either way it needs a
// decision, not a slot in the daily list, so the card groups these separately.
const STALE_BLOCKER_DAYS = 30;

const CLOSED_STATUS = new Set([
  'resolved', 'closed', 'done', 'fixed', 'wontfix', "won't fix", 'cancelled',
  'canceled', 'abandoned', 'obsolete', 'dropped', 'shipped',
  '已解决', '已完成', '已关闭', '已放弃', '作废', '过时',
]);

/**
 * Status as three distinct states, because "no field" is not "open".
 *
 * Rendering an unrecorded status as `open` is what kept a May note pinned to the
 * card for four months: nobody wrote a status, so nobody could clear it. An
 * inferred state must look different from a written one, and it must be actionable
 * in a different way (write the field vs. flip the field).
 */
function readBlockerStatus(frontmatter) {
  const raw = frontmatter && frontmatter.status;
  const value = String(raw === undefined || raw === null ? '' : raw).trim();
  if (!value) return { status: '', state: 'unknown' };
  const key = value.toLowerCase();
  if (CLOSED_STATUS.has(key)) return { status: value, state: 'closed' };
  return { status: value, state: 'open' };
}

/** Languages used in a note's fenced code blocks, with per-note occurrence counts. */
function extractLangs(content) {
  const counts = new Map();
  for (const match of content.matchAll(/^[ \t]*(?:```|~~~)([A-Za-z0-9+#._-]+)/gm)) {
    const raw = match[1].toLowerCase();
    const lang = LANG_ALIAS[raw] || raw;
    if (LANG_IGNORE.has(lang) || lang.length > 12) continue;
    counts.set(lang, (counts.get(lang) || 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

/**
 * Is this link target a *concept* rather than a broken file reference?
 *
 * A link like `[[people/alex/daily/…/foo.md]]` that fails to resolve is a moved or
 * deleted file — real breakage, but not "a concept I referenced and never wrote".
 * Mixing the two made the concept-debt card unreadable, so path-shaped and
 * machine-generated targets are excluded here.
 */
// Placeholder text that appears inside documentation examples, not real links.
const PLACEHOLDER_LINK = /^(\.{2,}|…+|xxx+|todo|tbd|文档名|笔记名|概念名|note ?name|待补|某某|示例|example|placeholder)$/i;

function isConceptName(target) {
  if (!target) return false;
  // A path or an explicit extension means the author meant a specific file.
  // Either separator: a Windows-authored link can carry backslashes, and one real
  // vault produced "02_数学与离散基础\" as a supposed concept.
  if (target.includes('/') || target.includes('\\')) return false;
  // A leading numeric prefix is a folder ordering convention, not a concept.
  if (/^\d{2}[_\-\s]/.test(target)) return false;
  if (/\.(md|txt|png|jpe?g|gif|svg|webp|pdf|canvas|excalidraw|zip|html?|docx?|xlsx?|pptx?|mp[34]|m4a|wav|csv|json|ya?ml)$/i.test(target)) return false;
  // Sync artefacts use '__' as a path separator, e.g. people__alex__daily__2026-05-14_note
  if (target.includes('__')) return false;
  // Date-stamped note names are notes, not concepts.
  if (/^\d{4}-\d{2}-\d{2}/.test(target)) return false;
  // SCREAMING_SNAKE (and SCREAMING-KEBAB) names are machine bookkeeping files.
  if (/^[A-Z][A-Z0-9_-]{2,}/.test(target)) return false;
  // Documentation placeholders inside a how-to note.
  if (PLACEHOLDER_LINK.test(target.trim())) return false;
  // Document-role words mark a filename rather than a concept. Matching on the
  // kebab-case *shape* was tried first and rejected: it also threw away real
  // terms like copy-on-write, write-ahead-log and two-phase-commit, which are
  // exactly the concepts this card exists to surface.
  // `log` and `plan` are deliberately absent: they are ordinary technical word
  // endings (write-ahead-log, query-plan) and excluding them lost real concepts.
  if (/(^|[-_\s])(project|roadmap|status|report|notes|draft|todo|index|readme|template|v\d+)([-_\s]|$)/i.test(target)) {
    return false;
  }
  // A concept needs at least two characters of actual name.
  if (target.trim().length < 2) return false;
  // A concept name is short; a long string is almost always a title or a sentence.
  if (target.length > 40) return false;
  return true;
}

/**
 * Pull `description` out of a SKILL.md frontmatter block.
 *
 * Both forms occur in practice and a naive single-line regex gets the folded one
 * wrong (it captures the bare `|`):
 *
 *   description: One line of text
 *   description: |
 *     First line, continued
 *     on following indented lines
 */
function parseSkillDescription(text) {
  const lines = String(text || '').split(/\r?\n/);
  if (lines[0] !== '---') return '';
  const end = lines.indexOf('---', 1);
  const body = lines.slice(1, end < 0 ? lines.length : end);
  const at = body.findIndex((line) => /^description:/.test(line));
  if (at < 0) return '';
  const first = body[at].replace(/^description:\s*/, '').trim();
  // A block scalar indicator means the value is on the indented lines below.
  if (first === '|' || first === '>' || first === '|-' || first === '>-') {
    const folded = [];
    for (let index = at + 1; index < body.length; index += 1) {
      if (!/^\s+\S/.test(body[index])) break;
      folded.push(body[index].trim());
    }
    return folded.join(' ');
  }
  return first.replace(/^["']|["']$/g, '');
}

/** Wiki links a note points at, used for the unresolved-concept ("概念债") card. */
function extractLinks(content) {
  const out = new Set();
  for (const match of content.matchAll(/\[\[([^\]|#^]+)/g)) {
    const target = match[1].trim();
    if (target) out.add(target);
  }
  return [...out];
}

class DeskData {
  constructor(app, settings, { normalize = (value) => value } = {}) {
    this.app = app;
    this.settings = settings;
    this.normalize = normalize;
    this.cache = null;
    // path -> { mtime, tasks, langs, links }. Survives invalidate() so a refresh
    // only re-reads files whose mtime actually changed.
    this.fileCache = new Map();
    // Skill listings live outside the vault index; cached separately and by time.
    this.skillCache = null;
    this.lastScanMs = 0;
  }

  invalidate() { this.cache = null; }

  in(path, folder) { return inFolder(path, folder, this.normalize); }

  configuredPath(value) {
    const raw = String(value ?? '').trim();
    return raw ? this.normalize(raw) : '';
  }

  markdownFiles() {
    const root = this.configuredPath(this.settings.workRoot);
    return this.app.vault.getMarkdownFiles()
      .filter((file) => !root || this.in(file.path, root));
  }

  folderExists(path) {
    if (!path) return false;
    const node = this.app?.vault?.getAbstractFileByPath?.(this.normalize(path));
    return Boolean(node && node.children);
  }

  /**
   * Scan the vault. `needs` is a Set of derived-view keys; anything not asked for
   * is skipped. Tasks and the code profile share the single read pass.
   */
  async collect(needs = null) {
    const want = (key) => !needs || needs.has(key);
    // Reuse the cache only when it already covers everything now being asked for.
    // A cache built with needs=null covered every key, so it always satisfies.
    if (this.cache) {
      const covered = this.cache.needs;
      const satisfied = !covered || !needs || [...needs].every((key) => covered.has(key));
      if (satisfied) return this.cache;
    }
    const started = Date.now();
    const files = this.markdownFiles();
    const today = dateKey(new Date());

    // Read every Markdown body once. MetadataCache hints are not a correctness
    // boundary: they can be incomplete while Obsidian indexes a Vault. The
    // path+mtime fileCache keeps subsequent refreshes at zero repeated reads.
    const toRead = files;

    const codeEntries = [];
    const linkEntries = [];
    const tasks = [];
    const batches = await Promise.all(toRead.map(async (file) => {
      const cached = this.fileCache.get(file.path);
      if (cached && cached.mtime === file.stat.mtime) {
        if (cached.langs.length) codeEntries.push({ file, langs: cached.langs });
        if (cached.links.length) linkEntries.push({ file, links: cached.links });
        return cached.tasks.map((task) => ({ ...task, mtime: file.stat.mtime }));
      }
      try {
        const content = await this.app.vault.cachedRead(file);
        const hasBoxes = content.includes('- [') || content.includes('* [');
        const parsed = hasBoxes && !isGeneratedReport(content) ? parseTasks(content, file) : [];
        const langs = extractLangs(content);
        const links = content.includes('[[') ? extractLinks(content) : [];
        this.fileCache.set(file.path, { mtime: file.stat.mtime, tasks: parsed, langs, links });
        if (langs.length) codeEntries.push({ file, langs });
        if (links.length) linkEntries.push({ file, links });
        return parsed;
      } catch {
        return [];
      }
    }));
    batches.forEach((batch) => tasks.push(...batch));

    // drop cache entries for files that no longer exist
    if (this.fileCache.size > files.length * 2) {
      const live = new Set(files.map((file) => file.path));
      [...this.fileCache.keys()].forEach((key) => { if (!live.has(key)) this.fileCache.delete(key); });
    }

    const myNames = parseList(this.settings.myNames);
    const teamNames = parseList(this.settings.teamNames);
    tasks.forEach((task) => {
      const { owner, who } = classifyOwner(task.text, myNames, teamNames);
      task.owner = owner;
      task.who = who;
    });
    const allOpen = tasks.filter((task) => !task.done && !task.cancelled);
    const relevant = dedupeTasks(allOpen.filter((task) => isRelevantTask(task, this.settings)));
    // Cap after sorting so each note keeps its most urgent items.
    const ranked = sortTasks(relevant, today);
    const { tasks: openTasks, capped } = capPerSource(ranked, this.settings.taskPerSource);

    const model = {
      needs: needs || null,
      files,
      tasks,
      openTasks,
      allOpenCount: allOpen.length,
      // Two different reductions, reported separately because they mean different
      // things to the user: filtered items are judged irrelevant, capped items are
      // relevant but crowded out by a busy source note.
      hiddenCount: allOpen.length - relevant.length,
      cappedCount: capped,
      mineCount: openTasks.filter((task) => task.owner === 'me').length,
      waitingCount: openTasks.filter((task) => task.owner === 'other').length,
      doneTasks: tasks.filter((task) => task.done),
    };
    if (want('active')) model.active = this.activeStreams();
    if (want('streak')) model.streak = this.dailyStreak();
    if (want('heat')) model.heat = this.outputHeat(files);
    if (want('digest')) model.digest = this.digestQueue(files);
    if (want('blockers')) model.blockers = this.openBlockers(files);
    if (want('recent')) model.recent = this.recentWork(files);
    if (want('code')) model.code = this.codeProfile(codeEntries);
    if (want('concepts')) model.concepts = this.conceptDebt(linkEntries, files);
    if (want('review')) model.review = this.reviewQueue(files);
    if (want('gallery')) model.gallery = this.galleryImages();
    // Skills need adapter IO, since they live in dot-folders the index skips.
    if (want('arsenal')) model.arsenal = this.arsenal(files, await this.loadSkills());

    this.lastScanMs = Date.now() - started;
    model.scanMs = this.lastScanMs;
    this.cache = model;
    return model;
  }

  /** 11-Active: one entry per workstream folder, flagged when it stalls. */
  activeStreams() {
    const configured = String(this.settings.activeFolder || '').trim();
    if (!configured) return [];
    const rootPath = this.normalize(configured);
    const root = this.app?.vault?.getAbstractFileByPath?.(rootPath);
    if (!root || !root.children) return [];
    const now = Date.now();
    return root.children
      .filter((child) => child.children)
      .map((folder) => {
        const notes = [];
        const walk = (dir) => dir.children.forEach((child) => {
          if (child.children) walk(child);
          else if (child.extension === 'md') notes.push(child);
        });
        walk(folder);
        const latest = notes.reduce((max, note) => Math.max(max, note.stat.mtime), 0);
        const idle = latest ? daysBetween(latest, now) : 999;
        // A stream's STATE.md is the canonical status note per the vault convention.
        const state = notes.find((note) => note.basename === 'STATE') || null;
        return {
          name: folder.name,
          path: folder.path,
          notes: notes.length,
          latest,
          idle,
          stale: idle >= Number(this.settings.staleDays || 3),
          statePath: state ? state.path : '',
          newest: notes.sort((a, b) => b.stat.mtime - a.stat.mtime)[0] || null,
        };
      })
      .sort((a, b) => b.idle - a.idle);
  }

  /** Which of the last N days have a daily report file. */
  dailyStreak(span = 14) {
    const folder = this.configuredPath(this.settings.dailyFolder);
    if (!folder) return [];
    const reports = new Map();
    this.app.vault.getMarkdownFiles()
      .filter((file) => this.in(file.path, folder))
      .forEach((file) => {
        const hit = file.basename.match(/(\d{4}-\d{2}-\d{2})/);
        if (!hit) return;
        const isReport = /日报|report/i.test(file.basename);
        const key = hit[1];
        if (!reports.has(key) || (isReport && !reports.get(key).isReport)) {
          reports.set(key, { file, isReport });
        }
      });
    const days = [];
    const now = new Date();
    for (let offset = span - 1; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setDate(date.getDate() - offset);
      const key = dateKey(date);
      const entry = reports.get(key);
      days.push({
        key,
        day: date.getDate(),
        weekday: date.getDay(),
        weekend: date.getDay() === 0 || date.getDay() === 6,
        has: Boolean(entry),
        report: Boolean(entry && entry.isReport),
        path: entry ? entry.file.path : '',
      });
    }
    return days;
  }

  /**
   * GitHub-style grid: notes created per day, plus per-folder distribution.
   *
   * Only human notes are counted. A vendored bundle dropped into the vault (one
   * real case: 130 files from a skill pack landing on a single day) otherwise
   * sets the peak so high that every genuine day of work renders as the palest
   * shade — the chart becomes unreadable precisely because of noise.
   */
  outputHeat(files) {
    const weeks = Number(this.settings.heatWeeks || 26);
    const byDay = new Map();
    const byFolder = new Map();
    const cutoff = startOfDay(new Date()).getTime() - (weeks * 7 - 1) * 86400000;
    files.filter((file) => this.isHumanNote(file)).forEach((file) => {
      // Cloud sync (OneDrive) rewrites birthtime, so ctime can be later than mtime
      // and cluster every file on the sync date. Prefer a date parsed out of the
      // path, else the earlier of ctime/mtime.
      const stamped = file.path.match(/(\d{4})-(\d{2})-(\d{2})/);
      const created = stamped
        ? new Date(Number(stamped[1]), Number(stamped[2]) - 1, Number(stamped[3])).getTime()
        : Math.min(file.stat.ctime, file.stat.mtime);
      if (created >= cutoff && created <= Date.now()) {
        const key = dateKey(new Date(created));
        byDay.set(key, (byDay.get(key) || 0) + 1);
      }
      const parts = file.path.split('/');
      const bucket = parts.length > 1 ? parts[1] : '(root)';
      if (file.stat.mtime >= cutoff) byFolder.set(bucket, (byFolder.get(bucket) || 0) + 1);
    });
    const end = startOfDay(new Date());
    const endOffset = (end.getDay() + 6) % 7;
    const columns = [];
    const cursor = new Date(end);
    cursor.setDate(cursor.getDate() - endOffset - (weeks - 1) * 7);
    for (let week = 0; week < weeks; week += 1) {
      const column = [];
      for (let day = 0; day < 7; day += 1) {
        const key = dateKey(cursor);
        const future = cursor > end;
        column.push({ key, count: future ? -1 : (byDay.get(key) || 0), month: cursor.getMonth() });
        cursor.setDate(cursor.getDate() + 1);
      }
      columns.push(column);
    }
    const counts = [...byDay.values()];
    const total = counts.reduce((sum, value) => sum + value, 0);
    const folders = topEntries(byFolder, 6);
    const folderTotal = folders.reduce((sum, item) => sum + item.count, 0) || 1;
    return {
      columns, total, peak: counts.length ? Math.max(...counts) : 0,
      activeDays: counts.length, folders, folderTotal, weeks,
    };
  }

  /** Inbox + recent research that has not been filed yet. */
  digestQueue(files) {
    const inbox = this.configuredPath(this.settings.inboxFolder);
    const research = this.configuredPath(this.settings.researchFolder);
    return files
      .filter((file) => this.in(file.path, inbox) || this.in(file.path, research))
      .filter((file) => this.isHumanNote(file))
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 8)
      .map((file) => ({
        title: file.basename,
        path: file.path,
        source: this.in(file.path, inbox) ? '收件箱' : '研究',
        idle: daysBetween(file.stat.mtime, Date.now()),
      }));
  }

  /**
   * Blocker notes that are not closed.
   *
   * Returns `state` alongside `status` so the card can separate "written down as
   * open" from "never recorded" — the two need different affordances: one is
   * closed by flipping a field, the other by first writing one.
   *
   * `idle` and `stale` are carried too: a blocker untouched for months is a
   * different problem from yesterday's, and a card that showed both identically is
   * how three May notes stayed on screen into September.
   *
   * No slice here. The card decides how many to show and whether to show the stale
   * ones, because that choice belongs next to the control that resolves them —
   * capping in the scanner is what made stale items unreachable, not fewer.
   */
  openBlockers(files) {
    const folder = this.configuredPath(this.settings.blockerFolder);
    if (!folder) return [];
    const now = Date.now();
    return files
      .filter((file) => this.in(file.path, folder))
      .map((file) => {
        const meta = this.app.metadataCache.getFileCache(file);
        const { status, state } = readBlockerStatus(meta && meta.frontmatter);
        const idle = daysBetween(file.stat.mtime, now);
        return {
          title: file.basename,
          path: file.path,
          status,
          state,
          mtime: file.stat.mtime,
          idle,
          stale: idle >= STALE_BLOCKER_DAYS,
        };
      })
      .filter((item) => item.state !== 'closed')
      .sort((a, b) => b.idle - a.idle);
  }

  /**
   * Machine-generated bookkeeping notes are not "work I was doing".
   *
   * Three shapes show up in a synced vault and all of them polluted the review
   * and weekly cards before being filtered:
   *  - SCREAMING_SNAKE basenames written by scripts
   *  - upload copies that flatten the path with '__' separators
   *  - artefact directories from push/fetch pipelines
   */
  isHumanNote(file) {
    const excludes = parseList(this.settings.noteExcludes);
    if (excludes.some((fragment) => file.path.includes(fragment))) return false;
    // Machine bookkeeping names are entirely ASCII caps: STATE, MANIFEST,
    // ONBOARDING-GIVE-5-11. Real notes mix in lowercase or CJK, which is what
    // distinguishes them from an all-caps abbreviation like "AI-Radar信任层" or
    // "FDE-前世今生" — those must be kept.
    if (/^[A-Z][A-Z0-9_-]*$/.test(file.basename)) return false;
    // flattened upload copy, e.g. people__alex__daily__2026-05__…__2026-05-12_note
    if (file.basename.includes('__')) return false;
    // pipeline artefacts: .../artifacts/<run>/fetched/…, feishu_daily_upload_…
    if (/\/(artifacts|fetched|artefacts|dist|build|out)\//i.test(`/${file.path}/`)) return false;
    if (/_upload_|_push_\d|\.before_|\.backup-|\.final\./i.test(file.basename)) return false;
    return true;
  }

  /**
   * Images for the visual card, read from the vault's own files.
   *
   * Deliberately NOT "every image in the vault": a working vault is mostly
   * screenshots, and 415 of them (measured here) would make a wall of grey UI
   * captures rather than something worth looking at. So this reads a folder the
   * user nominates, and until they nominate one it shows nothing and says why.
   *
   * No bundled or remote images — the package is main.js + manifest + styles.css,
   * and "never connects" is the plugin's core promise. The pictures are yours.
   */
  galleryImages() {
    const folder = this.configuredPath(this.settings.galleryFolder);
    const root = this.configuredPath(this.settings.workRoot);
    const all = this.app.vault.getFiles ? this.app.vault.getFiles() : [];
    const allImages = all.filter((file) => IMAGE_EXT.test(file.name || ''));
    // Keep the unconfigured count scoped to workRoot, but honour an explicitly
    // selected folder anywhere inside the Vault.
    const scopedImages = allImages.filter((file) => !root || this.in(file.path, root));
    if (!folder) {
      return { configured: false, folder: '', items: [], total: scopedImages.length };
    }
    const items = allImages
      .filter((file) => this.in(file.path, folder))
      // Newest first: a design folder grows, and the latest render is the one you
      // want to see. Ties broken by path so the order is stable across refreshes.
      .sort((a, b) => (b.stat.mtime - a.stat.mtime) || a.path.localeCompare(b.path))
      .map((file) => ({
        name: file.basename || file.name,
        path: file.path,
        mtime: file.stat.mtime,
        idle: daysBetween(file.stat.mtime, Date.now()),
      }));
    return { configured: true, folder, items, total: scopedImages.length };
  }

  /** Language mix across fenced code blocks, plus the notes that carry them. */
  codeProfile(entries) {
    const langCount = new Map();
    const notes = [];
    entries.forEach(({ file, langs }) => {
      langs.forEach(({ name, count }) => langCount.set(name, (langCount.get(name) || 0) + count));
      if (langs.length) notes.push({ file, langs: langs.map((item) => item.name) });
    });
    const languages = topEntries(langCount, 7);
    const total = sumValues(langCount) || 1;
    const recent = notes
      .filter(({ file }) => this.isHumanNote(file))
      .sort((a, b) => b.file.stat.mtime - a.file.stat.mtime)
      .slice(0, 5)
      .map(({ file, langs }) => ({
        title: file.basename,
        path: file.path,
        langs: langs.slice(0, 3),
        idle: daysBetween(file.stat.mtime, Date.now()),
      }));
    // Languages touched in the last 7 days: "what am I actually working in now"
    const recentWindow = Date.now() - 7 * 86400000;
    const fresh = new Map();
    entries.forEach(({ file, langs }) => {
      if (file.stat.mtime < recentWindow) return;
      langs.forEach(({ name, count }) => fresh.set(name, (fresh.get(name) || 0) + count));
    });
    return { languages, total, recent, blocks: total, fresh: topEntries(fresh, 5) };
  }

  /**
   * Concept debt: wiki links pointing at notes that do not exist.
   * In a study vault these are the concepts you referenced but never wrote up —
   * the strongest single signal of what to learn next.
   */
  conceptDebt(linkEntries, files) {
    const existing = new Set();
    files.forEach((file) => {
      existing.add(file.basename.toLowerCase());
      existing.add(file.path.replace(/\.md$/, '').toLowerCase());
    });
    // Include non-markdown attachments so links to images are not "missing".
    (this.app.vault.getFiles ? this.app.vault.getFiles() : []).forEach((file) => {
      existing.add(file.name.toLowerCase());
      existing.add(file.path.toLowerCase());
    });
    const missing = new Map();
    linkEntries.forEach(({ file, links }) => {
      links.forEach((raw) => {
        const target = raw.trim();
        const key = target.toLowerCase();
        if (existing.has(key) || existing.has(`${key}.md`)) return;
        if (!isConceptName(target)) return;
        if (!missing.has(key)) missing.set(key, { name: target, count: 0, sources: [] });
        const entry = missing.get(key);
        entry.count += 1;
        if (entry.sources.length < 3) entry.sources.push({ title: file.basename, path: file.path });
      });
    });
    // Require more than one mention: a single broken link is usually a typo or a
    // moved file, whereas a concept referenced repeatedly is real unlearned debt.
    const items = [...missing.values()]
      .filter((item) => item.count >= 2)
      .sort((a, b) => b.count - a.count);
    return { items: items.slice(0, 12), total: items.length };
  }

  /**
   * Review queue: notes not touched for a while, oldest first.
   * A poor man's spaced repetition that needs no extra metadata.
   */
  reviewQueue(files) {
    const min = Number(this.settings.reviewMinDays || 14);
    const now = Date.now();
    const items = files
      .filter((file) => this.isHumanNote(file))
      .map((file) => ({
        title: file.basename,
        path: file.path,
        bucket: file.path.split('/').slice(-2, -1)[0] || '',
        idle: daysBetween(file.stat.mtime, now),
      }))
      .filter((item) => item.idle >= min)
      .sort((a, b) => b.idle - a.idle);
    return { items: items.slice(0, 10), total: items.length, min };
  }

  /**
   * The arsenal: reusable capabilities this vault has accumulated.
   *
   * Three kinds, deliberately kept separate because they answer different
   * questions:
   *   skills     — packaged procedures (a SKILL.md folder). "What can I ask for
   *                by name?" A skill carrying a LESSONS.md is flagged: that file
   *                is the non-revertible sediment, worth more than the procedure.
   *   templates  — reusable document shells. "What do I not have to write again?"
   *   playbooks  — SOPs and workflow notes. "How did we decide to do this?"
   *
   * Skills live outside the vault's note tree (an agent config folder), so they
   * are read through the vault adapter rather than the markdown index — and the
   * folder is a setting, never a hardcoded path.
   */
  arsenal(files, skills = []) {
    const templates = this.scanAssetFolder(files, this.settings.templateFolder, 'template');
    const playbooks = this.scanPlaybooks(files);
    return {
      skills,
      templates,
      playbooks,
      total: skills.length + templates.length + playbooks.length,
      withLessons: skills.filter((item) => item.lessons).length,
    };
  }

  /**
   * Packaged skills. Each is a folder holding SKILL.md, whose frontmatter
   * `description` is the one-line summary.
   *
   * These live in dot-folders (`.claude/skills/…`), which Obsidian deliberately
   * excludes from its file index — `getAbstractFileByPath` returns null for them.
   * So this reads through the vault *adapter*, which does see them. That means
   * real IO, so it is cached by folder mtime and only ever reads the first 2 KB of
   * each SKILL.md: enough for frontmatter, and it keeps a folder of long
   * procedure documents from costing anything noticeable.
   *
   * The results are async, unlike every other scanner here, so `arsenal()` is
   * given the already-loaded list rather than fetching it itself.
   */
  async loadSkills() {
    const adapter = this.app?.vault?.adapter;
    if (!adapter || typeof adapter.list !== 'function') return [];
    const roots = parseList(this.settings.skillFolders);

    /**
     * Time-windowed cache.
     *
     * These files sit outside the vault index, so there is no change event to
     * invalidate on and no cheap way to check staleness — stat-ing each manifest
     * costs the same IO as reading it. But skills are configuration: they change
     * when the user edits them deliberately, not while they work. So the listing
     * is reused for a window, which keeps a warm refresh at zero reads (the
     * integration test caught it doing 8 before this existed).
     *
     * `invalidate()` does not clear this; an explicit refresh does, via
     * `forgetSkills()`, so the user always has a way to pick up an edit at once.
     */
    const signature = roots.join('|');
    const fresh = this.skillCache
      && this.skillCache.signature === signature
      && Date.now() - this.skillCache.at < SKILL_CACHE_MS;
    if (fresh) return this.skillCache.items;

    const out = [];
    const seen = new Set();

    for (const root of roots) {
      const base = this.normalize(root);
      let listing;
      try {
        listing = await adapter.list(base);
      } catch {
        continue; // folder absent in this vault, which is normal
      }
      for (const dir of (listing.folders || [])) {
        const name = dir.split('/').pop();
        const key = `${base}::${name}`;
        if (seen.has(key)) continue;
        let inner;
        try {
          inner = await adapter.list(dir);
        } catch {
          continue;
        }
        const manifest = (inner.files || []).find((file) => file.endsWith('/SKILL.md'));
        if (!manifest) continue;
        seen.add(key);
        const lessons = (inner.files || []).find((file) => file.endsWith('/LESSONS.md')) || '';
        let description = '';
        let mtime = 0;
        try {
          const stat = await adapter.stat(manifest);
          mtime = (stat && stat.mtime) || 0;
          const head = (await adapter.read(manifest)).slice(0, 2048);
          description = parseSkillDescription(head);
        } catch { /* unreadable manifest: still list the skill by name */ }
        out.push({
          name,
          path: manifest,
          scope: base,
          description,
          lessons,
          mtime,
        });
      }
    }
    const items = out.sort((a, b) => b.mtime - a.mtime);
    this.skillCache = { signature, items, at: Date.now() };
    return items;
  }

  /**
   * Drop the skill listing so the next scan re-reads it.
   *
   * Also invalidates the model cache: skills are only read while building a
   * model, so leaving that cached would serve the old listing anyway and make
   * this call silently do nothing.
   */
  forgetSkills() {
    this.skillCache = null;
    this.invalidate();
  }

  /** Reusable document shells from a templates folder. */
  scanAssetFolder(files, folder, kind) {
    const root = this.configuredPath(folder);
    if (!root) return [];
    return files
      .filter((file) => this.in(file.path, root))
      .filter((file) => this.isHumanNote(file))
      .map((file) => ({
        name: file.basename,
        path: file.path,
        kind,
        mtime: file.stat.mtime,
      }))
      .sort((a, b) => b.mtime - a.mtime);
  }

  /**
   * SOPs and workflow notes, found by name rather than location: a vault records
   * "how we decided to do this" wherever the work happened, not in one folder.
   */
  scanPlaybooks(files) {
    return files
      .filter((file) => /SOP|流程|工作流|状态机|checklist|清单|规范/i.test(file.basename))
      .filter((file) => this.isHumanNote(file))
      .map((file) => ({
        name: file.basename,
        path: file.path,
        kind: 'playbook',
        mtime: file.stat.mtime,
      }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 12);
  }

  /**
   * Enabled community plugins, as a zero-setup inventory of the user's stack.
   * Reads the in-memory plugin registry rather than touching .obsidian on disk,
   * because hardcoding the config directory path is a review rejection.
   */
  installedPlugins() {
    const registry = this.app && this.app.plugins;
    if (!registry) return [];
    const manifests = registry.manifests || {};
    const enabled = registry.enabledPlugins;
    const ids = enabled && typeof enabled.has === 'function'
      ? [...enabled]
      : Object.keys(manifests);
    return ids
      .filter((id) => id !== 'desk')
      .map((id) => (manifests[id] && manifests[id].name) || id)
      .sort((a, b) => a.localeCompare(b));
  }

  /** Recently touched project/research notes, for "where was I". */
  recentWork(files) {
    const roots = [this.settings.projectFolder, this.settings.activeFolder, this.settings.researchFolder]
      .map((folder) => this.configuredPath(folder))
      .filter(Boolean);
    return files
      .filter((file) => roots.some((root) => this.in(file.path, root)))
      .filter((file) => this.isHumanNote(file))
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 6)
      .map((file) => ({
        title: file.basename,
        path: file.path,
        bucket: file.path.split('/')[1] || '',
        idle: daysBetween(file.stat.mtime, Date.now()),
      }));
  }
}

module.exports = {
  DeskData, extractLangs, extractLinks, isConceptName, isGeneratedReport,
  readBlockerStatus, LANG_ALIAS, LANG_IGNORE,
};

'use strict';

/** Split a comma/newline separated list into trimmed non-empty fragments. */
function parseList(value) {
  return String(value || '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysBetween(fromMs, toMs) {
  return Math.floor((startOfDay(new Date(toMs)) - startOfDay(new Date(fromMs))) / 86400000);
}

/** Human label for an age in days. */
function ageLabel(days) {
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  return `${days} 天前`;
}

/**
 * Is `path` inside `folder`? Compares normalised prefixes so '01-Daily' does not
 * match '01-Daily-old'. `normalize` is injected because obsidian's normalizePath
 * is not available in plain-node tests.
 */
function inFolder(path, folder, normalize = (value) => value) {
  if (!folder) return false;
  const prefix = normalize(folder);
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Clamp a number into [min, max]. */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Percentage width for a bar, floored so tiny values stay visible. */
function barWidth(value, max, floor = 3) {
  if (!max) return `${floor}%`;
  return `${Math.max(floor, Math.round((value / max) * 100))}%`;
}

/**
 * Set one scalar frontmatter field, creating the block if the note has none.
 *
 * Hand-rolled instead of using `app.fileManager.processFrontMatter`, which parses
 * to an object and re-serialises the whole block: that reformats YAML the user
 * wrote by hand (quote style, list indentation, key order, comments) on every
 * write. A dashboard that silently rewrites unrelated lines of a note is not a
 * dashboard anyone should trust, so this only ever touches the target line.
 *
 * Returns `{ ok, text, reason }`. The three outcomes are kept distinct because the
 * caller must react differently to each: write it, say nothing changed, or tell the
 * user to fix the note by hand. Collapsing the last two into one null return is a
 * bug waiting to happen — it reports malformed YAML as "no change".
 */
function setFrontmatterField(text, key, value) {
  const source = String(text === undefined || text === null ? '' : text);
  const line = `${key}: ${value}`;
  // Only a `---` on the very first line opens frontmatter. A horizontal rule in
  // the body looks identical and must not be mistaken for one.
  const opened = /^---\r?\n/.test(source);
  if (!opened) {
    return { ok: true, text: `---\n${line}\n---\n\n${source.replace(/^\s+/, '')}`, reason: 'created' };
  }
  const lines = source.split(/\r?\n/);
  let close = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (/^(---|\.\.\.)\s*$/.test(lines[i])) { close = i; break; }
  }
  // An unterminated block means the note is malformed; prepending a second block
  // would corrupt it further, so refuse rather than guess where it ends.
  if (close === -1) return { ok: false, text: source, reason: 'malformed' };
  const pattern = new RegExp(`^${key}\\s*:`, 'i');
  for (let i = 1; i < close; i += 1) {
    if (!pattern.test(lines[i])) continue;
    if (lines[i] === line) return { ok: false, text: source, reason: 'unchanged' };
    // A block/list value spans the following indented lines; replacing only the
    // key line would leave those orphaned under the new scalar.
    let end = i;
    while (end + 1 < close && /^(\s+\S|\s*-\s)/.test(lines[end + 1])) end += 1;
    lines.splice(i, end - i + 1, line);
    return { ok: true, text: lines.join('\n'), reason: 'replaced' };
  }
  lines.splice(close, 0, line);
  return { ok: true, text: lines.join('\n'), reason: 'inserted' };
}

/** First N entries of a Map sorted by descending value. */
function topEntries(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

/** Sum of a Map's values. */
function sumValues(map) {
  let total = 0;
  map.forEach((value) => { total += value; });
  return total;
}

module.exports = {
  parseList, dateKey, startOfDay, daysBetween, ageLabel, inFolder,
  clamp, barWidth, topEntries, sumValues, setFrontmatterField,
};

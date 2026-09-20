'use strict';

const { parseList, daysBetween } = require('./util');

const TASK_LINE = /^(\s*)[-*+]\s+\[( |x|X|\/|-)\]\s*(.+)$/;

// Tasks-plugin emoji fields stripped from the display text.
// The `u` flag is required: without it these classes match surrogate halves and
// leave orphaned surrogates behind, which then swallow later matches.
const TASK_FIELDS = [
  ['due', /[📅📆🗓]\s*(\d{4}-\d{2}-\d{2})/u],
  ['scheduled', /[⏳⌛]\s*(\d{4}-\d{2}-\d{2})/u],
  ['start', /🛫\s*(\d{4}-\d{2}-\d{2})/u],
  ['done', /✅\s*(\d{4}-\d{2}-\d{2})/u],
];

const PRIORITY = [['high', /[⏫🔺]/u], ['medium', /🔼/u], ['low', /[🔽⏬]/u]];

// Tasks-plugin recurrence and other trailing emoji fields not modelled yet.
const EXTRA_EMOJI = /[🔁➕🆔⛔🏁]/gu;

// Phrases that mean "blocked on someone else", e.g. 等 Vivian 确认 / Vivian 拍板后
const WAIT_VERB = /(确认|拍板|决定|审阅|审核|回复|反馈|批准|签署|通知|提供|发起|同意|定稿)/;
const WAIT_LEAD = /^(等|待|等待|需要|请)/;

/** Decide who owns a task. Returns { owner: 'me'|'other', who: string }. */
function classifyOwner(text, myNames, teamNames) {
  // 1. explicit prefix wins: "Alex: ..." or "Sam: ..."
  const prefix = text.match(/^([^：:，。\s]{1,10})[：:]\s*\S/);
  if (prefix) {
    const label = prefix[1];
    if (myNames.some((name) => label === name)) return { owner: 'me', who: label };
    if (teamNames.some((name) => label.includes(name))) return { owner: 'other', who: label };
  }
  // 2. otherwise look for "等 X 确认" style dependency on a known teammate
  const mentioned = teamNames.find((name) => text.includes(name));
  if (mentioned && (WAIT_LEAD.test(text) || WAIT_VERB.test(text))) {
    return { owner: 'other', who: mentioned };
  }
  // 3. unmarked work in my own vault is mine
  return { owner: 'me', who: '' };
}

function parseTasks(content, file) {
  const out = [];
  const lines = content.split(/\r?\n/);
  let inCode = false;
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) { inCode = !inCode; return; }
    if (inCode) return;
    const match = line.match(TASK_LINE);
    if (!match) return;
    const marker = match[2];
    const raw = match[3].trim();
    let text = raw;
    const fields = {};
    TASK_FIELDS.forEach(([key, pattern]) => {
      const hit = raw.match(pattern);
      if (hit) fields[key] = hit[1];
      text = text.replace(pattern, '');
    });
    let priority = 'none';
    PRIORITY.forEach(([level, pattern]) => {
      if (pattern.test(text)) { priority = level; text = text.replace(pattern, ''); }
    });
    text = text
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(EXTRA_EMOJI, '')
      .replace(/[*_`~]/g, '')
      // drop any surrogate left orphaned by upstream edits to the raw line
      .replace(/[\uD800-\uDFFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return;
    out.push({
      text,
      done: /x/i.test(marker),
      cancelled: marker === '-',
      line: index,
      path: file.path,
      basename: file.basename,
      due: fields.due || '',
      scheduled: fields.scheduled || '',
      priority,
      mtime: file.stat.mtime,
    });
  });
  return out;
}

/**
 * Archived copies (feishu.final.md, source-archive/…) repeat the same task text.
 * Keep the copy in the most canonical location so toggling edits the note you own.
 */
function dedupeTasks(tasks) {
  const seen = new Map();
  const penalty = (path) => (
    (/source-archive|artifacts|\.feishu\.|archive|归档/i.test(path) ? 2 : 0)
    + (path.split('/').length > 5 ? 1 : 0)
  );
  tasks.forEach((task) => {
    const previous = seen.get(task.text);
    if (!previous || penalty(task.path) < penalty(previous.path)) seen.set(task.text, task);
  });
  return [...seen.values()];
}

const PRIORITY_RANK = { high: 0, medium: 1, none: 2, low: 3 };

/** Open tasks first by due date, then priority, then newest file. */
function sortTasks(tasks, today) {
  return [...tasks].sort((a, b) => {
    const aDue = a.due || a.scheduled;
    const bDue = b.due || b.scheduled;
    const aOver = aDue && aDue <= today ? 0 : 1;
    const bOver = bDue && bDue <= today ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    if (aDue && bDue && aDue !== bDue) return aDue.localeCompare(bDue);
    if (aDue && !bDue) return -1;
    if (!aDue && bDue) return 1;
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    }
    return b.mtime - a.mtime;
  });
}

/**
 * Filter out checkboxes that are not really actionable tasks.
 * A dated task always survives: an explicit due date means you meant it.
 */
function isRelevantTask(task, settings) {
  if (task.due || task.scheduled) return true;
  // Tasks blocked on someone else are the easiest to forget, so give them a
  // longer leash than my own: being stale is the point, not a reason to hide.
  const base = Number(settings.taskMaxAgeDays || 0);
  const ageLimit = task.owner === 'other' ? base * 3 : base;
  const excludes = parseList(settings.taskExcludes);
  if (excludes.some((fragment) => task.path.includes(fragment))) return false;
  // survey/form artefacts: "其他：", "其他(请填写)", bare labels ending in a colon
  if (/^其他\s*[（(：:]/.test(task.text) || /[：:]$/.test(task.text)) return false;
  if (task.text.length < Number(settings.taskMinLength || 1)) return false;
  if (ageLimit > 0 && daysBetween(task.mtime, Date.now()) > ageLimit) return false;
  return true;
}

/**
 * Cap how many tasks a single source note contributes, preserving order.
 *
 * One planning note can hold 80+ checkboxes. Without a cap it fills the card and
 * every other project disappears — the dashboard stops being a view of the whole
 * vault and becomes a view of one file. Applied *after* sorting, so each note
 * keeps its most urgent items rather than whichever happened to be first.
 *
 * Dated tasks bypass the cap: an explicit due date means the user meant it, and
 * hiding a deadline to make room for variety is the wrong trade.
 */
function capPerSource(tasks, limit) {
  const max = Number(limit || 0);
  if (max <= 0) return { tasks, capped: 0 };
  const seen = new Map();
  const kept = [];
  let capped = 0;
  tasks.forEach((task) => {
    if (task.due || task.scheduled) { kept.push(task); return; }
    const count = seen.get(task.path) || 0;
    if (count >= max) { capped += 1; return; }
    seen.set(task.path, count + 1);
    kept.push(task);
  });
  return { tasks: kept, capped };
}

module.exports = {
  TASK_LINE, TASK_FIELDS, PRIORITY, EXTRA_EMOJI, PRIORITY_RANK,
  classifyOwner, parseTasks, dedupeTasks, sortTasks, isRelevantTask, capPerSource,
};

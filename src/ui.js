'use strict';

const { el, div, span, button, data } = require('./dom');
const { barWidth } = require('./util');

/**
 * Shared card chrome and primitives.
 *
 * Every card is built from these so that spacing, truncation and empty states
 * stay identical across templates. A card that hand-rolls its own head is a bug.
 */

/**
 * Card header: kicker + title on the left, optional actions on the right.
 * `actions` accepts nodes or {label, onClick, kind} descriptors.
 */
function cardHead(kicker, title, actions = []) {
  const right = (Array.isArray(actions) ? actions : [actions])
    .filter(Boolean)
    .map((item) => (item.nodeType ? item : headButton(item)));
  return div({ cls: 'desk-card-head' }, [
    div({}, [
      kicker ? span({ text: kicker }) : null,
      el('h2', { text: title }),
    ]),
    ...right,
  ]);
}

function headButton({ label, onClick, kind = '' }) {
  return button({ cls: ['desk-head-btn', kind], text: label, onClick });
}

/** A muted count chip for the right side of a card head. */
function countChip(text) {
  return el('b', { cls: 'desk-count', text });
}

/**
 * Standard empty state. Keep the text actionable, not just "no data".
 *
 * `fill: true` makes this empty state the card's height absorber. Cards that
 * early-return an empty body need it, otherwise a row partner stretches them and
 * the spare height becomes visible dead space.
 */
function empty(text, hint, { fill = false } = {}) {
  return div({ cls: ['desk-empty', fill ? 'desk-fill' : ''] }, [
    span({ text }),
    hint ? el('em', { text: hint }) : null,
  ]);
}

/**
 * Empty state for a card whose data source folder does not exist in this vault.
 * Says so plainly instead of implying the user has no work.
 */
function unconfigured(text, hint = 'Choose a data source in settings, or disable this card for now.') {
  return div({ cls: ['desk-empty', 'desk-unconfigured', 'desk-fill'] }, [
    span({ text }),
    el('em', { text: hint }),
  ]);
}

function missingFolder(folder, what) {
  return div({ cls: 'desk-empty' }, [
    span({ text: `这个库没有 ` }),
    el('code', { text: folder || what }),
    span({ text: ' 目录。可以在设置里改路径，或者关掉这张卡片。' }),
  ]);
}

/** Sub-section inside a card, with its own small header. */
function subSection(head, body) {
  return div({ cls: 'desk-sub' }, [
    div({ cls: 'desk-sub-head', text: head }),
    body,
  ]);
}

/** Horizontal bar row: label, proportional bar, value. */
function barRow(label, value, max, { floor = 3, tone = '' } = {}) {
  return div({ cls: ['desk-bar-row', tone] }, [
    span({ text: label, title: label }),
    div({}, [el('i', { style: { width: barWidth(value, max, floor) } })]),
    el('b', { text: String(value) }),
  ]);
}

/** A group of bar rows, or an empty state when there is nothing to show. */
function barList(rows, emptyText) {
  if (!rows.length) return empty(emptyText);
  const max = Math.max(...rows.map((row) => row.value));
  return div({ cls: 'desk-bars-plain' }, rows.map((row) => barRow(row.label, row.value, max, row)));
}

/**
 * The standard clickable row used by most list cards.
 * `icon` is a short string or null; `tone` adds a modifier class.
 */
function listRow({ title, meta, icon, tone, onClick, badge, dismiss, view }) {
  if (dismiss && view && typeof view.isItemHidden === 'function' && view.isItemHidden(dismiss)) return null;
  const body = span({ cls: 'desk-row-body' }, [
    el('strong', { text: title }),
    meta ? el('small', { text: meta }) : null,
  ]);
  if (dismiss && view) {
    return div({ cls: ['desk-row', tone] }, [
      button({
        cls: 'desk-row-toggle',
        ariaLabel: `关闭：${title}`,
        title: '勾选后移入 Desk 回收站，不删除源文件',
        attr: { role: 'checkbox', 'aria-checked': 'false' },
        onClick: (event) => {
          if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
          view.closeItem(dismiss);
        },
      }),
      button({ cls: 'desk-row-main', onClick, title }, [body]),
      badge ? el('em', { cls: 'desk-row-badge', text: badge }) : null,
    ]);
  }
  const shownIcon = icon !== undefined && icon !== null && String(icon).trim() ? icon : null;
  return button({ cls: ['desk-row', tone], onClick, title }, [
    shownIcon !== null ? el('i', { text: shownIcon }) : null,
    body,
    badge ? el('em', { cls: 'desk-row-badge', text: badge }) : null,
  ]);
}

/**
 * Scrollable list wrapper so cards share one overflow behaviour.
 *
 * `fill: true` (the default for a card's primary list) marks this list as the one
 * that absorbs the card's spare height, so a stretched card shows more rows rather
 * than blank space. Pass `fill: false` for a secondary list that should stay at
 * its content height.
 */
function rowList(rows, emptyNode, cls = '', { fill = true } = {}) {
  rows = (rows || []).filter(Boolean);
  // An empty list still has to absorb the card's spare height, otherwise a card
  // with no data is stretched by its row partner and shows the blank space this
  // whole mechanism exists to prevent. Wrapping the empty state keeps one filling
  // element per card in both states.
  if (!rows.length) {
    if (!fill) return emptyNode;
    // Still emit the filling container even with no message: several callers pass
    // emptyNode = null because they early-return their own empty state, and the
    // card must keep exactly one height-absorbing element either way.
    return div({ cls: ['desk-row-list', 'desk-fill', 'is-empty', cls] }, emptyNode ? [emptyNode] : []);
  }
  return div({ cls: ['desk-row-list', fill ? 'desk-fill' : '', cls] }, rows);
}

/** Metric tiles: big number over a caption. */
function metrics(items) {
  return div({ cls: 'desk-metrics' }, items.map((item) => div({ cls: item.tone || '' }, [
    el('b', { text: String(item.value) }),
    span({ text: item.label }),
  ])));
}

/** Segmented control. `options` is [{key,label}], `active` is the current key. */
function segmented(options, active, onPick) {
  return div({ cls: 'desk-switch' }, options.map((option) => button({
    cls: option.key === active ? 'is-active' : '',
    text: option.label,
    onClick: () => onPick(option.key),
  })));
}

/** Progress bar with a label and percentage, for install/completion progress. */
function progress(label, done, total, { tone = '' } = {}) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return div({ cls: ['desk-progress', tone] }, [
    div({ cls: 'desk-progress-head' }, [
      span({ text: label, title: label }),
      el('b', { text: `${done}/${total}` }),
    ]),
    div({ cls: 'desk-progress-track' }, [
      el('i', { style: { width: `${pct}%` } }),
    ]),
  ]);
}

/** Small inline tag chips. */
function tags(items, cls = '') {
  if (!items.length) return null;
  return div({ cls: ['desk-tags', cls] }, items.map((item) => (
    typeof item === 'string' ? el('em', { text: item }) : el('em', { cls: item.tone, text: item.label })
  )));
}

/** Footnote under a card body, e.g. filter explanations. */
function note(text, action) {
  return div({ cls: 'desk-note' }, [
    span({ text }),
    action ? button({ text: action.label, onClick: action.onClick }) : null,
  ]);
}

/** Checklist row with a real toggle affordance. */
function checkRow({ text, done, meta, onToggle, onOpen, tone }) {
  return div({ cls: ['desk-task', tone, done ? 'is-done' : ''] }, [
    button({
      cls: ['desk-check', done ? 'is-on' : ''],
      ariaLabel: done ? '标记未完成' : '标记完成',
      onClick: (event) => { event.stopPropagation(); onToggle?.(); },
    }),
    button({ cls: 'desk-task-body', onClick: onOpen, title: text }, [
      el('strong', { text }),
      meta ? el('small', {}, meta) : null,
    ]),
  ]);
}

/**
 * A blocker row that can actually be closed from the dashboard.
 *
 * Differs from `checkRow` in two ways that matter:
 *  - the toggle writes frontmatter in another note, not a checkbox on a line, so
 *    it is a one-way action (re-opening means editing the note) and is labelled
 *    as such rather than pretending to be a two-state checkbox;
 *  - an unrecorded status renders differently from a written one. Showing "no
 *    status field" as `open` is what let May blockers survive until September:
 *    nothing was ever written, so nothing could be cleared.
 *
 * `onObsolete` is separate from `onResolve` on purpose. "Done" and "stopped
 * mattering" are different facts, and only the second says the item was
 * mis-scoped when it was created.
 */
function blockerRow({ title, status, state, age, stale, onResolve, onObsolete, onOpen }) {
  const unknown = state === 'unknown';
  return div({ cls: ['desk-task', 'desk-blocker', stale ? 'is-stale' : ''] }, [
    button({
      cls: 'desk-check',
      ariaLabel: `把「${title}」标记为已解决`,
      title: '标记为已解决（写入源笔记 status: resolved）',
      onClick: (event) => { event.stopPropagation(); onResolve?.(); },
    }),
    button({ cls: 'desk-task-body', onClick: onOpen, title }, [
      el('strong', { text: title }),
      el('small', {}, [
        unknown
          ? el('em', { cls: 'is-unknown', text: '状态未记录' })
          : el('em', { cls: 'is-waiting', text: status }),
        age ? span({ cls: ['desk-task-age', stale ? 'is-stale' : ''], text: age }) : null,
      ]),
    ]),
    button({
      cls: 'desk-row-x',
      text: '划掉',
      ariaLabel: `把「${title}」标记为过时`,
      title: '已经不重要了（写入源笔记 status: obsolete）',
      onClick: (event) => { event.stopPropagation(); onObsolete?.(); },
    }),
  ]);
}

module.exports = {
  cardHead, headButton, countChip, empty, unconfigured, missingFolder, subSection,
  barRow, barList, listRow, rowList, metrics, segmented, progress, tags, note, checkRow,
  blockerRow,
  el, div, span, button, data,
};

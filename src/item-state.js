'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

function itemKey(cardId, id) {
  return `${String(cardId || '').trim()}:${String(id || '').trim()}`;
}

function itemSignature(parts) {
  const values = Array.isArray(parts) ? parts : [parts];
  return values.map((value) => String(value ?? '')).join('\u001f');
}

function normalizeItemStates(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  Object.entries(value).forEach(([key, record]) => {
    if (!record || typeof record !== 'object') return;
    if (record.state !== 'closed' && record.state !== 'archived') return;
    out[key] = {
      state: record.state,
      cardId: String(record.cardId || key.split(':')[0] || ''),
      cardLabel: String(record.cardLabel || ''),
      label: String(record.label || key),
      sourcePaths: Array.isArray(record.sourcePaths) ? record.sourcePaths.map(String) : [],
      signature: String(record.signature || ''),
      closedAt: String(record.closedAt || ''),
      archivedAt: String(record.archivedAt || ''),
      sourceUpdated: Boolean(record.sourceUpdated),
    };
  });
  return out;
}

function closeItem(states, item, now = new Date()) {
  const next = normalizeItemStates(states);
  const key = item.key || itemKey(item.cardId, item.id);
  next[key] = {
    state: 'closed',
    cardId: String(item.cardId || ''),
    cardLabel: String(item.cardLabel || ''),
    label: String(item.label || item.id || key),
    sourcePaths: Array.isArray(item.sourcePaths) ? item.sourcePaths.map(String) : [],
    signature: String(item.signature || ''),
    closedAt: now.toISOString(),
    archivedAt: '',
    sourceUpdated: false,
  };
  return next;
}

function restoreItem(states, key) {
  const next = normalizeItemStates(states);
  delete next[key];
  return next;
}

function archiveItem(states, key, now = new Date()) {
  const next = normalizeItemStates(states);
  if (!next[key]) return next;
  next[key] = { ...next[key], state: 'archived', archivedAt: now.toISOString() };
  return next;
}

function restoreAll(states, state = '') {
  const next = normalizeItemStates(states);
  Object.keys(next).forEach((key) => {
    if (!state || next[key].state === state) delete next[key];
  });
  return next;
}

function archiveAll(states, now = new Date()) {
  const next = normalizeItemStates(states);
  Object.keys(next).forEach((key) => {
    if (next[key].state === 'closed') {
      next[key] = { ...next[key], state: 'archived', archivedAt: now.toISOString() };
    }
  });
  return next;
}

function sweepExpired(states, now = new Date(), days = 30) {
  const next = normalizeItemStates(states);
  const limit = Number(days);
  if (!Number.isFinite(limit) || limit <= 0) return { states: next, changed: false };
  let changed = false;
  Object.keys(next).forEach((key) => {
    const record = next[key];
    if (record.state !== 'closed') return;
    const closed = Date.parse(record.closedAt);
    if (!Number.isFinite(closed) || now.getTime() - closed < limit * DAY_MS) return;
    next[key] = { ...record, state: 'archived', archivedAt: now.toISOString() };
    changed = true;
  });
  return { states: next, changed };
}

/**
 * Closed items reopen when their computed source signature changes. Archived
 * items stay archived, but report that their source has changed.
 */
function itemVisibility(states, item) {
  const normalized = normalizeItemStates(states);
  const key = item.key || itemKey(item.cardId, item.id);
  const record = normalized[key];
  if (!record) return { hidden: false, key, record: null, changed: false };
  const changed = Boolean(record.signature && item.signature && record.signature !== item.signature);
  if (record.state === 'closed' && changed) {
    return { hidden: false, key, record, changed: true };
  }
  return { hidden: true, key, record, changed };
}

function counts(states) {
  const out = { closed: 0, archived: 0, total: 0 };
  Object.values(normalizeItemStates(states)).forEach((record) => {
    out[record.state] += 1;
    out.total += 1;
  });
  return out;
}

module.exports = {
  DAY_MS,
  itemKey,
  itemSignature,
  normalizeItemStates,
  closeItem,
  restoreItem,
  archiveItem,
  restoreAll,
  archiveAll,
  sweepExpired,
  itemVisibility,
  counts,
};

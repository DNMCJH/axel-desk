'use strict';

const { parseList } = require('./util');

/**
 * Card registry and layout solver.
 *
 * A card declares only how wide it wants to be ('half' | 'full') and which
 * templates include it by default. The grid never breaks when cards are toggled
 * because layout() recomputes which half-card must stretch to fill its row.
 */

/**
 * Templates are named bundles of cards. `default` is what a fresh install gets.
 * Keeping the mapping here (not in each card) means adding a template is a
 * one-line change and the card modules stay independent of product packaging.
 */
const TEMPLATES = [
  {
    id: 'general',
    label: '通用工作台',
    desc: '待办、日历、动线、产出节奏。任何库装上就有东西看。',
  },
  {
    id: 'study',
    label: '计算机学习',
    desc: '技术栈分布、概念债、论文进度、复习队列。',
  },
];

const TEMPLATE_IDS = TEMPLATES.map((item) => item.id);

/**
 * Register a card definition. Called by each module in cards/.
 * Shape:
 *   id       unique string, also the CSS hook (desk-card-<id>)
 *   label    Chinese card name shown in settings and the card head
 *   kicker   small uppercase label above the title
 *   span     'half' | 'full'
 *   desc     one-line explanation for the settings toggle
 *   templates array of template ids that include this card by default
 *   needs    array of data keys the card requires (drives lazy collection)
 *   render   (ctx) => Node — ctx gives model, settings, helpers
 */
const CARDS = [];
const BY_ID = new Map();

function register(card) {
  if (BY_ID.has(card.id)) throw new Error(`duplicate card id: ${card.id}`);
  const entry = {
    span: 'half',
    templates: [],
    needs: [],
    // How the card behaves when its row is taller than its content:
    //   'fill'    — a list inside grows to use the space (default for list cards)
    //   'compact' — content is fixed; the card keeps its natural height
    // Cards that render a fixed widget (a month grid, a 4-step checklist) must be
    // 'compact', or the row's spare height becomes dead space inside them.
    grow: 'fill',
    ...card,
  };
  if (entry.grow !== 'fill' && entry.grow !== 'compact') {
    throw new Error(`card ${entry.id}: grow must be 'fill' or 'compact'`);
  }
  if (entry.span !== 'half' && entry.span !== 'full') {
    throw new Error(`card ${entry.id}: span must be 'half' or 'full'`);
  }
  entry.templates.forEach((id) => {
    if (!TEMPLATE_IDS.includes(id)) throw new Error(`card ${entry.id}: unknown template ${id}`);
  });
  CARDS.push(entry);
  BY_ID.set(entry.id, entry);
  return entry;
}

function allCards() { return CARDS; }
function getCard(id) { return BY_ID.get(id); }

/** Card ids belonging to a template, in registry order. */
function templateCards(templateId) {
  return CARDS.filter((card) => card.templates.includes(templateId)).map((card) => card.id);
}

/**
 * Resolve the enabled card list, then decide how each card spans the grid.
 *
 * Walks the list tracking how many columns of the current row are used. A card
 * that would leave the rest of its row empty is widened to fill it, so no row ever
 * ends with a visible gap — verified exhaustively in the layout tests for every
 * card subset at every supported column count.
 *
 * `cols` is the grid width (1, 2 or 3). At cols=1 everything is full width; at
 * cols=3 a trailing card may need to span two columns rather than one, which is
 * why `span` is computed as a number here rather than being a fixed half/full.
 */
function layout(enabledIds, cols = 2) {
  const columns = Math.max(1, Math.min(3, Number(cols) || 2));
  const picked = enabledIds
    .map((id) => BY_ID.get(id))
    .filter(Boolean)
    .map((card) => ({ ...card, stretch: false, cols: 1 }));

  let used = 0; // columns already filled in the current row
  picked.forEach((card, index) => {
    if (columns === 1) {
      // single column: every card is full width, nothing can be orphaned
      card.cols = 1;
      card.stretch = true;
      return;
    }
    if (card.span === 'full') {
      card.cols = columns;
      card.stretch = false;
      used = 0;
      return;
    }
    // How much of this row is left, and what comes next?
    const remaining = columns - used;
    const rest = picked.slice(index + 1);
    // Count how many half cards follow before the next full-width card, since
    // those are the only ones that could share this row.
    let pairable = 0;
    for (const item of rest) {
      if (item.span === 'full') break;
      pairable += 1;
      if (pairable >= remaining) break;
    }
    if (pairable === 0) {
      // nothing left to pair with: take the whole remaining row
      card.cols = remaining;
      card.stretch = remaining > 1;
      used = 0;
      return;
    }
    card.cols = 1;
    used += 1;
    if (used >= columns) used = 0;
  });
  return picked;
}

/** Parse the stored card string into ids, dropping unknown ones. */
function enabledIds(value) {
  return parseList(value).filter((id) => BY_ID.has(id));
}

/** Union of `needs` across enabled cards, so we only compute what is shown. */
function requiredData(cards) {
  const set = new Set();
  cards.forEach((card) => card.needs.forEach((key) => set.add(key)));
  return set;
}

module.exports = {
  TEMPLATES, TEMPLATE_IDS, register, allCards, getCard,
  templateCards, layout, enabledIds, requiredData,
};

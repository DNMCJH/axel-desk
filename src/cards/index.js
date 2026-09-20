'use strict';

const { register } = require('../registry');

/**
 * Card registration order defines default display order, so keep the most
 * frequently used cards first. Registration is idempotent per process: the
 * registry throws on duplicate ids, which catches accidental double-require.
 */
const core = require('./core');

const MODULES = [
  core,
  require('./work'),
  require('./study'),
  require('./notes'),
  require('./arsenal'),
];

// Full-width visual card: registered in TRAILING so it lands at the bottom with
// the heat map rather than splitting the two-column flow.
const gallery = require('./gallery');

// Full-width cards register last so they land at the bottom of the grid rather
// than splitting the two-column flow in the middle.
const TRAILING = [core.heatCard, gallery.galleryCard];

let registered = false;

function registerAll() {
  if (registered) return;
  MODULES.forEach((cards) => {
    // A module exports an array of card definitions (plus optional named extras).
    (Array.isArray(cards) ? cards : []).forEach((card) => register(card));
  });
  TRAILING.forEach((card) => register(card));
  registered = true;
}

module.exports = { registerAll };

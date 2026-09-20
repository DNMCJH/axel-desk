'use strict';

/**
 * Bundle entry. Everything that touches the Obsidian API is injected from here,
 * so the rest of src/ can be required and unit-tested in plain node.
 */

const obsidian = require('obsidian');
const { makePlugin } = require('./plugin');
const { setDocument } = require('./dom');

// The DOM builder needs a document; in Obsidian that is the real window document.
if (typeof document !== 'undefined') setDocument(document);

module.exports = makePlugin(obsidian);

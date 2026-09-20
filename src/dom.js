'use strict';

/**
 * Tiny DOM builder used instead of innerHTML.
 *
 * Two reasons this exists rather than string templates:
 *  1. Obsidian's community-plugin review rejects innerHTML/outerHTML assignment.
 *  2. Building nodes directly removes the whole class of escaping bugs — user
 *     note titles and task text never pass through an HTML parser.
 *
 * Usage:
 *   el('div', { cls: 'a b', text: 'hi', attr: { 'data-x': '1' } }, [child, child])
 *   el('button', { cls: 'x', onClick: () => {} })
 */

// Attributes that must be set via setAttribute rather than as properties.
const DATA_PREFIX = 'data-';

/**
 * Flatten any nesting of strings/arrays into individual class names.
 * Splitting on whitespace as well means 'a b' and ['a', 'b'] are equivalent.
 */
function classNames(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(classNames);
  return String(value).split(/\s+/).filter(Boolean);
}

function applyProps(node, props) {
  if (!props) return;
  const { cls, text, title, attr, style, onClick, ariaLabel, html } = props;
  if (html !== undefined) {
    throw new Error('el(): html is not supported on purpose — build child nodes instead');
  }
  if (cls) {
    // Accept 'a b c', ['a', 'b'], nested arrays, and sparse arrays with falsy
    // entries. Nesting matters: a caller passing a `tone` array through to a
    // primitive used to produce the class name "desk-p-high," — array coercion
    // via String() smuggled the comma in and the rule silently never matched.
    classNames(cls).forEach((name) => node.classList.add(name));
  }
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (title) node.setAttribute('title', String(title));
  if (ariaLabel) node.setAttribute('aria-label', String(ariaLabel));
  if (attr) {
    Object.entries(attr).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      node.setAttribute(key, String(value));
    });
  }
  if (style) {
    Object.entries(style).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      node.style.setProperty(key, String(value));
    });
  }
  if (onClick) node.addEventListener('click', onClick);
}

function appendChildren(node, children) {
  if (children === undefined || children === null || children === false) return;
  if (Array.isArray(children)) {
    children.forEach((child) => appendChildren(node, child));
    return;
  }
  if (typeof children === 'string' || typeof children === 'number') {
    node.appendChild(node.ownerDocument.createTextNode(String(children)));
    return;
  }
  // Node-like: has nodeType. Guard so a stray object throws early with context.
  if (children.nodeType) { node.appendChild(children); return; }
  throw new Error(`el(): unsupported child ${Object.prototype.toString.call(children)}`);
}

/**
 * Create an element. `doc` defaults to the ambient document so callers stay terse;
 * tests inject a jsdom document via setDocument().
 */
let ambientDocument = typeof document !== 'undefined' ? document : null;

function setDocument(doc) { ambientDocument = doc; }

function el(tag, props = null, children = null) {
  const doc = (props && props.doc) || ambientDocument;
  if (!doc) throw new Error('el(): no document available — call setDocument() first');
  const node = doc.createElement(tag);
  applyProps(node, props);
  appendChildren(node, children);
  return node;
}

// Frequently used shorthands keep card code readable.
const div = (props, children) => el('div', props, children);
const span = (props, children) => el('span', props, children);
const button = (props, children) => el('button', props, children);

/** Replace all children of `node` with `children`. */
function fill(node, children) {
  while (node.firstChild) node.removeChild(node.firstChild);
  appendChildren(node, children);
  return node;
}

/** Build a dataset-style attr object; skips empty values so no data-x="" noise. */
function data(map) {
  const out = {};
  Object.entries(map || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    out[`${DATA_PREFIX}${key}`] = String(value);
  });
  return out;
}

module.exports = { el, div, span, button, fill, data, setDocument };

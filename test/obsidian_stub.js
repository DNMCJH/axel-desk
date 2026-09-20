'use strict';

/**
 * Stand-in for Obsidian's runtime API so the bundle can be required under plain
 * node. Fidelity matters more than brevity here: every method a card or the
 * settings tab actually calls must exist, or a test passes while the real plugin
 * throws. Anything unimplemented should throw loudly rather than return undefined.
 */

const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { window } = dom;
const { document } = window;

// Obsidian augments HTMLElement with these helpers; plugins rely on them.
function createEl(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.cls) String(options.cls).split(/\s+/).filter(Boolean).forEach((c) => node.classList.add(c));
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.attr) Object.entries(options.attr).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

const proto = window.HTMLElement.prototype;
proto.createEl = function patchedCreateEl(tag, options) {
  const node = createEl(tag, options);
  this.appendChild(node);
  return node;
};
proto.createDiv = function patchedCreateDiv(options) { return this.createEl('div', options); };
proto.createSpan = function patchedCreateSpan(options) { return this.createEl('span', options); };
proto.empty = function patchedEmpty() {
  while (this.firstChild) this.removeChild(this.firstChild);
  return this;
};
proto.setText = function patchedSetText(text) { this.textContent = String(text); return this; };
proto.addClass = function patchedAddClass(...names) { names.forEach((n) => this.classList.add(n)); return this; };
proto.removeClass = function patchedRemoveClass(...names) { names.forEach((n) => this.classList.remove(n)); return this; };
proto.toggleClass = function patchedToggleClass(name, on) { this.classList.toggle(name, on); return this; };

// window.setTimeout/clearTimeout are used by the debounce path.
if (typeof global.window === 'undefined') global.window = window;
if (typeof global.document === 'undefined') global.document = document;

const notices = [];

function normalizePath(input) {
  return String(input)
    .split('\\').join('/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

class Notice {
  constructor(message, timeout) {
    this.message = String(message);
    this.timeout = timeout;
    notices.push(this.message);
  }
}

class Plugin {
  constructor(app, manifest) {
    this.app = app;
    this.manifest = manifest;
    this._data = null;
    this._commands = [];
    this._views = new Map();
    this._events = [];
    this._ribbons = [];
    this._settingTabs = [];
  }

  async loadData() { return this._data; }
  async saveData(data) { this._data = JSON.parse(JSON.stringify(data)); }
  registerView(type, factory) { this._views.set(type, factory); }
  addRibbonIcon(icon, title, callback) { this._ribbons.push({ icon, title, callback }); return createEl('div'); }
  addCommand(command) { this._commands.push(command); return command; }
  addSettingTab(tab) { this._settingTabs.push(tab); }
  registerEvent(ref) { this._events.push(ref); }
  registerDomEvent() {}
  registerInterval() {}
}

class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }
}

/** Chainable Setting stub that records what was configured. */
class Setting {
  constructor(containerEl) {
    this.containerEl = containerEl;
    this.name = '';
    this.desc = '';
    this.components = [];
    this.itemEl = document.createElement('div');
    if (containerEl && containerEl.appendChild) containerEl.appendChild(this.itemEl);
  }

  setName(name) { this.name = String(name); return this; }
  setDesc(desc) { this.desc = String(desc); return this; }
  setHeading() { return this; }
  setClass() { return this; }

  addText(cb) {
    const comp = {
      kind: 'text', value: '',
      inputEl: document.createElement('input'),
      setValue(v) { this.value = String(v); return this; },
      setPlaceholder() { return this; },
      onChange(fn) { this._onChange = fn; return this; },
    };
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addTextArea(cb) {
    const comp = {
      kind: 'textarea', value: '',
      inputEl: document.createElement('textarea'),
      setValue(v) { this.value = String(v); return this; },
      setPlaceholder() { return this; },
      onChange(fn) { this._onChange = fn; return this; },
    };
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addToggle(cb) {
    const comp = {
      kind: 'toggle', value: false,
      setValue(v) { this.value = Boolean(v); return this; },
      setTooltip() { return this; },
      onChange(fn) { this._onChange = fn; return this; },
    };
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addDropdown(cb) {
    const comp = {
      kind: 'dropdown', value: '', options: {},
      addOption(key, label) { this.options[key] = label; return this; },
      addOptions(map) { Object.assign(this.options, map); return this; },
      setValue(v) { this.value = String(v); return this; },
      onChange(fn) { this._onChange = fn; return this; },
    };
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addButton(cb) {
    const comp = {
      kind: 'button', text: '', disabled: false,
      setButtonText(t) { this.text = String(t); return this; },
      setIcon(i) { this.icon = i; return this; },
      setTooltip(t) { this.tooltip = t; return this; },
      setCta() { return this; },
      setDisabled(v) { this.disabled = Boolean(v); return this; },
      onClick(fn) { this._onClick = fn; return this; },
    };
    this.components.push(comp);
    cb(comp);
    return this;
  }

  addExtraButton(cb) { return this.addButton(cb); }

  addSlider(cb) {
    const comp = {
      kind: 'slider', value: 0,
      setLimits() { return this; },
      setValue(v) { this.value = v; return this; },
      setDynamicTooltip() { return this; },
      onChange(fn) { this._onChange = fn; return this; },
    };
    this.components.push(comp);
    cb(comp);
    return this;
  }
}

class ItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.app = leaf && leaf.app;
    const outer = document.createElement('div');
    const header = document.createElement('div');
    const content = document.createElement('div');
    outer.appendChild(header);
    outer.appendChild(content);
    this.containerEl = outer;
  }

  registerEvent() {}
  registerDomEvent() {}
}

module.exports = {
  normalizePath, Notice, Plugin, PluginSettingTab, Setting, ItemView,
  // test-only exports
  __dom: dom, __window: window, __document: document, __notices: notices,
  __resetNotices() { notices.length = 0; },
};

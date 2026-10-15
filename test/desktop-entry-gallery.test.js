'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const stub = require('./obsidian_stub');
const { makeApp, requireWithStub } = require('./harness');
const { makePlugin } = require('../src/plugin');
require('../src/dom').setDocument(stub.__document);

async function main() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-carousel-'));
  let plugin, view;
  try {
    fs.mkdirSync(path.join(vault, 'Images'));
    ['art-veil.jpg', 'art-dress.jpg', 'art-couple.jpg'].forEach((name) => {
      fs.writeFileSync(path.join(vault, 'Images', name), Buffer.from([255, 216, 255, 217]));
    });
    const { app } = makeApp(vault);
    const Plugin = process.argv.includes('--bundle')
      ? requireWithStub(path.join(__dirname, '..', 'main.js')) : makePlugin(stub);
    plugin = new Plugin(app, { id: 'axel-desk' });
    plugin._data = { autoOpen: false, cards: 'today, scratch, gallery', galleryFolder: 'Images', galleryMode: 'slideshow' };
    await plugin.onload();
    assert.deepEqual(plugin.quickActions(), [], 'never injects Git/terminal even if commands exist');
    plugin.settings.inboxFolder = 'Missing';
    assert.deepEqual(plugin.quickActions(), [], 'does not show broken folder entries');
    plugin.settings.inboxFolder = 'Images';
    assert.deepEqual(plugin.quickActions().map((a) => a.id), ['open-inbox'], 'keeps valid explicit entries');
    plugin.settings.inboxFolder = '';
    view = plugin._views.get('desk-home')({ app });
    stub.__document.body.appendChild(view.containerEl);
    await view.render();
    assert.equal(view.containerEl.querySelector('.desk-dock'), null, 'hides empty quick-action area');
    const banner = view.containerEl.querySelector('.desk-gallery-top');
    assert.ok(banner, 'slideshow is a top banner, not a regular card');
    assert.equal(view.containerEl.querySelector('.desk-hero').nextElementSibling, banner, 'banner immediately follows the page header even if gallery is last in settings');
    assert.equal(view.containerEl.querySelector('.desk-grid .desk-carousel'), null, 'banner is outside the card grid');
    assert.equal(view.containerEl.querySelector('.desk-card-gallery'), null, 'no decorative gallery card wrapper');
    assert.ok(banner.querySelector('.desk-banner-caption'), 'keeps reference image-overlay typography');
    assert.equal(banner.querySelector('.desk-banner-caption strong').textContent, '好好生活，认真求知，走自己的路。');
    assert.ok(banner.querySelector('.desk-carousel .desk-carousel-controls'), 'controls overlay the same banner frame');
    assert.equal(view.containerEl.querySelectorAll('.desk-carousel-slide').length, 3, 'all three originals in carousel');
    assert.equal(view.containerEl.querySelectorAll('.desk-carousel-slide.is-active').length, 1);
    const input = view.containerEl.querySelector('.desk-card-scratch textarea');
    input.focus(); input.value = 'Still thinking';
    input.dispatchEvent(new stub.__window.Event('input'));
    let renderCalls = 0;
    const rerender = view.rerender.bind(view);
    view.rerender = async () => { renderCalls += 1; return rerender(); };
    view.shiftGalleryPage(1, 3);
    assert.equal(view.galleryPage, 1);
    assert.equal(view.containerEl.querySelector('.desk-carousel-slide.is-active').dataset.slideIndex, '1');
    assert.equal(stub.__document.activeElement, input);
    assert.equal(renderCalls, 0, 'image navigation never rebuilds whole Desk');
    view.containerEl.querySelector('[data-carousel-dot="2"]').click();
    assert.equal(view.galleryPage, 2);
    const originalInterval = window.setInterval;
    let tick;
    view.clearGalleryRotation();
    window.setInterval = (fn) => { tick = fn; return 0; };
    view.configureGalleryRotation(3, 1);
    window.setInterval = originalInterval;
    Object.defineProperty(stub.__document, 'hidden', { configurable: true, value: false });
    tick();
    assert.equal(view.galleryPage, 0);
    assert.equal(renderCalls, 0, 'rotation is local DOM update');
    assert.equal(input.isConnected, true);
    assert.equal(input.value, 'Still thinking');
    input.blur();
    plugin.settings.galleryMode = 'grid';
    await view.rerender();
    assert.equal(view.containerEl.querySelectorAll('.desk-shot').length, 3);
    assert.equal(view.containerEl.querySelector('.desk-gallery-top'), null, 'optional grid remains an ordinary card');
    plugin.settings.cards = 'today, scratch';
    await view.rerender();
    assert.equal(view.containerEl.querySelector('.desk-gallery-top'), null, 'disabled gallery does not leave a top banner');
    console.log('desktop entry + slideshow: passed');
  } finally {
    if (view) { await view.onClose(); view.containerEl.remove(); }
    if (plugin) plugin.onunload();
    fs.rmSync(vault, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error.stack); process.exitCode = 1; });

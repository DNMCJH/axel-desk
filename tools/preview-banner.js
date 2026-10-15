'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { makeApp, requireWithStub } = require('../test/harness');
const root = path.resolve(__dirname, '..');

async function main() {
  const { chromium } = require(process.env.DESK_PLAYWRIGHT_MODULE || 'playwright');
  const assets = process.env.DESK_BANNER_IMAGES;
  if (!assets) throw new Error('Set DESK_BANNER_IMAGES to the local reference image directory');
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-banner-visual-'));
  let plugin, view, browser;
  try {
    fs.mkdirSync(path.join(vault, 'Images'));
    for (const name of ['art-veil.jpg', 'art-dress.jpg', 'art-couple.jpg']) {
      fs.copyFileSync(path.join(assets, name), path.join(vault, 'Images', name));
    }
    fs.writeFileSync(path.join(vault, 'Task example.md'), '- [ ] Read a chapter\n');
    const { app } = makeApp(vault);
    const Plugin = requireWithStub(path.join(root, 'main.js'));
    plugin = new Plugin(app, JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')));
    plugin._data = { autoOpen: false, cards: 'today, scratch, gallery', galleryFolder: 'Images', galleryMode: 'slideshow' };
    await plugin.onload();
    view = plugin._views.get('desk-home')({ app });
    view.resolveImage = (file) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(vault, file)).toString('base64');
    await view.render();
    const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
    const hostCss = (process.env.DESK_HOST_STYLES || '').split('|').filter(Boolean)
      .map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    browser = await chromium.launch({ headless: true, ...(process.env.DESK_CHROME ? { executablePath: process.env.DESK_CHROME } : {}) });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>' + hostCss + '\nbody{margin:0;position:static;contain:none;height:auto;overflow:auto;font-family:"Segoe UI","Microsoft YaHei",sans-serif;--text-normal:#252525;--font-interface:"Segoe UI","Microsoft YaHei",sans-serif;--background-primary:#fff}.workspace-leaf-content{display:block;height:auto;overflow:visible}.workspace-leaf-content .view-content{height:auto;min-height:100vh}' + css + '</style></head><body class="theme-light mod-windows"><div class="workspace-leaf-content" data-type="desk-home"><div class="view-content">' + view.containerEl.children[1].innerHTML + '</div></div></body></html>');
    await page.locator('.desk-carousel img').evaluateAll(async (images) => Promise.all(images.map((image) => image.decode())));
    for (const width of [1200, 760, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((w) => {
        document.querySelector('.desk-root').setAttribute('data-pane', w < 620 ? 'narrow' : w < 900 ? 'medium' : 'wide');
        const grid = document.querySelector('.desk-grid');
        grid.setAttribute('data-cols', w < 620 ? '1' : '2');
        grid.style.setProperty('--desk-cols', w < 620 ? '1' : '2');
      }, width);
      for (let index = 0; index < 3; index += 1) {
        await page.evaluate((next) => {
          document.querySelectorAll('[data-slide-index]').forEach((slide, i) => slide.classList.toggle('is-active', i === next));
          document.querySelectorAll('[data-carousel-dot]').forEach((dot, i) => dot.classList.toggle('is-active', i === next));
          document.querySelector('.desk-carousel-status').textContent = (next + 1) + ' / 3';
        }, index);
        await page.waitForTimeout(900);
        const checks = await page.evaluate(() => {
          const rect = (selector) => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
          };
          const nav = rect('.desk-carousel-controls');
          const caption = rect('.desk-banner-caption');
          const banner = rect('.desk-carousel');
          const track = rect('.desk-carousel-track');
          const image = rect('.desk-carousel-slide.is-active img');
          const centers = [...document.querySelector('.desk-carousel-controls').children].map((node) => {
            const r = node.getBoundingClientRect(); return r.y + r.height / 2;
          });
          return { banner, track, image, caption, nav, centers,
            captionColor: getComputedStyle(document.querySelector('.desk-banner-caption strong')).color,
            imageComputed: {
              margin: getComputedStyle(document.querySelector('.desk-carousel-slide.is-active img')).margin,
              padding: getComputedStyle(document.querySelector('.desk-carousel-slide.is-active img')).padding,
              buttonDisplay: getComputedStyle(document.querySelector('.desk-carousel-slide.is-active')).display,
              buttonAlignContent: getComputedStyle(document.querySelector('.desk-carousel-slide.is-active')).alignContent,
            },
            decoded: [...document.querySelectorAll('.desk-carousel img')].every((img) => img.naturalWidth > 0),
            first: document.querySelector('.desk-hero').nextElementSibling.className,
            overflow: document.documentElement.scrollWidth > innerWidth,
            overlap: caption.x < nav.right && caption.right > nav.x && caption.y < nav.bottom && caption.bottom > nav.y,
            inFrame: nav.x >= banner.x && nav.right <= banner.right && nav.bottom <= banner.bottom,
          };
        });
        if (process.env.DESK_DIAGNOSE_IMAGE) console.log(JSON.stringify({ width, index, ...checks }));
        assert.equal(checks.imageComputed.margin, '0px', 'banner images must not inherit note-image margins');
        assert.equal(checks.captionColor, 'rgb(255, 255, 255)', 'overlay text stays white under note formatting snippets');
        assert.equal(checks.imageComputed.padding, '0px', 'banner images have no internal whitespace');
        assert.ok(checks.image.y <= checks.track.y + 0.5, 'image covers top of banner track');
        assert.ok(checks.image.bottom >= checks.track.bottom - 0.5, 'image covers bottom of banner track');
        assert.ok(checks.image.x <= checks.track.x + 0.5 && checks.image.right >= checks.track.right - 0.5, 'image covers both horizontal edges');
        assert.equal(checks.decoded, true);
        assert.equal(checks.overflow, false);
        assert.equal(checks.overlap, false);
        assert.equal(checks.inFrame, true);
        assert.equal(checks.first, 'desk-gallery-top');
        assert.ok(Math.max(...checks.centers) - Math.min(...checks.centers) < 1, 'navigation controls vertically align');
        const target = path.join(os.tmpdir(), 'axel-desk-banner-' + plugin.manifest.version + '-' + width + '-' + index + '.png');
        await page.screenshot({ path: target, fullPage: true });
        console.log(JSON.stringify({ width, index, target, ...checks }));
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    if (view) await view.onClose();
    if (plugin) plugin.onunload();
    fs.rmSync(vault, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error.stack); process.exitCode = 1; });

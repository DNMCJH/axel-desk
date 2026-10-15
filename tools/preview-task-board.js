'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeApp, requireWithStub } = require('../test/harness');
const root = path.resolve(__dirname, '..');

async function main() {
  const playwrightPath = process.env.DESK_PLAYWRIGHT_MODULE || 'playwright';
  const { chromium } = require(playwrightPath);
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-board-preview-'));
  let plugin, view, browser;
  try {
    const dir = path.join(vault, '计算机学习', '计算机科学从零到AI Infra', '90_配套材料');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '00_学习控制台_当前状态与断点.md'), '- [ ] 一个例子\n- [ ] 另一个例子\n');
    fs.mkdirSync(path.join(vault, '个人', '作品集'), { recursive: true });
    fs.writeFileSync(path.join(vault, '个人', '作品集', '2026-10-08_作品与工程成果_审阅稿.md'), '- [ ] 梳理证据\n');
    const { app } = makeApp(vault, { maxDepth: 10 });
    const Plugin = requireWithStub(path.join(root, 'main.js'));
    plugin = new Plugin(app, { id: 'axel-desk' });
    plugin._data = { autoOpen: false, cards: 'today', manualTasks: [
      { id: '1', text: '验证当前项目的取消与恢复逻辑', done: false },
      { id: '2', text: '用两句话记录这次实验的结论', done: false },
      { id: '3', text: '整理一份材料', done: true },
    ] };
    await plugin.onload();
    view = plugin._views.get('desk-home')({ app });
    view.renderDock = () => null;
    await view.render();
    const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
    browser = await chromium.launch({ headless: true, ...(process.env.DESK_CHROME ? { executablePath: process.env.DESK_CHROME } : {}) });
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:"Segoe UI","Microsoft YaHei",sans-serif;--text-normal:#252525;--font-interface:"Segoe UI","Microsoft YaHei",sans-serif;--background-primary:#fff;}button,input{font:inherit}' + css + '</style></head><body class="theme-light">' + view.containerEl.children[1].innerHTML + '</body></html>');
    for (const width of [1100, 380]) {
      await page.setViewportSize({ width, height: 1050 });
      await page.evaluate((w) => {
        document.querySelector('.desk-root').setAttribute('data-pane', w < 620 ? 'narrow' : 'wide');
        document.querySelector('.desk-grid').setAttribute('data-cols', w < 620 ? '1' : '2');
        document.querySelector('.desk-grid').style.setProperty('--desk-cols', w < 620 ? '1' : '2');
      }, width);
      const target = path.join(os.tmpdir(), 'axel-desk-rc4-' + width + '.png');
      await page.screenshot({ path: target, fullPage: true });
      const geometry = await page.locator('.desk-task-file').evaluateAll((rows) => rows.map((row) => ({ width: row.clientWidth, scroll: row.scrollWidth })));
      if (geometry.some((row) => row.scroll > row.width)) throw new Error('Source file row overflows');
      console.log(JSON.stringify({ width, target, geometry }));
    }
  } finally {
    if (browser) await browser.close();
    if (view) await view.onClose();
    if (plugin) plugin.onunload();
    fs.rmSync(vault, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error.stack); process.exitCode = 1; });

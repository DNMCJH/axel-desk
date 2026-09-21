'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { requireWithStub, makeApp } = require('./harness');
const stub = require('./obsidian_stub');
const { DeskData } = require('../src/scan');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'test'].includes(entry.name)) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(target));
    else if (/(js|json|md|css)$/i.test(path.extname(entry.name))) out.push(target);
  }
  return out;
}

async function main() {
  const slashNote = { path: 'Notes/a.md', name: 'a.md', basename: 'a', extension: 'md', stat: { mtime: Date.now(), ctime: Date.now() } };
  const slashImage = { path: 'Images/a.png', name: 'a.png', basename: 'a', extension: 'png', stat: { mtime: Date.now(), ctime: Date.now() } };
  const slashApp = { vault: { getMarkdownFiles: () => [slashNote], getFiles: () => [slashNote, slashImage], getAbstractFileByPath: () => null }, metadataCache: { getFileCache: () => null } };
  const slashData = new DeskData(slashApp, { workRoot: '', dailyFolder: '', inboxFolder: '', researchFolder: '', blockerFolder: '', galleryFolder: '', projectFolder: '', activeFolder: '', templateFolder: '', noteExcludes: '', heatWeeks: 1 }, { normalize: (value) => value ? value : '/' });
  assert(slashData.markdownFiles().length === 1, 'empty work root scans the whole Vault under slash-normalizing hosts');
  assert(slashData.digestQueue([slashNote]).length === 0, 'empty semantic sources stay unconfigured under slash-normalizing hosts');

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert(manifest.id === 'axel-desk', 'manifest id');
  assert(manifest.version === '0.2.0-rc.3', 'public version');
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert(/theme-dark[\s\S]*background:\s*#17181a/.test(css), 'dark host surface and scrollbar track are explicit');
  assert(/desk-card-active > \.desk-sub:last-child\s*\{[^}]*flex:\s*0 0 auto/.test(css),
    'active-card DAILY LOG cannot shrink and overlap the next row');
  assert(/desk-gallery-control[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto/.test(css), 'gallery controls use a shrink-safe grid');
  assert(/desk-grid\[data-cols="2"\] \.desk-card\.is-compact[\s\S]*max-height:\s*none/.test(css), 'compact full-width cards are exempt from height caps');
  assert(/desk-streak[\s\S]*repeat\(7, minmax\(0, 1fr\)\)/.test(css), 'daily streak uses stable seven-column rows');

  const forbidden = /workshop|工作坊|\bopc\b|一人公司|client|客户|cohort|roster|学员|FAQ|交付物|深演智进|陈嘉豪/i;
  const leaked = [];
  for (const file of walk(ROOT)) {
    const hit = fs.readFileSync(file, 'utf8').match(forbidden);
    if (hit) leaked.push(`${path.relative(ROOT, file)}: ${hit[0]}`);
  }
  assert(leaked.length === 0, `private-scope text leaked: ${leaked.join(', ')}`);

  require(path.join(ROOT, 'src', 'dom')).setDocument(stub.__document);
  const registry = require(path.join(ROOT, 'src', 'registry'));
  require(path.join(ROOT, 'src', 'cards')).registerAll();
  assert(JSON.stringify(registry.TEMPLATE_IDS) === JSON.stringify(['general', 'study']), 'only public templates register');
  const generalDefaults = registry.templateCards('general');
  assert(!generalDefaults.includes('active') && !generalDefaults.includes('digest') && !generalDefaults.includes('arsenal'),
    'general defaults contain only low-semantic-risk cards');

  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'axel-desk-public-'));
  try {
    fs.mkdirSync(path.join(vault, 'Active', 'demo'), { recursive: true });
    fs.mkdirSync(path.join(vault, 'Daily', '2026-09', '2026-09-20'), { recursive: true });
    fs.mkdirSync(path.join(vault, 'Inbox'), { recursive: true });
    fs.mkdirSync(path.join(vault, 'Gallery'), { recursive: true });
    fs.writeFileSync(path.join(vault, 'Active', 'demo', 'STATE.md'), '---\nstatus: active\n---\n# Demo\n- [ ] ship a test\n', 'utf8');
    fs.writeFileSync(path.join(vault, 'Daily', '2026-09', '2026-09-20', 'note.md'), '# Daily\n```python\nprint(1)\n```\n[[event-loop]]\n[[event-loop]]\n', 'utf8');
    fs.writeFileSync(path.join(vault, 'Inbox', 'read.md'), '# Read later\n', 'utf8');
    fs.writeFileSync(path.join(vault, 'Gallery', 'a.png'), Buffer.from([1, 2, 3]));

    const DeskPlugin = requireWithStub(path.join(ROOT, 'main.js'));
    const { app } = makeApp(vault, { maxDepth: 10 });
    const realGetFileCache = app.metadataCache.getFileCache.bind(app.metadataCache);
    app.metadataCache.getFileCache = (file) => ({ frontmatter: (realGetFileCache(file) || {}).frontmatter || {} });
    let metadataResolved = null;
    let metadataChanged = null;
    const originalMetadataOn = app.metadataCache.on.bind(app.metadataCache);
    app.metadataCache.on = (name, callback) => {
      if (name === 'resolved') metadataResolved = callback;
      if (name === 'changed') metadataChanged = callback;
      return originalMetadataOn(name, callback);
    };
    const plugin = new DeskPlugin(app, manifest);
    await plugin.onload();
    const view = plugin._views.get('desk-home')({ app, view: null });
    assert(plugin.settings.activeFolder === '' && plugin.settings.inboxFolder === '',
      'fresh install leaves semantic folder sources unconfigured');
    assert(view.taskScope === 'all', 'fresh task view uses common filtered tasks, not guessed ownership');

    for (const template of registry.TEMPLATE_IDS) {
      plugin.settings.template = template;
      plugin.settings.cards = registry.templateCards(template).join(', ');
      await view.render();
      assert(view.containerEl.querySelectorAll('.desk-card').length > 0, `${template} renders cards`);
      assert(view.containerEl.querySelectorAll('.desk-card-error').length === 0, `${template} has no card errors`);
    }

    view.diagnosticsOpen = true;
    await view.rerender();
    const diagnostics = view.containerEl.textContent || '';
    assert(diagnostics.includes('数据诊断') && diagnostics.includes('Vault Markdown'), 'diagnostics exposes scan counts');
    view.diagnosticsOpen = false;
    await view.rerender();

    const before = fs.readFileSync(path.join(vault, 'Inbox', 'read.md'), 'utf8');
    await view.closeItem({
      cardId: 'digest', cardLabel: 'Inbox', id: 'Inbox/read.md', label: 'Read later',
      sourcePaths: ['Inbox/read.md'], signature: 'v1',
    });
    assert(Object.values(plugin.settings.itemStates).some((record) => record.state === 'closed'), 'item enters recycle bin');
    assert(fs.readFileSync(path.join(vault, 'Inbox', 'read.md'), 'utf8') === before, 'closing does not edit source');
    const key = Object.keys(plugin.settings.itemStates)[0];
    plugin.settings.itemStates[key].closedAt = '2026-07-01T00:00:00.000Z';
    await view.maintainItemStates(new Date('2026-09-20T00:00:00.000Z'));
    assert(plugin.settings.itemStates[key].state === 'archived', '30-day automatic archive');
    const completeModel = view.data.cache;
    assert(typeof metadataResolved === 'function', 'subscribes to metadataCache resolved');
    assert(typeof metadataChanged === 'function', 'subscribes to metadataCache changed');
    assert(completeModel.openTasks.length > 0, 'reads tasks when metadata hints omit list items');
    assert(completeModel.code.blocks > 0, 'reads code when metadata hints omit sections');
    view.data.cache = {
      ...completeModel,
      files: [], tasks: [], openTasks: [], allOpenCount: 0,
      code: { languages: [], total: 0, blocks: 0, recent: [], fresh: [] },
    };
    app.workspace.getLeavesOfType = (type) => type === 'desk-home' ? [{ view }] : [];
    plugin.scheduleRefresh = () => plugin.refreshViews();
    await metadataResolved();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    assert(view.data.cache.code.blocks > 0, 'resolved event repopulates an empty startup model');
    await view.onClose();
    plugin.onunload();
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }

  console.log(`public test: ${passed} passed`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});

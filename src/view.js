'use strict';

const { el, div, span, button, fill } = require('./dom');
const ui = require('./ui');
const { DeskData } = require('./scan');
const registry = require('./registry');
const { registerAll } = require('./cards');
const { dateKey, setFrontmatterField } = require('./util');
const { TASK_LINE } = require('./tasks');
const itemState = require('./item-state');
const { validateVaultFolderPath } = require('./cards/gallery');

const VIEW_TYPE = 'desk-home';

/**
 * Pane-width thresholds for collapsing columns.
 *
 * Derived from what a card needs, not from device sizes: below ~300px per column
 * the row titles wrap after a few characters and the metric tiles stack, so the
 * grid stops being readable before it stops fitting. Two columns therefore need
 * ~620px of pane, three need ~900px.
 */
const NARROW_ONE_COL = 620;
const NARROW_TWO_COL = 900;

/**
 * The workspace view.
 *
 * Rendering is a full rebuild into a detached fragment, then one swap. Partial
 * DOM patching is not worth the complexity here: a rebuild of ~16 cards is well
 * under a frame, and a single swap means no intermediate state is ever painted.
 */
function makeView({ ItemView, Notice, normalizePath }) {
  registerAll();

  return class DeskHomeView extends ItemView {
    constructor(leaf, plugin) {
      super(leaf);
      this.plugin = plugin;
      this.normalize = normalizePath;
      this.data = new DeskData(this.app, plugin.settings, { normalize: normalizePath });
      this.selectedDate = dateKey(new Date());
      // open on my own work, not the whole pile
      this.taskScope = 'all';
      this.pinnedCache = null;
      this.arsenalGroup = 'skills';
      this.galleryPickerOpen = false;
      this.galleryPage = 0;
      this.galleryPaused = false;
      this.galleryTimer = 0;
      this.galleryTimerKey = '';
      this.itemVaultOpen = false;
      this.diagnosticsOpen = false;
      this.itemVaultTab = 'closed';
      this.itemStateSaveTimer = 0;
      this.textPreview = null;
      this.rendering = false;
      this.pendingRender = false;
      // Set while this view writes on the user's behalf, so the resulting vault or
      // settings change does not re-render the textarea being typed in.
      this.suppressRefresh = false;
      this.scratchTimer = 0;
      this.pinnedTimer = 0;
      // Pane-width tracking. `lastCols` is the column count currently painted, so
      // the observer can ignore resizes that do not change it.
      this.paneObserver = null;
      this.paneTimer = 0;
      this.lastCols = 0;
    }

    getViewType() { return VIEW_TYPE; }
    getDisplayText() { return 'Desk'; }
    getIcon() { return 'layout-dashboard'; }

    async onOpen() {
      await this.render();
      // After the first render the pane has a real width, so column narrowing can
      // be measured; observing before this would read 0 and honour the raw setting.
      this.observePaneWidth();
    }

    async onClose() {
      if (this.paneObserver) {
        this.paneObserver.disconnect();
        this.paneObserver = null;
      }
      window.clearTimeout(this.paneTimer);
      window.clearTimeout(this.scratchTimer);
      window.clearTimeout(this.pinnedTimer);
      window.clearTimeout(this.itemStateSaveTimer);
      this.clearGalleryRotation();
    }

    notice(message, timeout) { new Notice(message, timeout); }

    /**
     * Refresh triggered by a vault event or a settings change.
     *
     * Deliberately does NOT drop the skill cache: those files are outside the
     * vault index, so re-reading them on every note edit would put real IO back
     * into what is otherwise a zero-read refresh. Use `hardRefresh()` (the
     * refresh button) to pick up an edited skill immediately.
     */
    async refresh() {
      // A refresh caused by our own write would rebuild the textarea the user is
      // typing in and drop the caret, so skip it.
      if (this.suppressRefresh) return;
      this.clearGalleryRotation();
      this.data.settings = this.plugin.settings;
      this.data.invalidate();
      this.pinnedCache = null;
      this.arsenalGroup = 'skills';
      this.textPreview = null;
      await this.render({ preserveScroll: true });
    }

    /**
     * Everything a plain refresh does, plus dropping caches that no vault event
     * can invalidate (skills in dot-folders). This is what the refresh button
     * calls, so there is always a way to see an external edit at once.
     */
    async hardRefresh() {
      // forgetSkills() invalidates the model cache too, which refresh() then
      // does again — harmless, and clearer than relying on that side effect.
      this.data.forgetSkills();
      await this.refresh();
    }

    /** Re-render from cached data, e.g. after a tab switch. */
    async rerender() { await this.render({ preserveScroll: true }); }

    setTaskScope(scope) {
      this.taskScope = scope;
      this.rerender();
    }

    setArsenalGroup(group) {
      this.arsenalGroup = group;
      this.rerender();
    }

    /**
     * Open an arsenal item.
     *
     * Skills live in dot-folders, which Obsidian excludes from its file index, so
     * `openFile` cannot reach them — there is no TFile to open. For those, show
     * the content in a modal-free way: read it through the adapter and drop it in
     * a new leaf as plain text. Vault-indexed items (templates, SOPs) open normally.
     */
    async openArsenalItem(path) {
      if (!path) return;
      const file = this.app.vault.getAbstractFileByPath(this.normalize(path));
      if (file && !file.children) { await this.openFile(path); return; }
      const adapter = this.app.vault.adapter;
      if (!adapter || typeof adapter.read !== 'function') {
        this.notice(`这个文件不在 Vault 索引里：${path}`);
        return;
      }
      try {
        const content = await adapter.read(this.normalize(path));
        this.showText(path, content);
      } catch {
        this.notice(`读不到：${path}`);
      }
    }

    /**
     * Display text that has no TFile behind it. Uses the plugin's own view rather
     * than creating a note, so browsing a skill never writes to the vault.
     */
    showText(title, content) {
      this.textPreview = { title, content };
      this.rerender();
    }

    closeText() {
      this.textPreview = null;
      this.rerender();
    }

    selectDate(key) {
      this.selectedDate = key;
      this.rerender();
    }

    async openFile(path, line) {
      if (!path) return;
      const file = this.app.vault.getAbstractFileByPath(this.normalize(path));
      if (!file) { this.notice(`找不到文件：${path}`); return; }
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.openFile(file);
      if (typeof line === 'number') {
        const view = leaf.view;
        if (view && view.editor) {
          view.editor.setCursor({ line, ch: 0 });
          view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
        }
      }
    }

    /** Toggle a checkbox in its source file, then refresh. */
    async toggleTask(task) {
      const file = this.app.vault.getAbstractFileByPath(this.normalize(task.path));
      if (!file) { this.notice('源文件已不存在'); return; }
      const content = await this.app.vault.read(file);
      const lines = content.split(/\r?\n/);
      const line = lines[task.line];
      if (!line || !TASK_LINE.test(line)) {
        this.notice('待办行已变化，已刷新');
        await this.refresh();
        return;
      }
      lines[task.line] = line.replace(/\[( |x|X|\/|-)\]/, task.done ? '[ ]' : '[x]');
      await this.app.vault.modify(file, lines.join('\n'));
      await this.refresh();
    }

    /**
     * Close a blocker by writing `status` into its source note.
     *
     * This is a real edit to a real note, not a display-only strike-through: a
     * dashboard state that does not survive a refresh is worse than none, because
     * it makes you believe the loop was closed when nothing was recorded. The note
     * stays the source of truth; the card is only a faster way to write to it.
     *
     * `resolved` for finished work, `obsolete` for work that stopped mattering —
     * the distinction is worth keeping because only the second one is a signal that
     * something was mis-scoped when it was written.
     */
    async resolveBlocker(item, value = 'resolved') {
      const file = this.app.vault.getAbstractFileByPath(this.normalize(item.path));
      if (!file || file.children) { this.notice('源文件已不存在，已刷新'); await this.refresh(); return; }
      let text;
      try {
        text = await this.app.vault.read(file);
      } catch (error) {
        this.notice(`读不到源文件：${error && error.message ? error.message : error}`);
        return;
      }
      const result = setFrontmatterField(text, 'status', value);
      if (!result.ok) {
        this.notice(result.reason === 'malformed'
          ? `${item.title} 的 frontmatter 没有闭合，先手动修一下`
          : '状态没有变化');
        await this.refresh();
        return;
      }
      await this.app.vault.modify(file, result.text);
      this.notice(`${item.title} → status: ${value}`);
      await this.refresh();
    }

    /**
     * Debounced persistence for the editable cards.
     *
     * Two hazards this avoids:
     *  - saving on every keystroke would write settings (or a file) constantly
     *  - a save triggers a vault/settings change, whose refresh would re-render the
     *    textarea and throw away the caret position mid-sentence
     * So writes are debounced, and `suppressRefresh` blocks the refresh they cause.
     */
    queueScratchSave(text) {
      window.clearTimeout(this.scratchTimer);
      this.scratchTimer = window.setTimeout(() => this.flushScratchSave(text), 900);
    }

    async flushScratchSave(text) {
      window.clearTimeout(this.scratchTimer);
      if (this.plugin.settings.scratchText === text) return;
      this.plugin.settings.scratchText = text;
      this.plugin.settings.scratchSavedAt = new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit', minute: '2-digit',
      });
      this.suppressRefresh = true;
      try {
        // saveData, not saveSettings: the latter refreshes every view, which would
        // rebuild the textarea the user is typing in.
        await this.plugin.saveData(this.plugin.settings);
      } finally {
        this.suppressRefresh = false;
      }
    }

    /** Promote scratch text into a real note, so it stops being ephemeral. */
    async scratchToNote(text) {
      const body = String(text || '').trim();
      if (!body) { this.notice('便签是空的'); return; }
      const folder = this.plugin.settings.inboxFolder || '';
      const stamp = dateKey(new Date());
      let path = this.normalize(`${folder ? `${folder}/` : ''}${stamp}_便签.md`);
      // Never overwrite: add a counter if today's note already exists.
      let counter = 2;
      while (this.app.vault.getAbstractFileByPath(path)) {
        path = this.normalize(`${folder ? `${folder}/` : ''}${stamp}_便签-${counter}.md`);
        counter += 1;
      }
      if (folder) await this.plugin.ensureFolder(folder);
      const file = await this.app.vault.create(path, `---\ncreated: ${stamp}\ntype: scratch\n---\n\n${body}\n`);
      await this.app.workspace.getLeaf('tab').openFile(file);
      this.notice(`已存为 ${path}`);
    }

    queuePinnedSave(text) {
      window.clearTimeout(this.pinnedTimer);
      this.pinnedTimer = window.setTimeout(() => this.flushPinnedSave(text), 1200);
    }

    async flushPinnedSave(text) {
      window.clearTimeout(this.pinnedTimer);
      const target = String(this.plugin.settings.pinnedPath || '').trim();
      if (!target) return;
      const file = this.app.vault.getAbstractFileByPath(this.normalize(target));
      if (!file || file.children) return;
      if (this.pinnedCache === text) return;
      this.pinnedCache = text;
      this.suppressRefresh = true;
      try {
        await this.app.vault.modify(file, text);
      } catch (error) {
        this.notice(`保存失败：${error && error.message ? error.message : error}`);
      } finally {
        // Release only after the vault event for our own write has been debounced
        // away, otherwise the refresh it queued still lands on us.
        window.setTimeout(() => { this.suppressRefresh = false; }, 2000);
      }
    }

    async createPinnedNote() {
      const folder = this.plugin.settings.inboxFolder || '';
      const stamp = dateKey(new Date());
      const path = this.normalize(`${folder ? `${folder}/` : ''}${stamp}_工作台便签.md`);
      let file = this.app.vault.getAbstractFileByPath(path);
      if (!file) {
        if (folder) await this.plugin.ensureFolder(folder);
        file = await this.app.vault.create(path, `# 当前焦点\n\n- [ ]\n`);
      }
      this.plugin.settings.pinnedPath = file.path;
      await this.plugin.saveSettings();
    }

    /** Read the pinned note once per refresh so the card stays synchronous. */
    async loadPinned() {
      const target = String(this.plugin.settings.pinnedPath || '').trim();
      if (!target) { this.pinnedCache = null; return; }
      const file = this.app.vault.getAbstractFileByPath(this.normalize(target));
      if (!file || file.children) { this.pinnedCache = null; return; }
      try {
        this.pinnedCache = await this.app.vault.cachedRead(file);
      } catch {
        this.pinnedCache = null;
      }
    }

    explainFilters() {
      const settings = this.plugin.settings;
      this.notice([
        '待办过滤规则：',
        `· 文件超过 ${settings.taskMaxAgeDays} 天没改动`,
        '· 路径命中排除词（模板/问卷/备份/归档/第三方仓库等）',
        '· 问卷选项样式（「其他：」或以冒号结尾）',
        `· 短于 ${settings.taskMinLength} 字`,
        settings.taskPerSource
          ? `另外，同一篇笔记最多展示 ${settings.taskPerSource} 条，避免一个大计划挤掉别的项目。`
          : '',
        '带明确到期日的待办永不过滤、也不限流。切到「全部」看原始清单，规则都在设置里。',
      ].filter(Boolean).join('\n'), 14000);
    }

    /** Create a note for an unresolved concept link, seeded with its backlinks. */
    async createConceptNote(name, source) {
      const folder = this.plugin.settings.conceptFolder || this.plugin.settings.inboxFolder || '';
      const safe = String(name).replace(/[\\/:*?"<>|]/g, '-').trim();
      if (!safe) return;
      const path = this.normalize(`${folder ? `${folder}/` : ''}${safe}.md`);
      let file = this.app.vault.getAbstractFileByPath(path);
      if (!file) {
        if (folder) await this.plugin.ensureFolder(folder);
        const body = [
          '---',
          `created: ${dateKey(new Date())}`,
          'type: concept',
          'status: draft',
          '---',
          '',
          `# ${name}`,
          '',
          '## 一句话解释',
          '',
          '## 为什么会遇到它',
          source ? `- 来自 [[${source.title}]]` : '',
          '',
          '## 还不清楚的',
          '',
        ].filter((part) => part !== null).join('\n');
        file = await this.app.vault.create(path, body);
      }
      await this.app.workspace.getLeaf('tab').openFile(file);
      await this.refresh();
    }


    /** Column count, clamped to what the grid and solver support. */
    /**
     * Columns to render, after narrowing for the pane's actual width.
     *
     * `@media (max-width: …)` cannot do this job: it measures the WINDOW, and this
     * view lives in a pane. With a wide window and a narrow split, the media query
     * never fires and two columns stay jammed into 600px — which is exactly the
     * squashed layout that got reported, with 4-character-wide task titles.
     *
     * Container queries would be the clean fix but need Chromium 105+, the same bar
     * that ruled out `:has()` here; `minAppVersion` is 1.5.0. So the decision is
     * made in JS, like every other layout decision in this file, and CSS stays
     * static.
     *
     * Thresholds are per-column, not absolute: a card needs ~300px before its rows
     * stop wrapping mid-word. Measured against the real cards, not picked.
     */
    columnCount() {
      const raw = Number(this.plugin.settings.columns);
      const wanted = Number.isFinite(raw) ? Math.max(1, Math.min(3, Math.round(raw))) : 2;
      const width = this.paneWidth();
      // 0 means "not laid out yet" (first render, or a hidden leaf). Honour the
      // setting rather than guessing narrow, or every cold open would flash 1 column.
      if (!width) return wanted;
      if (width < NARROW_ONE_COL) return 1;
      if (width < NARROW_TWO_COL) return Math.min(wanted, 2);
      return wanted;
    }

    /** Usable content width of this pane, or 0 when it has no layout yet. */
    paneWidth() {
      const host = this.containerEl && this.containerEl.children
        ? this.containerEl.children[1] : null;
      const node = host || this.containerEl;
      if (!node || typeof node.getBoundingClientRect !== 'function') return 0;
      const width = node.getBoundingClientRect().width;
      return Number.isFinite(width) ? Math.round(width) : 0;
    }

    /**
     * Re-render when the pane crosses a column threshold.
     *
     * Deliberately threshold-triggered rather than resize-triggered: a drag fires
     * dozens of resize events per second, and a full rebuild on each would make
     * dragging a split feel broken. Re-rendering only when the computed column
     * count actually changes means a drag within one band costs nothing.
     */
    observePaneWidth() {
      if (this.paneObserver || typeof ResizeObserver === 'undefined') return;
      const host = this.containerEl && this.containerEl.children
        ? this.containerEl.children[1] : null;
      if (!host) return;
      this.lastCols = this.columnCount();
      this.paneObserver = new ResizeObserver(() => {
        const next = this.columnCount();
        if (next === this.lastCols) return;
        this.lastCols = next;
        // Debounced: a drag can cross two thresholds in one gesture, and the
        // intermediate layout is never worth painting.
        window.clearTimeout(this.paneTimer);
        this.paneTimer = window.setTimeout(() => this.rerender(), 90);
      });
      this.paneObserver.observe(host);
    }

    /** Cards currently enabled, falling back to the active template's set. */
    activeCards() {
      const stored = registry.enabledIds(this.plugin.settings.cards);
      const ids = stored.length
        ? stored
        : registry.templateCards(this.plugin.settings.template || 'general');
      return registry.layout(ids, this.columnCount());
    }

    async render({ preserveScroll = false } = {}) {
      // Coalesce: a burst of vault events must not queue N full rebuilds.
      if (this.rendering) { this.pendingRender = true; return; }
      this.rendering = true;
      try {
        const container = this.containerEl.children[1];
        const heatLeft = preserveScroll
          ? (container.querySelector('.desk-heat-scroll') || {}).scrollLeft || 0
          : null;
        const outerTop = preserveScroll ? container.scrollTop : 0;

        await this.maintainItemStates(new Date());

        const cards = this.activeCards();
        const cols = this.columnCount();
        const rawVh = Number(this.plugin.settings.cardMaxVh);
        // Clamp: below ~40vh cards clip their own head, above 100vh the cap stops
        // meaning anything.
        const maxVh = Number.isFinite(rawVh) ? Math.max(40, Math.min(120, rawVh)) : 72;
        const needs = registry.requiredData(cards);
        if (cards.some((card) => card.id === 'pinned')) await this.loadPinned();
        const model = await this.data.collect(needs);

        const now = new Date();
        const today = dateKey(now);
        if (!this.selectedDate.startsWith(today.slice(0, 7))) this.selectedDate = today;

        const ctx = {
          model,
          settings: this.plugin.settings,
          view: this,
          data: this.data,
          now,
        };
        // Narrow-pane styling keys off this, not a media query: the window can be
        // wide while this pane is 600px, and that is the common case in Obsidian.
        const paneWidth = this.paneWidth();
        const root = div({
          cls: 'desk-root',
          attr: {
            'data-pane': paneWidth < NARROW_ONE_COL ? 'narrow'
              : paneWidth < NARROW_TWO_COL ? 'medium' : 'wide',
          },
        }, [
          div({ cls: 'desk-wash desk-wash-one' }),
          div({ cls: 'desk-wash desk-wash-two' }),
          div({ cls: 'desk-wash desk-wash-three' }),
          el('main', { cls: 'desk-shell' }, [
            this.renderHero(ctx),
            this.renderDock(ctx),
            el('section', {
              cls: 'desk-grid',
              attr: { 'data-cols': String(cols) },
              // The grid's column count and the card height cap are both settings,
              // applied as custom properties so the stylesheet stays static.
              style: {
                '--desk-cols': String(cols),
                '--desk-card-max': `${maxVh}vh`,
              },
            }, cards.map((card) => this.renderCard(card, ctx))),
            this.renderFooter(ctx),
          ]),
          this.renderItemVault(),
          this.renderDiagnostics(ctx),
          this.renderTextPreview(),
        ]);

        fill(container, root);
        if (preserveScroll) {
          container.scrollTop = outerTop;
          const scroller = container.querySelector('.desk-heat-scroll');
          if (scroller && heatLeft) scroller.scrollLeft = heatLeft;
        } else {
          const scroller = container.querySelector('.desk-heat-scroll');
          // Newest week is at the right edge, which is what you want to see first.
          if (scroller) scroller.scrollLeft = scroller.scrollWidth;
        }
      } finally {
        this.rendering = false;
        if (this.pendingRender) {
          this.pendingRender = false;
          await this.render({ preserveScroll: true });
        }
      }
    }

    /** One card, wrapped in its article shell. Errors are contained per card. */
    renderCard(card, ctx) {
      const cls = [
        'desk-card',
        `desk-card-${card.id}`,
        // How many grid columns this card occupies, as decided by the solver for
        // the current column count. `is-full`/`is-half` are kept as stable hooks
        // for user CSS snippets but no longer drive placement.
        `desk-span-${card.cols || 1}`,
        `is-${card.span}`,
        card.stretch ? 'is-stretch' : '',
        // A compact card opts out of row stretching so spare height does not
        // become dead space inside a fixed-size body.
        card.grow === 'compact' ? 'is-compact' : '',
      ];
      try {
        const node = el('article', { cls }, card.render(ctx));
        // Safety net. A stretching card with nothing to absorb its spare height
        // shows that height as dead space — the exact defect this mechanism
        // exists to prevent. Rather than trusting every card (and every future
        // card, and every early-return branch inside them) to mark a filling
        // element, promote the last plausible candidate here.
        if (card.grow !== 'compact' && !node.querySelector('.desk-fill')) {
          const candidates = node.querySelectorAll('.desk-row-list, .desk-task-list, .desk-empty, .desk-hint');
          const last = candidates[candidates.length - 1];
          if (last) last.classList.add('desk-fill');
        }
        const filler = node.querySelector('.desk-fill');
        if (filler) {
          node.classList.add('has-fill');
          // Every wrapper between the card and the filling element must also be
          // allowed to grow, otherwise the fill has no space to expand into and
          // the height reappears as dead space below the wrapper.
          // `is-growing` on wrappers (may grow) is a different statement from
          // `has-fill` on the card (a trailing section must not push to bottom).
          let parent = filler.parentElement;
          while (parent && parent !== node) {
            parent.classList.add('is-growing');
            parent = parent.parentElement;
          }
        }
        return node;
      } catch (error) {
        // A broken card must not blank the whole dashboard.
        console.error(`[desk] card ${card.id} failed to render`, error);
        return el('article', { cls: [...cls, 'is-error'] }, [
          ui.cardHead('ERROR', card.label),
          ui.empty(`这张卡片渲染失败：${error && error.message ? error.message : error}`, '其它卡片不受影响。可以在设置里先关掉它。'),
        ]);
      }
    }

    /**
     * Turn a vault-relative image path into a URL the renderer can display.
     *
     * Returns '' for anything unusable — a missing file, a folder, or a
     * non-image — so a typo in settings degrades to the plain background rather
     * than a broken image. Only vault files are accepted: no http(s), which would
     * make this plugin fetch over the network.
     */
    resolveHeroImage(configured) {
      const target = String(configured || '').trim();
      if (!target) return '';
      if (/^(https?|data):/i.test(target)) {
        // Loading a remote image would break the local-only guarantee, silently.
        return '';
      }
      const file = this.app.vault.getAbstractFileByPath(this.normalize(target));
      if (!file || file.children) return '';
      if (!/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(file.name)) return '';
      const adapter = this.app.vault.adapter;
      if (!adapter || typeof adapter.getResourcePath !== 'function') return '';
      return adapter.getResourcePath(file.path);
    }

    /**
     * A displayable URL for a vault image path.
     *
     * Same rule as the hero: only vault files, only through the adapter. Returning
     * '' rather than throwing lets the gallery skip a file that vanished between
     * the scan and the render without taking the card down with it.
     */
    resolveImage(imagePath) {
      const target = String(imagePath || '').trim();
      if (!target || /^(https?|data):/i.test(target)) return '';
      const adapter = this.app.vault.adapter;
      if (!adapter || typeof adapter.getResourcePath !== 'function') return '';
      const file = this.app.vault.getAbstractFileByPath(this.normalize(target));
      if (!file || file.children) return '';
      return adapter.getResourcePath(file.path);
    }

    /** Make a folder the gallery source, from inside the card. */
    async setGalleryFolder(folder) {
      this.galleryPickerOpen = false;
      this.galleryPage = 0;
      this.galleryPaused = false;
      this.clearGalleryRotation();
      this.plugin.settings.galleryFolder = String(folder || '').trim();
      await this.plugin.saveSettings();
      this.notice(folder ? `画面墙已指向 ${folder}` : '画面墙已清空');
    }

    /** Create a safe Vault-relative folder and use it as the gallery source. */
    async createGalleryFolder(input) {
      const checked = validateVaultFolderPath(input);
      if (!checked.ok) { this.notice(checked.error); return false; }
      await this.plugin.ensureFolder(checked.path);
      const folder = this.app.vault.getAbstractFileByPath(this.normalize(checked.path));
      if (!folder || !folder.children) {
        this.notice(`目录创建失败：${checked.path}`);
        return false;
      }
      await this.setGalleryFolder(checked.path);
      return true;
    }

    clearGalleryRotation() {
      if (this.galleryTimer) window.clearInterval(this.galleryTimer);
      this.galleryTimer = 0;
      this.galleryTimerKey = '';
    }

    configureGalleryRotation(total, pageSize) {
      const pages = Math.max(1, Math.ceil(total / pageSize));
      if (this.galleryPage >= pages) this.galleryPage = 0;
      const enabled = this.plugin.settings.galleryAutoRotate !== false;
      const seconds = Math.max(3, Math.min(60, Number(this.plugin.settings.galleryRotateSeconds) || 8));
      const key = `${total}:${pageSize}:${seconds}:${enabled}:${this.galleryPaused}`;
      if (key === this.galleryTimerKey) return;
      this.clearGalleryRotation();
      this.galleryTimerKey = key;
      if (!enabled || this.galleryPaused || pages <= 1) return;
      this.galleryTimer = window.setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        this.galleryPage = (this.galleryPage + 1) % pages;
        this.rerender();
      }, seconds * 1000);
    }

    shiftGalleryPage(delta, pages) {
      if (pages <= 1) return;
      this.galleryPage = (this.galleryPage + delta + pages) % pages;
      this.clearGalleryRotation();
      this.rerender();
    }

    async toggleGalleryRotation() {
      if (this.plugin.settings.galleryAutoRotate === false) {
        this.plugin.settings.galleryAutoRotate = true;
        this.galleryPaused = false;
        await this.plugin.saveSettings();
      } else {
        this.galleryPaused = !this.galleryPaused;
      }
      this.clearGalleryRotation();
      this.rerender();
    }

    itemStates() {
      const normalized = itemState.normalizeItemStates(this.plugin.settings.itemStates);
      this.plugin.settings.itemStates = normalized;
      return normalized;
    }

    scheduleItemStateSave() {
      window.clearTimeout(this.itemStateSaveTimer);
      this.itemStateSaveTimer = window.setTimeout(() => this.plugin.saveSettings(), 80);
    }

    async maintainItemStates(now = new Date()) {
      const before = this.itemStates();
      const swept = itemState.sweepExpired(before, now, this.plugin.settings.trashArchiveDays);
      if (swept.changed) {
        this.plugin.settings.itemStates = swept.states;
        await this.plugin.saveSettings();
      }
    }

    isItemHidden(item) {
      const states = this.itemStates();
      const visibility = itemState.itemVisibility(states, item);
      if (!visibility.record) return false;
      if (visibility.changed && visibility.record.state === 'closed') {
        delete states[visibility.key];
        this.plugin.settings.itemStates = states;
        this.scheduleItemStateSave();
        return false;
      }
      if (visibility.changed && visibility.record.state === 'archived' && !visibility.record.sourceUpdated) {
        states[visibility.key] = { ...visibility.record, sourceUpdated: true };
        this.plugin.settings.itemStates = states;
        this.scheduleItemStateSave();
      }
      return visibility.hidden;
    }

    async closeItem(item) {
      this.plugin.settings.itemStates = itemState.closeItem(this.itemStates(), item, new Date());
      await this.plugin.saveSettings();
      this.notice('已移入 Desk 回收站；不会删除源文件');
      await this.rerender();
    }

    async restoreItem(key) {
      this.plugin.settings.itemStates = itemState.restoreItem(this.itemStates(), key);
      await this.plugin.saveSettings();
      await this.rerender();
    }

    async archiveItem(key) {
      this.plugin.settings.itemStates = itemState.archiveItem(this.itemStates(), key, new Date());
      await this.plugin.saveSettings();
      await this.rerender();
    }

    async archiveAllItems() {
      this.plugin.settings.itemStates = itemState.archiveAll(this.itemStates(), new Date());
      await this.plugin.saveSettings();
      this.itemVaultTab = 'archived';
      await this.rerender();
    }

    async restoreAllItems(state) {
      this.plugin.settings.itemStates = itemState.restoreAll(this.itemStates(), state);
      await this.plugin.saveSettings();
      await this.rerender();
    }

    openItemVault(tab = 'closed') {
      this.itemVaultOpen = true;
      this.itemVaultTab = tab;
      this.rerender();
    }

    closeItemVault() {
      this.itemVaultOpen = false;
      this.rerender();
    }

    renderItemVaultButton() {
      const summary = itemState.counts(this.itemStates());
      if (!summary.total) return null;
      return button({
        cls: 'desk-recycle-button',
        text: `回收站 ${summary.closed}`,
        title: `回收站 ${summary.closed} 项 · 归档 ${summary.archived} 项`,
        onClick: () => this.openItemVault(summary.closed ? 'closed' : 'archived'),
      });
    }

    renderItemVault() {
      if (!this.itemVaultOpen) return null;
      const states = this.itemStates();
      const summary = itemState.counts(states);
      const tab = this.itemVaultTab === 'archived' ? 'archived' : 'closed';
      const records = Object.entries(states)
        .filter(([, record]) => record.state === tab)
        .sort((a, b) => String(b[1].archivedAt || b[1].closedAt).localeCompare(String(a[1].archivedAt || a[1].closedAt)));
      const days = Number(this.plugin.settings.trashArchiveDays) || 0;
      return div({ cls: 'desk-recycle-overlay', onClick: (event) => {
        if (event.target && event.target.classList.contains('desk-recycle-overlay')) this.closeItemVault();
      } }, [
        el('aside', { cls: 'desk-recycle-drawer', attr: { role: 'dialog', 'aria-label': 'Desk 回收站' } }, [
          div({ cls: 'desk-recycle-head' }, [
            div({}, [span({ text: 'DESK' }), el('h2', { text: '回收站与归档' })]),
            button({ cls: 'desk-head-btn', text: '关闭', onClick: () => this.closeItemVault() }),
          ]),
          div({ cls: 'desk-recycle-tabs' }, [
            button({ cls: tab === 'closed' ? 'is-active' : '', text: `回收站 ${summary.closed}`, onClick: () => { this.itemVaultTab = 'closed'; this.rerender(); } }),
            button({ cls: tab === 'archived' ? 'is-active' : '', text: `归档 ${summary.archived}`, onClick: () => { this.itemVaultTab = 'archived'; this.rerender(); } }),
          ]),
          tab === 'closed'
            ? el('p', { cls: 'desk-recycle-note', text: days > 0 ? `项目关闭 ${days} 天后，在下次打开或刷新 Desk 时自动归档。` : '自动归档已关闭。' })
            : el('p', { cls: 'desk-recycle-note', text: '归档只隐藏工作台项目，不删除、移动或修改源文件。' }),
          records.length
            ? div({ cls: 'desk-recycle-list' }, records.map(([key, record]) => div({ cls: 'desk-recycle-item' }, [
              div({ cls: 'desk-recycle-item-main' }, [
                span({ text: record.cardLabel || record.cardId || '工作台项目' }),
                el('strong', { text: record.label }),
                el('small', { text: record.sourceUpdated ? '归档后源数据有更新' : (record.sourcePaths[0] || '计算项目') }),
              ]),
              div({ cls: 'desk-recycle-actions' }, [
                record.sourcePaths[0] ? button({ cls: 'desk-head-btn', text: '打开', onClick: () => this.openFile(record.sourcePaths[0]) }) : null,
                button({ cls: 'desk-head-btn', text: '恢复', onClick: () => this.restoreItem(key) }),
                tab === 'closed' ? button({ cls: 'desk-head-btn', text: '归档', onClick: () => this.archiveItem(key) }) : null,
              ]),
            ])))
            : div({ cls: 'desk-recycle-empty', text: tab === 'closed' ? '回收站是空的。' : '还没有归档项目。' }),
          records.length ? div({ cls: 'desk-recycle-footer' }, [
            button({ cls: 'desk-head-btn', text: '恢复全部', onClick: () => this.restoreAllItems(tab) }),
            tab === 'closed' ? button({ cls: 'desk-head-btn', text: '全部归档', onClick: () => this.archiveAllItems() }) : null,
          ]) : null,
        ]),
      ]);
    }

    renderDiagnostics(ctx) {
      if (!this.diagnosticsOpen) return null;
      const { model, settings } = ctx;
      const vaultMarkdown = this.app.vault.getMarkdownFiles ? this.app.vault.getMarkdownFiles().length : model.files.length;
      const sources = [['扫描范围', settings.workRoot || '整个 Vault'], ['收件箱', settings.inboxFolder || '未配置'],
        ['研究目录', settings.researchFolder || '未配置'], ['项目目录', settings.projectFolder || '未配置'],
        ['进行中项目', settings.activeFolder || '未配置'], ['阻塞目录', settings.blockerFolder || '未配置']];
      const metrics = [['Vault Markdown', vaultMarkdown], ['进入模型', model.files.length], ['原始未完成', model.allOpenCount],
        ['规则过滤', model.hiddenCount], ['来源限流', model.cappedCount], ['有效待办', model.openTasks.length],
        ['代码块', model.code ? model.code.blocks : '未启用'], ['待处理', model.digest ? model.digest.length : '未启用'],
        ['最近项目', model.recent ? model.recent.length : '未启用'], ['扫描耗时', `${model.scanMs || 0}ms`]];
      const warnings = [];
      if (settings.workRoot && !this.app.vault.getAbstractFileByPath(this.normalize(settings.workRoot))) warnings.push(`扫描根目录不存在：${settings.workRoot}`);
      if (vaultMarkdown > 0 && model.files.length === 0) warnings.push('Vault 有 Markdown，但当前模型为 0；请检查扫描范围或索引状态。');
      return div({ cls: ['desk-diagnostics-overlay', 'desk-recycle-overlay'], onClick: (event) => {
        if (event.target && event.target.classList.contains('desk-diagnostics-overlay')) { this.diagnosticsOpen = false; this.rerender(); }
      } }, [el('aside', { cls: ['desk-diagnostics-drawer', 'desk-recycle-drawer'], attr: { role: 'dialog', 'aria-label': 'Desk 数据诊断' } }, [
        div({ cls: 'desk-recycle-head' }, [div({}, [span({ text: 'DESK' }), el('h2', { text: '数据诊断' })]),
          button({ cls: 'desk-head-btn', text: '关闭', onClick: () => { this.diagnosticsOpen = false; this.rerender(); } })]),
        warnings.length ? div({ cls: 'desk-diagnostics-warnings' }, warnings.map((text) => el('p', { text }))) : null,
        div({ cls: 'desk-diagnostics-grid' }, metrics.map(([label, value]) => div({}, [span({ text: label }), el('b', { text: String(value) })]))),
        el('section', { cls: 'desk-diagnostics-sources' }, [el('h3', { text: '数据来源配置' }),
          ...sources.map(([label, value]) => div({}, [span({ text: label }), el('code', { text: String(value) })]))]),
        el('p', { cls: 'desk-recycle-note', text: '“未配置”与“已配置但没有数据”是不同状态。诊断只读取统计，不修改任何笔记。' }),
      ])]);
    }

    renderHero(ctx) {
      const { model, settings, now } = ctx;
      const today = dateKey(now);
      const hour = now.getHours();
      const greeting = hour < 6 ? '还没睡' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
      const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      const name = String(settings.displayName || '').trim();
      const message = String(settings.dailyMessage || '').trim();
      const dueToday = model.openTasks.filter((task) => {
        const due = task.due || task.scheduled;
        return due && due <= today;
      }).length;
      const stale = (model.active || []).filter((stream) => stream.stale).length;
      const template = registry.TEMPLATES.find((item) => item.id === (settings.template || 'general'));

      // Optional background, resolved from a vault file. getResourcePath turns a
      // TFile into a URL the renderer can use without copying the image anywhere.
      const heroImage = this.resolveHeroImage(settings.heroImage);

      return el('header', {
        cls: ['desk-hero', heroImage ? 'has-image' : ''],
        style: heroImage ? { '--desk-hero-image': `url("${heroImage}")` } : null,
      }, [
        div({}, [
          div({ cls: 'desk-kicker', text: template ? template.label.toUpperCase() : 'DESK' }),
          el('h1', { text: name ? `${greeting}，${name}` : greeting }),
          el('p', { text: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}` }),
          message ? el('p', { cls: 'desk-focus', text: message }) : null,
        ]),
        div({ cls: 'desk-hero-side' }, [
          div({ cls: 'desk-status' }, [
            span({ cls: 'desk-dot' }),
            span({ text: `本地扫描 ${model.files.length} 篇` }),
            button({ cls: 'desk-head-btn', text: '刷新', onClick: () => this.hardRefresh() }),
            button({ cls: 'desk-head-btn', text: '数据诊断', onClick: () => { this.diagnosticsOpen = true; this.rerender(); } }),
            this.renderItemVaultButton(),
          ]),
          div({ cls: 'desk-pills' }, [
            span({ cls: dueToday ? 'is-warn' : '', text: `${dueToday} 条到期` }),
            span({ cls: stale ? 'is-warn' : '', text: `${stale} 条停滞` }),
            span({ text: `${model.openTasks.length} 条待办` }),
            model.hiddenCount ? span({ cls: 'is-muted', text: `已滤 ${model.hiddenCount}` }) : null,
          ]),
        ]),
      ]);
    }

    renderDock(ctx) {
      const actions = this.plugin.quickActions();
      if (!actions.length) return null;
      return el('section', { cls: 'desk-dock' }, [
        div({ cls: 'desk-dock-head' }, [
          div({}, [span({ text: 'QUICK ACTIONS' }), el('h2', { text: '从这里继续今天的工作' })]),
        ]),
        div({ cls: 'desk-dock-grid' }, actions.map((item, index) => button({
          onClick: () => this.plugin.runQuickAction(item.id),
        }, [
          el('i', { text: String(index + 1).padStart(2, '0') }),
          span({}, [
            el('strong', { text: item.label }),
            el('small', { text: item.desc }),
          ]),
          el('b', { text: '→' }),
        ]))),
      ]);
    }

    /**
     * Overlay for text that has no note behind it (a skill in a dot-folder).
     * Read-only on purpose: these are agent config files, and editing them from a
     * dashboard would be a surprising way to change how the assistant behaves.
     */
    renderTextPreview() {
      if (!this.textPreview) return null;
      const { title, content } = this.textPreview;
      return div({ cls: 'desk-preview', onClick: (event) => {
        // Click the backdrop, not the panel, to dismiss.
        if (event.target && event.target.classList.contains('desk-preview')) this.closeText();
      } }, [
        div({ cls: 'desk-preview-panel' }, [
          div({ cls: 'desk-preview-head' }, [
            div({}, [
              span({ text: 'READ ONLY' }),
              el('strong', { text: title.split('/').slice(-2).join('/') }),
            ]),
            button({ cls: 'desk-head-btn', text: '关闭', onClick: () => this.closeText() }),
          ]),
          el('pre', { cls: 'desk-preview-body' }, [el('code', { text: content })]),
        ]),
      ]);
    }

    renderFooter(ctx) {
      const { model } = ctx;
      const bits = [
        `${model.openTasks.length} 待办`,
        model.active ? `${model.active.length} 条在飞` : null,
        model.code ? `${model.code.blocks} 个代码块` : null,
        model.scanMs ? `扫描 ${model.scanMs}ms` : null,
      ].filter(Boolean);
      return el('footer', { cls: 'desk-footer' }, [
        span({ text: 'DESK · LOCAL ONLY' }),
        span({ text: bits.join(' · ') }),
      ]);
    }
  };
}

module.exports = { makeView, VIEW_TYPE };

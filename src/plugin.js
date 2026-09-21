'use strict';

const { DEFAULTS } = require('./settings');
const { detectLayout } = require('./settings');
const { makeView, VIEW_TYPE } = require('./view');
const { makeSettingTab } = require('./settingtab');
const { registerAll } = require('./cards');
const registry = require('./registry');
const { dateKey, parseList } = require('./util');

/**
 * Plugin entry. Obsidian classes are injected rather than required at module
 * scope so the whole tree can be loaded and tested in plain node.
 */
function makePlugin(obsidian) {
  const { Plugin, Notice, normalizePath } = obsidian;
  const DeskHomeView = makeView(obsidian);
  const DeskSettingTab = makeSettingTab(obsidian);
  registerAll();

  return class DeskPlugin extends Plugin {
    async onload() {
      await this.loadSettings();

      this.registerView(VIEW_TYPE, (leaf) => new DeskHomeView(leaf, this));

      this.addRibbonIcon('layout-dashboard', 'Desk', () => this.openDesk());
      this.addCommand({ id: 'open', name: '打开 Desk 工作台', callback: () => this.openDesk() });
      this.addCommand({ id: 'refresh', name: '刷新 Desk 数据', callback: () => this.refreshViews() });
      registry.TEMPLATES.forEach((template) => {
        this.addCommand({
          id: `template-${template.id}`,
          name: `切换到「${template.label}」模板`,
          callback: () => this.applyTemplate(template.id),
        });
      });
      this.addSettingTab(new DeskSettingTab(this.app, this));

      // Vault edits invalidate the scan cache; debounced so bulk writes do not thrash
      ['modify', 'create', 'delete', 'rename'].forEach((event) => {
        this.registerEvent(this.app.vault.on(event, () => this.scheduleRefresh()));
      });

      // Recompute after Obsidian finishes its all-note metadata index.
      this.registerEvent(this.app.metadataCache.on('resolved', () => this.scheduleRefresh()));

      this.app.workspace.onLayoutReady(() => {
        if (this.settings.firstRun) this.runFirstRunDetection();
        if (this.settings.autoOpen && !this.app.workspace.getLeavesOfType(VIEW_TYPE).length) {
          this.openDesk(false);
        }
        this.startupRefreshTimer = window.setTimeout(() => this.refreshViews(), 2500);
      });
    }

    async loadSettings() {
      const saved = (await this.loadData()) || {};
      // A key saved as null/undefined must not shadow a new default, otherwise
      // adding a setting silently disables the feature for existing installs.
      // Note: '' is a legitimate saved value (an intentionally blank folder),
      // so only null/undefined are stripped.
      Object.keys(saved).forEach((key) => {
        if (saved[key] === null || saved[key] === undefined) delete saved[key];
      });
      const isFresh = Object.keys(saved).length === 0;
      this.settings = Object.assign({}, DEFAULTS, saved);
      this.settings.firstRun = isFresh;

      if (isFresh) {
        this.settings.cards = registry.templateCards(this.settings.template).join(', ');
      } else {
        // Upgrading an existing install: keep the user's own card selection, but
        // drop ids that no longer exist so a removed card cannot wedge the view.
        const kept = registry.enabledIds(this.settings.cards);
        const dropped = parseList(this.settings.cards).length - kept.length;
        if (dropped > 0) this.settings.cards = kept.join(', ');
        if (!kept.length) {
          this.settings.cards = registry.templateCards(this.settings.template || 'general').join(', ');
        }
      }
      // persist so newly added defaults are visible in the settings UI
      if (isFresh || Object.keys(DEFAULTS).some((key) => !(key in saved))) {
        await this.saveData(this.settings);
      }
    }

    /**
     * On a brand-new install, guess this vault's layout so the first render shows
     * real data instead of six "configure me" boxes.
     */
    async runFirstRunDetection() {
      const folders = this.app.vault.getAllLoadedFiles()
        .filter((file) => file.children)
        .map((file) => file.path)
        .filter((path) => path && path !== '/');
      const counts = {};
      this.app.vault.getMarkdownFiles().forEach((file) => {
        let dir = file.path.split('/').slice(0, -1).join('/');
        while (dir) {
          counts[dir] = (counts[dir] || 0) + 1;
          dir = dir.split('/').slice(0, -1).join('/');
        }
      });
      const detected = detectLayout(folders, counts);
      const applied = Object.entries(detected).filter(([, value]) => value);
      applied.forEach(([key, value]) => { this.settings[key] = value; });
      this.settings.firstRun = false;
      await this.saveData(this.settings);
      if (applied.length) {
        new Notice(`Desk：识别到 ${applied.length} 个目录，已自动配置。设置里可以改。`, 8000);
      }
      await this.refreshViews();
    }

    async applyTemplate(id) {
      this.settings.template = id;
      this.settings.cards = registry.templateCards(id).join(', ');
      await this.saveSettings();
      const template = registry.TEMPLATES.find((item) => item.id === id);
      new Notice(`Desk：已切换到「${template ? template.label : id}」`);
      await this.openDesk();
    }

    onunload() {
      window.clearTimeout(this.refreshTimer);
      window.clearTimeout(this.startupRefreshTimer);
    }

    async saveSettings() {
      await this.saveData(this.settings);
      await this.refreshViews();
    }

    scheduleRefresh() {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => this.refreshViews(), 1500);
    }

    async refreshViews() {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
        if (leaf.view && leaf.view.refresh) await leaf.view.refresh();
      }
    }

    async openDesk(reveal = true) {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
      if (existing) {
        if (reveal) this.app.workspace.revealLeaf(existing);
        return;
      }
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: reveal });
      if (reveal) this.app.workspace.revealLeaf(leaf);
    }

    /** Quick actions adapt to which folders this vault actually has. */
    quickActions() {
      const actions = [];
      if (this.settings.dailyFolder) {
        actions.push({ id: 'daily-report', label: '写今天的日报', desc: '打开或新建当天日报' });
        actions.push({ id: 'daily-draft', label: '今天的草稿箱', desc: '定位当天 drafts 目录' });
      }
      if (this.settings.activeFolder) {
        actions.push({ id: 'open-active', label: '进行中的线', desc: '跨天未闭环的工作' });
      }
      if (this.settings.inboxFolder) {
        actions.push({ id: 'open-inbox', label: '收件箱', desc: '待归类的材料' });
      }
      actions.push({ id: 'git-sync', label: 'Git 同步', desc: '调用 obsidian-git 提交并推送' });
      actions.push({ id: 'terminal', label: '打开终端', desc: '调用 terminal 插件' });
      return actions;
    }

    /** Path of the day folder: <daily>/YYYY-MM/YYYY-MM-DD */
    dayFolder(key) {
      return normalizePath(`${this.settings.dailyFolder}/${key.slice(0, 7)}/${key}`);
    }

    async ensureFolder(path) {
      const parts = normalizePath(path).split('/');
      let current = '';
      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (!this.app.vault.getAbstractFileByPath(current)) {
          try { await this.app.vault.createFolder(current); } catch { /* raced or exists */ }
        }
      }
    }

    async revealDay(key) {
      if (!key || !this.settings.dailyFolder) return;
      const folder = this.dayFolder(key);
      if (!this.app.vault.getAbstractFileByPath(folder)) {
        new Notice(`还没有 ${key} 的目录`);
        return;
      }
      this.revealFolder(folder);
    }

    /** Focus a folder in the file explorer. */
    revealFolder(path) {
      if (!path) { new Notice('这个库没有配置对应目录'); return; }
      const target = this.app.vault.getAbstractFileByPath(normalizePath(path));
      if (!target) { new Notice(`找不到目录：${path}`); return; }
      const explorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
      if (!explorer) { new Notice(normalizePath(path)); return; }
      this.app.workspace.revealLeaf(explorer);
      if (explorer.view && explorer.view.revealInFolder) explorer.view.revealInFolder(target);
    }

    async runQuickAction(id) {
      const today = dateKey(new Date());
      if (id === 'daily-report') return this.openDailyReport(today);
      if (id === 'daily-draft') {
        const folder = normalizePath(`${this.dayFolder(today)}/${today}-drafts`);
        await this.ensureFolder(folder);
        this.revealFolder(folder);
        return undefined;
      }
      if (id === 'open-active') { this.revealFolder(this.settings.activeFolder); return undefined; }
      if (id === 'open-inbox') { this.revealFolder(this.settings.inboxFolder); return undefined; }
      if (id === 'git-sync') { this.invokeCommand(/^obsidian-git:.*(sync|Sync)/, 'obsidian-git 未启用'); return undefined; }
      if (id === 'terminal') { this.invokeCommand(/^terminal:.*(integrated|current)/, 'terminal 插件未启用'); return undefined; }
      return undefined;
    }

    async openDailyReport(today) {
      const folder = this.dayFolder(today);
      const path = normalizePath(`${folder}/${today}_日报.md`);
      let file = this.app.vault.getAbstractFileByPath(path);
      if (!file) {
        await this.ensureFolder(folder);
        // date-only timestamps, per the vault's daily-report convention
        const body = [
          '---',
          `date: ${today}`,
          'type: daily-report',
          'status: draft',
          '---',
          '',
          `# ${today} 日报`,
          '',
          '## 今天做了什么',
          '',
          '## 产出与位置',
          '',
          '## 阻塞与风险',
          '',
          '## 今天想清楚的',
          '',
          '## 需要确认的问题',
          '',
        ].join('\n');
        file = await this.app.vault.create(path, body);
      }
      await this.app.workspace.getLeaf('tab').openFile(file);
      return file;
    }

    /** Run another plugin's command by id pattern, without hard-depending on it. */
    invokeCommand(pattern, fallbackMessage) {
      const commands = this.app.commands.listCommands();
      const hit = commands.find((command) => pattern.test(command.id));
      if (!hit) { new Notice(fallbackMessage); return; }
      this.app.commands.executeCommandById(hit.id);
    }
  };
}

module.exports = { makePlugin, VIEW_TYPE };

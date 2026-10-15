'use strict';

const registry = require('./registry');
const { registerAll } = require('./cards');
const { parseList } = require('./util');
const { detectLayout } = require('./settings');

const TEXT_FIELDS = [
  ['displayName', '首页称呼', '问候语里显示的名字，留空只显示问候'],
  ['dailyMessage', '每日寄语', '留空则不显示'],
  ['workRoot', '扫描根目录', '只扫这个目录下的笔记，留空扫全库'],
  ['activeFolder', '进行中目录', '跨天未闭环的工作线，例如 11-Active'],
  ['dailyFolder', '日报目录', '例如 01-Daily'],
  ['projectFolder', '项目目录', '例如 02-Projects'],
  ['researchFolder', '研究目录', '例如 06-Research'],
  ['blockerFolder', '阻塞目录', '例如 04-Blockers'],
  ['inboxFolder', '收件箱目录', '例如 00-Inbox'],
  ['conceptFolder', '概念笔记目录', '学习模板用：点「概念债」新建笔记时放哪'],
  ['pinnedPath', '钉住的笔记', '「钉住的笔记」卡片直接编辑这个文件；留空则卡片里可以新建'],
  ['heroImage', '顶部背景图', 'Vault 里的图片路径，例如 assets/desk-bg.jpg。留空则用纯色。插件不自带图片也不联网取图'],
  ['galleryFolder', '画面墙目录', '「画面墙」卡片显示这个目录里的图片，例如 02-Projects/设计稿。留空则卡片会提示你选一个'],
  ['skillFolders', '能力目录', '武器库用：存放 skill 的目录，逗号分隔。每个 skill 是一个含 SKILL.md 的子文件夹'],
  ['templateFolder', '模板目录', '武器库用：可复用文档模板所在目录'],
];

const NUMBER_FIELDS = [
  ['staleDays', '停滞阈值（天）', '进行中的线超过这个天数没动就标红'],
  ['taskLimit', '待办文件显示数', '文件列表初始显示数，每次点显示更多追加同样数量'],
  ['heatWeeks', '热力图周数', '产出热力图统计多少周'],
  ['taskMaxAgeDays', '台历任务最大天数', '仅影响台历候选任务；待办文件计数不按天数隐藏。设 0 关闭'],
  ['taskMinLength', '台历任务最短字数', '仅影响台历候选任务；待办文件计数保留所有解析出的未完成项'],
  ['taskPerSource', '台历同一笔记上限', '仅影响台历候选任务；待办文件始终显示完整计数。设 0 关闭'],
  ['reviewMinDays', '复习间隔（天）', '学习模板用：超过这个天数没打开的笔记进复习队列'],
];

function makeSettingTab({ PluginSettingTab, Setting, Notice }) {
  registerAll();

  return class DeskSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
      super(app, plugin);
      this.plugin = plugin;
    }

    async save() {
      await this.plugin.saveSettings();
    }

    display() {
      const { containerEl } = this;
      containerEl.empty();

      this.renderTemplates(containerEl);
      this.renderCardToggles(containerEl);
      this.renderDetect(containerEl);
      this.renderFields(containerEl);
    }

    renderTemplates(containerEl) {
      containerEl.createEl('h3', { text: '模板' });
      const current = this.plugin.settings.template || 'general';
      const active = registry.TEMPLATES.find((item) => item.id === current);
      new Setting(containerEl)
        .setName('当前模板')
        .setDesc(active ? active.desc : '选一套预设，再按需开关单张卡片')
        .addDropdown((dropdown) => {
          registry.TEMPLATES.forEach((item) => dropdown.addOption(item.id, item.label));
          dropdown.setValue(current);
          dropdown.onChange(async (value) => {
            this.plugin.settings.template = value;
            // Applying a template resets the card set but keeps tuned thresholds.
            this.plugin.settings.cards = registry.templateCards(value).join(', ');
            await this.save();
            this.display();
          });
        });

      new Setting(containerEl)
        .setName('恢复这套模板的默认卡片')
        .setDesc('如果你关掉了太多卡片，用这个回到模板默认组合')
        .addButton((btn) => btn.setButtonText('恢复').onClick(async () => {
          this.plugin.settings.cards = registry.templateCards(current).join(', ');
          await this.save();
          this.display();
        }))
        .addButton((btn) => btn.setButtonText('全部打开').onClick(async () => {
          this.plugin.settings.cards = registry.allCards().map((card) => card.id).join(', ');
          await this.save();
          this.display();
        }));
      new Setting(containerEl)
        .setName('回收站自动归档')
        .setDesc('关闭项目在下次打开或刷新 Desk 时，超过期限自动移入归档；不会删除源文件。')
        .addDropdown((dropdown) => {
          dropdown.addOption('7', '7 天');
          dropdown.addOption('30', '30 天');
          dropdown.addOption('90', '90 天');
          dropdown.addOption('0', '永不自动归档');
          dropdown.setValue(String(this.plugin.settings.trashArchiveDays ?? 30));
          dropdown.onChange(async (value) => {
            this.plugin.settings.trashArchiveDays = Number(value);
            await this.save();
          });
        });


      new Setting(containerEl)
        .setName('启动时自动打开')
        .addToggle((toggle) => toggle
          .setValue(Boolean(this.plugin.settings.autoOpen))
          .onChange(async (value) => {
            this.plugin.settings.autoOpen = value;
            await this.save();
          }));

      containerEl.createEl('h3', { text: '布局' });
      new Setting(containerEl)
        .setName('列数')
        .setDesc('宽屏用 3 列，侧边栏用 1 列。任何列数下卡片都不会留空位。')
        .addDropdown((dropdown) => {
          dropdown.addOption('1', '1 列');
          dropdown.addOption('2', '2 列');
          dropdown.addOption('3', '3 列');
          dropdown.setValue(String(this.plugin.settings.columns || 2));
          dropdown.onChange(async (value) => {
            this.plugin.settings.columns = Number(value);
            await this.save();
          });
        });
      new Setting(containerEl)
        .setName('卡片最大高度')
        .setDesc('占面板高度的百分比。面板拉高时卡片会跟着长，多出来的高度用来显示更多内容。')
        .addSlider((slider) => slider
          .setLimits(40, 120, 4)
          .setValue(Number(this.plugin.settings.cardMaxVh) || 72)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.cardMaxVh = value;
            await this.save();
          }));

      containerEl.createEl('h3', { text: '画面墙' });
      new Setting(containerEl)
        .setName('展示方式')
        .addDropdown((dropdown) => dropdown
          .addOption('slideshow', '单图轮播')
          .addOption('grid', '多图网格')
          .setValue(this.plugin.settings.galleryMode || 'slideshow')
          .onChange(async (value) => {
            this.plugin.settings.galleryMode = value;
            await this.save();
          }));
      new Setting(containerEl)
        .setName('画幅比例')
        .setDesc('仅多图网格使用。单图轮播保留图片完整内容。')
        .addDropdown((dropdown) => {
          dropdown.addOption('portrait', '竖幅 3:4');
          dropdown.addOption('square', '方形 1:1');
          dropdown.addOption('landscape', '横幅 4:3');
          dropdown.setValue(this.plugin.settings.galleryRatio || 'square');
          dropdown.onChange(async (value) => {
            this.plugin.settings.galleryRatio = value;
            await this.save();
          });
        });
      new Setting(containerEl)
        .setName('显示张数')
        .setDesc('仅多图网格使用。单图轮播每次显示一张，所有图片都可切换。')
        .addSlider((slider) => slider
          .setLimits(3, 12, 1)
          .setValue(Number(this.plugin.settings.galleryCount) || 6)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.galleryCount = value;
            await this.save();
          }));
      new Setting(containerEl)
        .setName('自动轮播')
        .setDesc('自动切换图片，可在卡片里暂停或手动切换。')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.galleryAutoRotate !== false)
          .onChange(async (value) => {
            this.plugin.settings.galleryAutoRotate = value;
            await this.save();
          }));
      new Setting(containerEl)
        .setName('轮播间隔')
        .setDesc('每组停留多少秒，范围 3–30 秒。')
        .addSlider((slider) => slider
          .setLimits(3, 30, 1)
          .setValue(Math.max(3, Math.min(30, Number(this.plugin.settings.galleryRotateSeconds) || 8)))
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.galleryRotateSeconds = value;
            await this.save();
          }));
    }

    renderCardToggles(containerEl) {
      const enabled = parseList(this.plugin.settings.cards);
      containerEl.createEl('h3', { text: `卡片（已开 ${enabled.length} 张）` });
      containerEl.createEl('p', {
        cls: 'setting-item-description',
        text: '每张卡都能单独开关，顺序用右边的箭头调整。关掉任何组合都不会让排版留空 —— 布局会自动补位。',
      });

      const belongs = (card) => card.templates.includes(this.plugin.settings.template || 'general');
      // Cards of the current template first, then the rest as opt-in extras.
      const ordered = [
        ...registry.allCards().filter(belongs),
        ...registry.allCards().filter((card) => !belongs(card)),
      ];

      ordered.forEach((card) => {
        const on = enabled.includes(card.id);
        const position = enabled.indexOf(card.id);
        const setting = new Setting(containerEl)
          .setName(`${card.label}${belongs(card) ? '' : '　·　其它模板'}`)
          .setDesc(`${card.desc}　|　${card.span === 'full' ? '整行' : '半行'}`);
        if (on) {
          setting.addExtraButton((btn) => btn
            .setIcon('arrow-up')
            .setTooltip('上移')
            .setDisabled(position <= 0)
            .onClick(async () => { await this.move(card.id, -1); }));
          setting.addExtraButton((btn) => btn
            .setIcon('arrow-down')
            .setTooltip('下移')
            .setDisabled(position < 0 || position >= enabled.length - 1)
            .onClick(async () => { await this.move(card.id, 1); }));
        }
        setting.addToggle((toggle) => toggle
          .setValue(on)
          .onChange(async (value) => {
            const current = parseList(this.plugin.settings.cards);
            let next;
            if (value) {
              // insert in registry order so toggling on does not jump to the end
              const wanted = new Set([...current, card.id]);
              next = registry.allCards().filter((item) => wanted.has(item.id)).map((item) => item.id);
            } else {
              next = current.filter((id) => id !== card.id);
            }
            this.plugin.settings.cards = next.join(', ');
            await this.save();
            this.display();
          }));
      });
    }

    async move(id, delta) {
      const list = parseList(this.plugin.settings.cards);
      const from = list.indexOf(id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= list.length) return;
      list.splice(to, 0, list.splice(from, 1)[0]);
      this.plugin.settings.cards = list.join(', ');
      await this.save();
      this.display();
    }

    renderDetect(containerEl) {
      containerEl.createEl('h3', { text: '目录' });
      new Setting(containerEl)
        .setName('自动识别本库结构')
        .setDesc('扫一遍文件夹名，猜出日报/项目/收件箱等目录。会覆盖下面的目录设置。')
        .addButton((btn) => btn.setButtonText('识别').onClick(async () => {
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
          applied.forEach(([key, value]) => { this.plugin.settings[key] = value; });
          await this.save();
          this.display();
          new Notice(applied.length
            ? `识别到 ${applied.length} 个目录：\n${applied.map(([key, value]) => `· ${value}`).join('\n')}`
            : '没有识别到常见目录结构，可以手填。', 8000);
        }));
    }

    renderFields(containerEl) {
      TEXT_FIELDS.forEach(([key, name, desc]) => {
        new Setting(containerEl)
          .setName(name)
          .setDesc(desc)
          .addText((text) => text
            .setValue(String(this.plugin.settings[key] ?? ''))
            .onChange(async (value) => {
              this.plugin.settings[key] = value.trim();
              await this.save();
            }));
      });

      containerEl.createEl('h3', { text: '阈值' });
      NUMBER_FIELDS.forEach(([key, name, desc]) => {
        new Setting(containerEl)
          .setName(name)
          .setDesc(desc)
          .addText((text) => text
            .setValue(String(this.plugin.settings[key] ?? ''))
            .onChange(async (value) => {
              const parsed = Number(value);
              // 0 is meaningful for taskMaxAgeDays (disables the age filter).
              if (Number.isFinite(parsed) && parsed >= 0) {
                this.plugin.settings[key] = parsed;
                await this.save();
              }
            }));
      });

      containerEl.createEl('h3', { text: '待办过滤' });
      [
        ['taskExcludes', '待办排除词', '逗号分隔。路径含任一片段的文件不当待办来源'],
        ['noteExcludes', '笔记排除词', '逗号分隔。机器生成的记账文件不算「我在做的事」'],

      ].forEach(([key, name, desc]) => {
        new Setting(containerEl)
          .setName(name)
          .setDesc(desc)
          .addTextArea((area) => {
            area.setValue(String(this.plugin.settings[key] ?? ''));
            area.onChange(async (value) => {
              this.plugin.settings[key] = value.trim();
              await this.save();
            });
            area.inputEl.rows = 2;
          });
      });
    }
  };
}

module.exports = { makeSettingTab, TEXT_FIELDS, NUMBER_FIELDS };

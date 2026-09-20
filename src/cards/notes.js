'use strict';

/**
 * Editable cards.
 *
 * A deliberate boundary: these are the only cards whose text the user types. The
 * data cards render values computed from notes, and making those editable would
 * create a copy that disagrees with the note it came from and gets overwritten on
 * the next refresh. So instead of editing derived text, this card owns its own
 * content and persists it in the plugin's settings.
 *
 * Two modes:
 *   scratch  — free text, saved in settings (survives restarts, syncs with the
 *              vault if the user syncs .obsidian)
 *   note     — mirrors a real markdown file, so the content lives in the vault
 *              proper and can be linked, searched and version-controlled
 */

const ui = require('../ui');
const { el, div, span, button } = require('../dom');
const { ageLabel, daysBetween } = require('../util');

const scratchCard = {
  id: 'scratch',
  label: '便签',
  kicker: 'SCRATCH',
  span: 'half',
  grow: 'fill',
  desc: '可以直接打字的便签。内容存在插件设置里，重启不丢',
  templates: ['general', 'study'],
  needs: [],
  render(ctx) {
    const { view, settings } = ctx;
    const value = String(settings.scratchText || '');
    const area = el('textarea', {
      cls: 'desk-scratch desk-fill',
      attr: {
        // No real names here: this plugin gets handed to other people, and a
        // stranger's dashboard should not name the author's colleagues.
        placeholder: '今天的焦点、临时想到的事、要问谁的问题…\n\n这张卡的内容不会写进笔记，只存在插件设置里。',
        spellcheck: 'false',
      },
    });
    area.value = value;
    // Debounced save: typing must not write settings (and trigger a refresh) on
    // every keystroke, which would also fight the cursor.
    area.addEventListener('input', () => view.queueScratchSave(area.value));
    // Blur commits immediately, so switching away never loses the last words.
    area.addEventListener('blur', () => view.flushScratchSave(area.value));
    return [
      ui.cardHead('SCRATCH', '便签', [
        {
          label: '存为笔记',
          onClick: () => view.scratchToNote(area.value),
        },
      ]),
      area,
      div({ cls: 'desk-note' }, [
        span({ text: settings.scratchSavedAt ? `上次保存 ${settings.scratchSavedAt}` : '边打字边存' }),
      ]),
    ];
  },
};

/**
 * Mirror a markdown file. Unlike the scratch card this writes into the vault, so
 * the text is a real note — linkable, searchable, and backed up with everything
 * else. Useful as a pinned "current focus" or a running checklist.
 */
const pinnedCard = {
  id: 'pinned',
  label: '钉住的笔记',
  kicker: 'PINNED',
  span: 'half',
  grow: 'fill',
  desc: '把一篇笔记钉在工作台上，可直接编辑，改动写回原文件',
  templates: ['general', 'study'],
  needs: [],
  render(ctx) {
    const { view, settings, data } = ctx;
    const target = String(settings.pinnedPath || '').trim();
    if (!target) {
      return [
        ui.cardHead('PINNED', '钉住的笔记'),
        div({ cls: 'desk-hint desk-fill' }, [
          span({ text: '还没有钉住任何笔记。在设置里填一个路径，或者用下面的按钮新建一篇。' }),
          button({
            cls: 'desk-head-btn',
            text: '新建并钉住',
            onClick: () => view.createPinnedNote(),
          }),
        ]),
      ];
    }
    const file = data.app.vault.getAbstractFileByPath(data.normalize(target));
    if (!file || file.children) {
      return [
        ui.cardHead('PINNED', '钉住的笔记'),
        ui.empty(`找不到这篇笔记：${target}`, '在设置里改路径，或者新建一篇。', { fill: true }),
      ];
    }
    const content = view.pinnedCache;
    if (content === null || content === undefined) {
      return [ui.cardHead('PINNED', '钉住的笔记'), ui.empty('正在读…', '', { fill: true })];
    }
    const area = el('textarea', {
      cls: 'desk-scratch desk-fill',
      attr: { spellcheck: 'false' },
    });
    area.value = content;
    area.addEventListener('input', () => view.queuePinnedSave(area.value));
    area.addEventListener('blur', () => view.flushPinnedSave(area.value));
    const idle = daysBetween(file.stat.mtime, Date.now());
    return [
      ui.cardHead('PINNED', file.basename, [
        ui.countChip(ageLabel(idle)),
        { label: '打开', onClick: () => view.openFile(target) },
      ]),
      area,
      div({ cls: 'desk-note' }, [span({ text: `直接编辑，改动写回 ${target}` })]),
    ];
  },
};

module.exports = [scratchCard, pinnedCard];

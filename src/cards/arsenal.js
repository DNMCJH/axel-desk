'use strict';

/**
 * The arsenal: reusable capability, not activity.
 *
 * Every other card answers "what is happening" — tasks, recent notes, output
 * rhythm. This one answers "what have I built that I can reuse", which is the
 * question that actually compounds. A vault accumulates skills, templates and
 * SOPs and then forgets they exist; a list of them on the home screen is the
 * cheapest possible fix.
 *
 * Three groups, kept separate because they are used at different moments:
 *   能力 (skills)    — invoke by name when starting work
 *   模板 (templates) — copy when producing a document
 *   打法 (playbooks) — read when deciding how to do something
 */

const ui = require('../ui');
const { el, div, span } = require('../dom');
const { ageLabel, daysBetween } = require('../util');
const { itemSignature } = require('../item-state');

const GROUPS = [
  { key: 'skills', label: '能力', hint: '成系统的 skill，可直接按名调用' },
  { key: 'templates', label: '模板', hint: '不必重写的文档骨架' },
  { key: 'playbooks', label: '打法', hint: 'SOP / 流程 / 清单' },
];

const arsenalCard = {
  id: 'arsenal',
  label: '武器库',
  kicker: 'ARSENAL',
  span: 'half',
  grow: 'fill',
  desc: '已沉淀的 skill、模板、SOP。回答「我有什么可以复用」而不是「我在做什么」',
  templates: ['study'],
  needs: ['arsenal'],
  render(ctx) {
    const { model, view, settings } = ctx;
    const arsenal = model.arsenal || { skills: [], templates: [], playbooks: [], total: 0, withLessons: 0 };
    const group = view.arsenalGroup || 'skills';

    if (!arsenal.total) {
      return [
        ui.cardHead('ARSENAL', '武器库'),
        div({ cls: 'desk-hint desk-fill' }, [
          span({ text: '还没有识别到可复用资产。这张卡找三类东西：' }),
          el('ul', {}, GROUPS.map((item) => el('li', { text: `${item.label} —— ${item.hint}` }))),
          span({
            cls: 'desk-hint-alt',
            text: `能力目录在设置里配（当前：${settings.skillFolders || '未设置'}），模板目录用「模板目录」那一项。`,
          }),
        ]),
      ];
    }

    const counts = {
      skills: arsenal.skills.length,
      templates: arsenal.templates.length,
      playbooks: arsenal.playbooks.length,
    };
    const options = GROUPS
      // Hide a group this vault has none of, rather than offering an empty tab.
      .filter((item) => counts[item.key] > 0)
      .map((item) => ({ key: item.key, label: `${item.label} ${counts[item.key]}` }));
    const active = counts[group] ? group : (options[0] && options[0].key) || 'skills';

    return [
      div({ cls: 'desk-card-head' }, [
        div({}, [span({ text: 'ARSENAL' }), el('h2', { text: '武器库' })]),
        ui.segmented(options, active, (key) => view.setArsenalGroup(key)),
      ]),
      arsenal.withLessons
        ? ui.note(`${arsenal.withLessons} 个能力带 LESSONS —— 那是不回滚的沉淀，比流程本身值钱`)
        : null,
      renderGroup(ctx, arsenal, active),
    ];
  },
};

function renderGroup(ctx, arsenal, group) {
  const { view } = ctx;
  const now = Date.now();

  if (group === 'skills') {
    const rows = arsenal.skills.map((skill) => ui.listRow({
      title: skill.name,
      // Description first: the point of the card is recognising what a skill does
      // without opening it. Age is secondary here, unlike the activity cards.
      meta: skill.description || '(没有 description)',
      icon: skill.lessons ? 'L' : '',
      tone: skill.lessons ? 'is-hot' : '',
      // Scope disambiguates same-named skills, e.g. a directory-scoped variant.
      badge: shortScope(skill.scope),
      onClick: () => view.openArsenalItem(skill.lessons || skill.path),
    }));
    return ui.rowList(rows, ui.empty('没有找到 SKILL.md。', '', { fill: true }), 'desk-arsenal-list');
  }

  const items = group === 'templates' ? arsenal.templates : arsenal.playbooks;
  const rows = items.map((item) => ui.listRow({
    title: item.name,
    meta: `${item.path.split('/').slice(-2, -1)[0] || ''} · ${ageLabel(daysBetween(item.mtime, now))}`,
    icon: '',
    dismiss: {
      cardId: `arsenal-${group}`, cardLabel: group === 'templates' ? '模板' : 'SOP / 手册', id: item.path,
      label: item.name, sourcePaths: [item.path],
      signature: itemSignature([item.path, item.mtime]),
    },
    view,
    onClick: () => view.openArsenalItem(item.path),
  }));
  return ui.rowList(rows, ui.empty('这一类还没有内容。', '', { fill: true }), 'desk-arsenal-list');
}

/** Last path segment of a skills root, enough to tell two variants apart. */
function shortScope(scope) {
  const parts = String(scope || '').split('/').filter(Boolean);
  if (parts.length < 2) return '';
  // '.obsidian/.claude/skills' -> '.obsidian'; '.claude/skills' -> ''
  const first = parts[0];
  return first === '.claude' ? '' : first;
}

module.exports = [arsenalCard];
module.exports.GROUPS = GROUPS;
module.exports.shortScope = shortScope;

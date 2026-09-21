'use strict';

/**
 * Study cards for the computer-science template.
 *
 * These read signals that already exist in any technical vault — fenced code
 * languages, unresolved wiki links, note staleness — so no extra bookkeeping
 * or frontmatter convention is required to make them useful.
 */

const ui = require('../ui');
const { el, div, span } = require('../dom');
const { ageLabel } = require('../util');
const { itemSignature } = require('../item-state');

const codeCard = {
  id: 'code',
  label: '代码与技术栈',
  kicker: 'CODE',
  span: 'half',
  desc: '语言分布 + 最近 7 天在写什么 + 带代码的笔记',
  templates: ['study', 'general'],
  needs: ['code'],
  render(ctx) {
    const { model, view } = ctx;
    const code = model.code;
    if (!code.languages.length) {
      return [
        ui.cardHead('CODE', '代码与技术栈'),
        ui.empty('还没有带语言标记的代码块。', '写笔记时给围栏加上语言（```python）就会出现在这里。'),
      ];
    }
    const recent = code.recent.map((item) => ui.listRow({
      title: item.title,
      meta: `${item.langs.join(' · ')} · ${ageLabel(item.idle)}`,
      icon: '',
      dismiss: {
        cardId: 'code-recent', cardLabel: '最近代码笔记', id: item.path,
        label: item.title, sourcePaths: [item.path],
        signature: itemSignature([item.path, item.title, item.langs]),
      },
      view,
      onClick: () => view.openFile(item.path),
    }));
    return [
      ui.cardHead('CODE', '代码与技术栈', [ui.countChip(`${code.blocks} 块`)]),
      ui.barList(code.languages.map((lang) => ({ label: lang.name, value: lang.count })), '暂无语言数据'),
      // "What am I in right now" is a different question from "what have I used".
      code.fresh.length
        ? ui.subSection('近 7 天在写', ui.tags(code.fresh.map((lang) => `${lang.name} ${lang.count}`), 'is-fresh'))
        : null,
      // This card's body is fixed-size bars, so the trailing list is the only
      // thing that can absorb spare height — it must fill.
      ui.subSection('RECENT · 最近写过代码的笔记',
        ui.rowList(recent, ui.empty('没有最近的代码笔记。'))),
    ];
  },
};

const conceptCard = {
  id: 'concepts',
  label: '概念候选',
  kicker: 'DEBT',
  span: 'half',
  desc: '你引用过但还没写的概念（未解析的 [[链接]]），按被引用次数排序',
  templates: ['study'],
  needs: ['concepts'],
  render(ctx) {
    const { model, view } = ctx;
    const concepts = model.concepts || { items: [], total: 0 };
    if (!concepts.items.length) {
      return [
        ui.cardHead('DEBT', '概念候选'),
        ui.empty('没有未解析的链接。', '写笔记时用 [[概念名]] 提到还没学的东西，这里就会排队。'),
      ];
    }
    const rows = concepts.items.map((item) => ui.listRow({
      title: item.name,
      meta: `被 ${item.count} 处引用 · ${item.sources.map((source) => source.title).join('、')}`,
      icon: String(item.count),
      tone: item.count >= 3 ? 'is-hot' : '',
      badge: '新建',
      dismiss: {
        cardId: 'concepts', cardLabel: '概念债', id: item.name,
        label: item.name, sourcePaths: item.sources.map((source) => source.path).filter(Boolean),
        signature: itemSignature([item.name, item.count, item.sources.map((source) => source.path)]),
      },
      view,
      // Clicking creates the missing note: the point of the card is to pay the debt.
      onClick: () => view.createConceptNote(item.name, item.sources[0]),
    }));
    return [
      ui.cardHead('DEBT', '概念候选', [ui.countChip(`${concepts.total} 个`)]),
      ui.note('这些是你在笔记里 [[提到]] 过、但还没有对应笔记的概念。点一条直接建笔记。'),
      ui.rowList(rows, ui.empty('没有未解析的链接。'), 'desk-concept-list'),
    ];
  },
};

const reviewCard = {
  id: 'review',
  label: '久未修改笔记',
  kicker: 'REVIEW',
  span: 'half',
  desc: '按最后修改时间列出长期未触碰的笔记，不等同于复习任务',
  templates: ['study'],
  needs: ['review'],
  render(ctx) {
    const { model, view } = ctx;
    const review = model.review || { items: [], total: 0, min: 14 };
    const rows = review.items.map((item) => ui.listRow({
      title: item.title,
      meta: `${item.bucket ? `${item.bucket} · ` : ''}${ageLabel(item.idle)}`,
      icon: '',
      dismiss: {
        cardId: 'review', cardLabel: '复习队列', id: item.path,
        label: item.title, sourcePaths: [item.path],
        signature: itemSignature([item.path, item.title]),
      },
      view,
      tone: item.idle >= review.min * 4 ? 'is-cold' : '',
      onClick: () => view.openFile(item.path),
    }));
    return [
      ui.cardHead('REVIEW', '久未修改笔记', [ui.countChip(`${review.total} 篇`)]),
      ui.note(`超过 ${review.min} 天没打开过的笔记。看一眼还记得多少，比重新学便宜。`),
      ui.rowList(rows, ui.empty('所有笔记都在最近碰过。'), 'desk-review-list'),
    ];
  },
};

module.exports = [codeCard, conceptCard, reviewCard];

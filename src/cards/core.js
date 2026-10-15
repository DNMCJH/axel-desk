'use strict';

/**
 * Core cards: available in every template.
 * Each card gets a ctx with { model, settings, view, ui, helpers }.
 */

const ui = require('../ui');
const { el, div, span, button } = require('../dom');
const { dateKey, ageLabel } = require('../util');
const { groupTaskFiles, taskFileItem, normalizeManualTasks, manualTaskItem } = require('../task-board');
const { itemSignature } = require('../item-state');

function renderManualTask(task, view) {
  const item = manualTaskItem(task);
  if (view.isItemHidden(item)) return null;
  return div({ cls: 'desk-manual-task', attr: { 'data-task-id': task.id } }, [
    ui.checkRow({
      text: task.text, done: task.done,
      onToggle: () => view.toggleManualTask(task.id),
      onOpen: () => view.startManualTaskEdit(task),
    }),
    button({ cls: 'desk-head-btn desk-manual-edit', text: '编辑', onClick: () => view.startManualTaskEdit(task) }),
    button({
      cls: 'desk-head-btn desk-manual-remove', text: '移除',
      title: '移入 Desk 回收站，可恢复；不修改任何笔记',
      onClick: () => view.closeItem(item),
    }),
  ]);
}

function renderManualTasks(view, settings) {
  const tasks = normalizeManualTasks(settings.manualTasks).filter((task) => !view.isItemHidden(manualTaskItem(task)));
  const open = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);
  const input = el('input', {
    cls: 'desk-manual-input',
    attr: { type: 'text', placeholder: '写一条你准备做的事，按 Enter 添加', 'aria-label': '个人待办内容' },
  });
  input.value = view.manualTaskDraft || '';
  let composing = false;
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; view.manualTaskDraft = input.value; });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.isComposing || composing || event.keyCode === 229)) event.preventDefault();
  });
  input.addEventListener('input', () => { view.manualTaskDraft = input.value; });
  const form = el('form', { cls: 'desk-manual-form' }, [
    input,
    el('button', { cls: 'desk-head-btn', text: view.manualTaskEditId ? '保存' : '添加', attr: { type: 'submit' } }),
    view.manualTaskEditId ? el('button', {
      cls: 'desk-head-btn', text: '取消', attr: { type: 'button' }, onClick: () => view.cancelManualTaskEdit(),
    }) : null,
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (composing || event.isComposing || !input.value.trim()) return;
    input.blur();
    if (view.manualTaskEditId) view.editManualTask(view.manualTaskEditId, input.value);
    else view.addManualTask(input.value);
  });
  return div({ cls: 'desk-personal-tasks' }, [
    div({ cls: 'desk-sub-head', text: '个人待办 · ' + open.length + ' 项' }),
    form,
    ui.rowList(open.map((task) => renderManualTask(task, view)), ui.empty('还没有自己梳理的待办。'), 'desk-manual-list', { fill: false }),
    done.length ? el('details', { cls: 'desk-manual-completed' }, [
      el('summary', { text: '已完成 · ' + done.length + ' 项' }),
      ...done.map((task) => renderManualTask(task, view)),
    ]) : null,
  ]);
}

const todayCard = {
  id: 'today', label: '待办', kicker: 'TODAY', span: 'half',
  desc: '含待办的文件与自己梳理的待办；移除只影响 Desk，可从回收站恢复',
  templates: ['general', 'study'], needs: [],
  render(ctx) {
    const { model, view, settings } = ctx;
    const files = groupTaskFiles(model.tasks, settings).filter((file) => !view.isItemHidden(taskFileItem(file)));
    const limit = view.taskFilesLimit || Math.max(1, Number(settings.taskLimit) || 12);
    const rows = files.slice(0, limit).map((file) => {
      const row = ui.listRow({
        title: file.name, meta: file.path, badge: file.count + ' 项未完成',
        dismiss: taskFileItem(file), view,
        onClick: () => view.openFile(file.path, file.line),
      });
      if (row) {
        row.classList.add('desk-task-file');
        row.querySelector('.desk-row-toggle').setAttribute('aria-label', '移除文件：' + file.name);
        row.querySelector('.desk-row-toggle').title = '仅从 Desk 移除，可从回收站恢复；不删除文件、不勾选原文任务';
      }
      return row;
    });
    return [
      ui.cardHead('TODAY', '待办', [{ label: '恢复已移除', onClick: () => view.openItemVault('closed') }]),
      div({ cls: 'desk-task-board desk-fill' }, [
        renderManualTasks(view, settings),
        div({ cls: 'desk-sub desk-task-file-section' }, [
          div({ cls: 'desk-sub-head', text: '含待办的文件 · ' + files.length + ' 份' }),
          ui.note('数量仅表示未完成复选框，不代表今天必须做；不需要的文件可自主移除。'),
          ui.rowList(rows, ui.empty('没有待展示的文件。', '已移除的文件可以从 Desk 回收站恢复。'), 'desk-task-files', { fill: false }),
          files.length > limit ? button({
            cls: 'desk-head-btn desk-task-files-more', text: '显示更多（还有 ' + (files.length - limit) + ' 份）',
            onClick: () => { view.taskFilesLimit = limit + Math.max(1, Number(settings.taskLimit) || 12); view.rerender(); },
          }) : null,
        ]),
      ]),
    ];
  },
};

const calendarCard = {
  id: 'calendar',
  label: '本月台历',
  kicker: 'CALENDAR',
  span: 'half',
  // The month grid is fixed, but the selected-day detail list below it is not,
  // so this card can still use spare height productively.
  grow: 'fill',
  desc: '改动、到期、日报的月视图，点某天看当天发生了什么',
  templates: ['general', 'study'],
  needs: ['streak'],
  render(ctx) {
    const { model, view } = ctx;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    const mondayOffset = (new Date(year, month, 1).getDay() + 6) % 7;

    const dueByDay = new Map();
    model.openTasks.forEach((task) => {
      const due = task.due || task.scheduled;
      if (due) dueByDay.set(due, (dueByDay.get(due) || 0) + 1);
    });
    const touchedByDay = new Map();
    model.files.forEach((file) => {
      const key = dateKey(new Date(file.stat.mtime));
      touchedByDay.set(key, (touchedByDay.get(key) || 0) + 1);
    });
    const reportDays = new Set((model.streak || []).filter((day) => day.report).map((day) => day.key));

    const cells = [];
    // Leading blanks align the 1st onto its weekday.
    for (let index = 0; index < mondayOffset; index += 1) cells.push(span({ cls: 'is-blank' }));
    for (let day = 1; day <= days; day += 1) {
      const key = dateKey(new Date(year, month, day));
      const due = dueByDay.get(key) || 0;
      const touched = touchedByDay.get(key) || 0;
      cells.push(button({
        cls: [
          key === dateKey(now) ? 'is-today' : '',
          key === view.selectedDate ? 'is-selected' : '',
          touched ? 'has-note' : '',
          due ? 'has-due' : '',
          reportDays.has(key) ? 'has-report' : '',
        ],
        title: `${touched} 篇改动${due ? ` · ${due} 条到期` : ''}`,
        onClick: () => view.selectDate(key),
      }, [
        el('b', { text: String(day) }),
        due ? el('i', { text: String(due) }) : touched ? el('u') : null,
      ]));
    }
    // Trailing blanks so the final row is a complete week, not ragged.
    while (cells.length % 7 !== 0) cells.push(span({ cls: 'is-blank' }));

    return [
      ui.cardHead('CALENDAR', `${month + 1}月`, [
        { label: '回到今天', onClick: () => view.selectDate(dateKey(new Date())) },
      ]),
      div({ cls: 'desk-weekdays' }, ['一', '二', '三', '四', '五', '六', '日'].map((text) => span({ text }))),
      div({ cls: 'desk-month' }, cells),
      dayDetail(ctx, view.selectedDate),
    ];
  },
};

function dayDetail(ctx, key) {
  const { model, view } = ctx;
  const display = new Date(`${key}T12:00:00`);
  const label = `${display.getMonth() + 1}月${display.getDate()}日`;
  const touched = model.files
    .filter((file) => dateKey(new Date(file.stat.mtime)) === key)
    .sort((a, b) => b.stat.mtime - a.stat.mtime)
    .slice(0, 6);
  const due = model.openTasks.filter((task) => (task.due || task.scheduled) === key);
  const rows = [
    ...due.map((task) => ui.listRow({
      title: task.text,
      meta: `到期 · ${task.basename}`,
      icon: '',
      dismiss: {
        cardId: 'calendar-day', cardLabel: '本月台历', id: `${key}:${task.path}:${task.line}`,
        label: task.text, sourcePaths: [task.path],
        signature: itemSignature([task.text, task.due, task.scheduled]),
      },
      view,
      tone: 'is-due',
      onClick: () => view.openFile(task.path, task.line),
    })),
    ...touched.map((file) => ui.listRow({
      title: file.basename,
      meta: `${file.path.split('/')[1] || ''} · ${new Date(file.stat.mtime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
      icon: '',
      dismiss: {
        cardId: 'calendar-day', cardLabel: '本月台历', id: `${key}:${file.path}`,
        label: file.basename, sourcePaths: [file.path],
        signature: itemSignature([file.path, file.stat.mtime]),
      },
      view,
      onClick: () => view.openFile(file.path),
    })),
  ];
  return div({ cls: 'desk-day-detail' }, [
    div({ cls: 'desk-day-head' }, [
      div({}, [span({ text: 'DAY' }), el('strong', { text: label })]),
      button({ cls: 'desk-head-btn', text: '打开当天目录', onClick: () => view.plugin.revealDay(key) }),
    ]),
    ui.rowList(rows, ui.empty('这天没有改动，也没有到期事项。'), 'desk-day-rows'),
  ]);
}

const heatCard = {
  id: 'heat',
  label: 'Vault 活动',
  kicker: 'ACTIVITY',
  span: 'full',
  grow: 'compact',
  desc: '笔记活动热力图 + 活跃日期 + 目录分布',
  templates: ['general', 'study'],
  needs: ['heat'],
  render(ctx) {
    const { model, view } = ctx;
    const heat = model.heat;
    const level = (count) => {
      if (count < 0) return 'is-future';
      if (!count) return 'is-l0';
      const step = Math.max(1, Math.ceil(heat.peak / 4));
      return `is-l${Math.min(4, Math.ceil(count / step))}`;
    };
    const grid = div({ cls: 'desk-heat-grid' }, heat.columns.map((column) => div(
      { cls: 'desk-heat-col' },
      column.map((cell) => span({
        cls: ['desk-heat-cell', level(cell.count)],
        title: `${cell.key}${cell.count >= 0 ? ` · ${cell.count} 篇` : ''}`,
        onClick: () => { if (cell.count >= 0) view.selectDate(cell.key); },
      })),
    )));
    const avg = heat.activeDays ? (heat.total / heat.activeDays).toFixed(1) : '0';
    return [
      ui.cardHead('ACTIVITY', 'Vault 活动'),
      ui.metrics([
        { value: heat.total, label: '新建笔记' },
        { value: heat.activeDays, label: '有活动的天' },
        { value: avg, label: '活跃日均' },
        { value: heat.peak, label: '单日峰值' },
      ]),
      div({ cls: 'desk-heat-scroll' }, [grid]),
      div({ cls: 'desk-heat-legend' }, [
        span({ text: '少' }),
        ...['is-l0', 'is-l1', 'is-l2', 'is-l3', 'is-l4'].map((cls) => el('i', { cls })),
        span({ text: '多' }),
        el('em', { text: `近 ${heat.weeks} 周 · 按笔记归属日` }),
      ]),
      ui.subSection('近期改动分布', ui.barList(
        heat.folders.map((folder) => ({ label: folder.name, value: folder.count })),
        '还没有足够的改动数据。',
      )),
    ];
  },
};

const digestCard = {
  id: 'digest',
  label: '待处理来源',
  kicker: 'TO DIGEST',
  span: 'half',
  desc: '按已配置来源聚合收件箱、研究、阻塞和最近项目',
  templates: [],
  needs: ['digest', 'blockers', 'recent'],
  render(ctx) {
    const { model, view, settings } = ctx;
    const configuredSources = [settings.inboxFolder, settings.researchFolder, settings.blockerFolder,
      settings.projectFolder, settings.activeFolder]
      .map((value) => String(value || '').trim()).filter(Boolean);
    if (!configuredSources.length) {
      return [
        ui.cardHead('TO PROCESS', '待处理来源'),
        ui.unconfigured('尚未配置待处理来源。', '可以配置收件箱、研究、阻塞或项目目录；未配置不等于已经清空。'),
      ];
    }
    const blockers = model.blockers || [];
    // Stale blockers go last, muted, but are never truncated away: out of the list
    // is out of mind, which is how a backlog reaches 128 days old. The list
    // scrolls, and every row carries its own closing control, so a long tail is
    // work you can clear rather than noise you learn to skip.
    //
    // Fresh ones are capped — those come back tomorrow anyway.
    const fresh = blockers.filter((item) => !item.stale);
    const stale = blockers.filter((item) => item.stale);
    const blockerRow = (item) => ui.blockerRow({
      title: item.title,
      status: item.status,
      state: item.state,
      age: ageLabel(item.idle),
      stale: item.stale,
      onResolve: () => view.resolveBlocker(item, 'resolved'),
      onObsolete: () => view.resolveBlocker(item, 'obsolete'),
      onOpen: () => view.openFile(item.path),
    });
    const rows = [
      ...fresh.slice(0, 5).map(blockerRow),
      ...stale.map(blockerRow),
      ...(model.digest || []).map((item) => ui.listRow({
        title: item.title,
        meta: `${item.source} · ${ageLabel(item.idle)}`,
        icon: '',
        dismiss: {
          cardId: 'digest', cardLabel: '待处理来源', id: item.path,
          label: item.title, sourcePaths: [item.path],
          signature: itemSignature([item.path, item.title, item.source]),
        },
        view,
        onClick: () => view.openFile(item.path),
      })),
    ];
    const recent = (model.recent || []).map((item) => ui.listRow({
      title: item.title,
      meta: `${item.bucket} · ${ageLabel(item.idle)}`,
      icon: '',
      dismiss: {
        cardId: 'digest-recent', cardLabel: '最近动过', id: item.path,
        label: item.title, sourcePaths: [item.path],
        signature: itemSignature([item.path, item.title, item.bucket]),
      },
      view,
      onClick: () => view.openFile(item.path),
    }));
    return [
      ui.cardHead('TO PROCESS', '待处理来源', [
        stale.length ? ui.countChip(`${stale.length} 项超 30 天`) : null,
        settings.inboxFolder ? { label: '打开收件箱', onClick: () => view.plugin.revealFolder(settings.inboxFolder) } : null,
      ]),
      ui.rowList(rows, ui.empty('按当前配置没有待处理内容。', '数据源已配置；可以查看规则或调整扫描范围。'), 'desk-digest-list'),
      // A secondary list keeps its content height; the primary list above takes
      // the card's spare space.
      ui.subSection('RECENT · 最近动过', ui.rowList(recent, ui.empty('没有最近改动的项目笔记。'), '', { fill: false })),
    ];
  },
};

// Order matters: this is the default display order. Half-width cards come first
// so the full-width heat map settles at the bottom instead of cutting the grid
// in half. Card registration order is set in cards/index.js.
module.exports = [todayCard, calendarCard, digestCard];
module.exports.heatCard = heatCard;

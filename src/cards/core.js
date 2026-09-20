'use strict';

/**
 * Core cards: available in every template.
 * Each card gets a ctx with { model, settings, view, ui, helpers }.
 */

const ui = require('../ui');
const { el, div, span, button } = require('../dom');
const { dateKey, ageLabel, inFolder } = require('../util');
const { sortTasks } = require('../tasks');
const { itemSignature } = require('../item-state');

const TASK_SCOPES = [
  { key: 'mine', label: '我的' },
  { key: 'waiting', label: '等人' },
  { key: 'due', label: '到期' },
  { key: 'active', label: '进行中' },
  { key: 'all', label: '常用' },
  { key: 'raw', label: '全部' },
];

/**
 * Where a task lives, phrased usefully.
 * A bare "STATE" or "2026-09-17_日报" tells you nothing, so name the workstream
 * (the parent folder) instead when the filename is bookkeeping or a date.
 */
function taskSource(task) {
  const name = task.basename || '';
  const folder = task.path.split('/').slice(-2, -1)[0] || '';
  const uninformative = /^(STATE|STATUS|README|INDEX|MANIFEST|CHECKPOINT)$/i.test(name)
    || /^\d{4}-\d{2}-\d{2}/.test(name);
  return uninformative && folder ? folder : name;
}

function taskMeta(task, today) {
  const due = task.due || task.scheduled;
  const overdue = due && due < today;
  const isToday = due === today;
  const parts = [];
  if (due) {
    parts.push(el('em', {
      cls: overdue ? 'is-overdue' : isToday ? 'is-today' : '',
      text: overdue ? `逾期 ${due}` : isToday ? '今天' : due,
    }));
  }
  if (task.owner === 'other') {
    parts.push(el('em', { cls: 'is-waiting', text: `等 ${task.who || '他人'}` }));
  }
  const source = taskSource(task);
  if (source) parts.push(span({ cls: 'desk-task-src', text: source }));
  // interleave separators so the meta line reads as "a · b · c"
  return parts.flatMap((node, index) => (index ? [span({ cls: 'desk-sep', text: '·' }), node] : [node]));
}

function renderTaskList(ctx) {
  const { model, settings, view } = ctx;
  const today = dateKey(new Date());
  const limit = Number(settings.taskLimit || 12);
  const scope = view.taskScope;
  let tasks = model.openTasks;
  if (scope === 'raw') {
    // escape hatch: every open checkbox, filters bypassed
    tasks = sortTasks(model.tasks.filter((task) => !task.done && !task.cancelled), today);
  } else if (scope === 'mine') {
    tasks = tasks.filter((task) => task.owner === 'me');
  } else if (scope === 'waiting') {
    tasks = tasks.filter((task) => task.owner === 'other');
  } else if (scope === 'due') {
    tasks = tasks.filter((task) => {
      const due = task.due || task.scheduled;
      return due && due <= today;
    });
  } else if (scope === 'active') {
    tasks = tasks.filter((task) => inFolder(task.path, settings.activeFolder, view.normalize));
  }
  const shown = tasks.slice(0, limit);
  const parts = [];
  if (model.hiddenCount || model.cappedCount) {
    const bits = [];
    if (model.hiddenCount) bits.push(`已过滤 ${model.hiddenCount} 条陈旧/非任务复选框`);
    // Capped items are relevant, just crowded out — say so differently.
    if (model.cappedCount) bits.push(`${model.cappedCount} 条来自同一笔记未展开`);
    parts.push(ui.note(
      `${bits.join(' · ')}（共 ${model.allOpenCount} 条未完成）`,
      { label: '规则', onClick: () => view.explainFilters() },
    ));
  }
  if (!shown.length) {
    parts.push(ui.empty(
      '这个范围里没有待办。',
      model.hiddenCount ? '放宽设置里的「待办最大天数」可以看到更多。' : '要么真做完了，要么该去笔记里记一条。',
    ));
    return parts;
  }
  parts.push(div({ cls: 'desk-task-list desk-fill' }, shown.map((task) => ui.checkRow({
    text: task.text,
    done: task.done,
    meta: taskMeta(task, today),
    tone: [`desk-p-${task.priority}`, task.owner === 'other' ? 'is-waiting' : ''],
    onToggle: () => view.toggleTask(task),
    onOpen: () => view.openFile(task.path, task.line),
  }))));
  if (tasks.length > limit) {
    parts.push(ui.note(`还有 ${tasks.length - limit} 条未显示`));
  }
  return parts;
}

const todayCard = {
  id: 'today',
  label: '待办',
  kicker: 'TODAY',
  span: 'half',
  desc: '按归属分流的待办清单，可直接勾选',
  templates: ['general', 'study'],
  needs: [],
  render(ctx) {
    const { model, view } = ctx;
    const options = TASK_SCOPES.map((item) => ({
      key: item.key,
      label: item.key === 'mine' && model.mineCount ? `我的 ${model.mineCount}`
        : item.key === 'waiting' && model.waitingCount ? `等人 ${model.waitingCount}`
          : item.label,
    }));
    return [
      div({ cls: 'desk-card-head' }, [
        div({}, [span({ text: 'TODAY' }), el('h2', { text: '待办' })]),
        ui.segmented(options, view.taskScope, (key) => view.setTaskScope(key)),
      ]),
      ...renderTaskList(ctx),
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
  label: '产出节奏',
  kicker: 'OUTPUT',
  span: 'full',
  grow: 'compact',
  desc: '热力图 + 产出指标 + 目录分布',
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
      ui.cardHead('OUTPUT', '产出节奏'),
      ui.metrics([
        { value: heat.total, label: '新建笔记' },
        { value: heat.activeDays, label: '有产出的天' },
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
  label: '待消化 / 阻塞',
  kicker: 'TO DIGEST',
  span: 'half',
  desc: '阻塞项、收件箱未归类、最近动过的笔记',
  templates: ['general'],
  needs: ['digest', 'blockers', 'recent'],
  render(ctx) {
    const { model, view, settings } = ctx;
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
          cardId: 'digest', cardLabel: '待消化 / 阻塞', id: item.path,
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
      ui.cardHead('TO DIGEST', '待消化 / 阻塞', [
        stale.length ? ui.countChip(`${stale.length} 项超 30 天`) : null,
        { label: '打开收件箱', onClick: () => view.plugin.revealFolder(settings.inboxFolder) },
      ]),
      ui.rowList(rows, ui.empty('收件箱和阻塞区都清空了。'), 'desk-digest-list'),
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

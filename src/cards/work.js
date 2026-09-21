'use strict';

/**
 * Work cards: workstreams in flight and daily-report continuity.
 * Shared by the general workspace template.
 */

const ui = require('../ui');
const { el, div, span, button } = require('../dom');
const { dateKey, ageLabel } = require('../util');
const { itemSignature } = require('../item-state');

const activeCard = {
  id: 'active',
  label: '进行中的项目',
  kicker: 'IN FLIGHT',
  span: 'half',
  desc: '按已配置项目目录展示进行中项目，停滞会标红',
  templates: [],
  needs: ['active', 'streak'],
  render(ctx) {
    const { model, view, settings, data } = ctx;
    const configured = String(settings.activeFolder || '').trim();
    if (!configured) {
      return [ui.cardHead('IN FLIGHT', '进行中的项目'),
        ui.unconfigured('尚未配置进行中的项目。', '请选择项目根目录；Desk 不会把 Vault 根目录自动当成项目。')];
    }
    const streams = model.active || [];
    let body;
    if (!streams.length) {
      body = data.folderExists(settings.activeFolder)
        ? ui.empty(`${settings.activeFolder} 里没有进行中的线。`, '跨天没做完的工作放进来，就不会忘。')
        : ui.missingFolder(settings.activeFolder, '进行中');
    } else {
      // Uses the shared row primitive rather than a bespoke layout, so spacing
      // and truncation match every other card.
      body = ui.rowList(streams.map((stream) => ui.listRow({
        title: stream.name,
        meta: `${stream.notes} 篇 · 最后动于 ${stream.latest ? ageLabel(stream.idle) : '未知'}${stream.statePath ? ' · 有 STATE' : ''}`,
        icon: '',
        dismiss: {
          cardId: 'active', cardLabel: '进行中的项目', id: stream.path,
          label: stream.name, sourcePaths: [stream.statePath || (stream.newest && stream.newest.path) || stream.path],
          signature: itemSignature([stream.path, stream.notes, stream.latest, stream.statePath]),
        },
        view,
        tone: stream.stale ? 'is-stale' : '',
        badge: stream.stale ? `停滞 ${stream.idle} 天` : '活跃',
        // Prefer STATE.md: per the vault convention it is the canonical status
        // note, so opening it answers "where was I" directly.
        onClick: () => view.openFile(stream.statePath || (stream.newest && stream.newest.path) || stream.path),
      })), null, 'desk-stream-list');
    }
    return [
      ui.cardHead('IN FLIGHT', '进行中的项目', [
        { label: '打开目录', onClick: () => view.plugin.revealFolder(settings.activeFolder) },
      ]),
      body,
      ui.subSection('DAILY LOG · 日报连续性', streakStrip(ctx)),
    ];
  },
};

function streakStrip(ctx) {
  const { model, view } = ctx;
  const days = model.streak || [];
  if (!days.length) return ui.empty('没有配置日报目录。');
  const today = dateKey(new Date());
  const cells = days.map((day) => button({
    cls: [
      day.report ? 'is-report' : day.has ? 'is-note' : 'is-missing',
      day.weekend ? 'is-weekend' : '',
      day.key === today ? 'is-today' : '',
    ],
    title: day.has ? `${day.key} 已写` : `${day.key} 缺日报`,
    onClick: () => (day.path ? view.openFile(day.path) : view.plugin.revealDay(day.key)),
  }, [el('b', { text: String(day.day) })]));
  const written = days.filter((day) => day.report).length;
  const missing = days.filter((day) => !day.has && !day.weekend).length;
  return div({}, [
    div({ cls: 'desk-streak' }, cells),
    div({ cls: 'desk-streak-note', text: `近 ${days.length} 天写了 ${written} 份日报${missing ? ` · 有 ${missing} 个工作日空着` : ' · 工作日没有缺口'}` }),
  ]);
}

module.exports = [activeCard];

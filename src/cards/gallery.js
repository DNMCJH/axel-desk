'use strict';

/**
 * The visual card: a wall of pictures from the user's own vault.
 *
 * Images stay Vault-native on purpose: Obsidian can render, open and sync them
 * without granting this plugin arbitrary filesystem access. The picker offers
 * image-heavy shortcuts, every loaded Vault folder (including empty folders),
 * and a create-folder action.
 */

const ui = require('../ui');
const { el, div, span, button } = require('../dom');
const { ageLabel } = require('../util');

const RATIOS = {
  portrait: '3 / 4',
  square: '1 / 1',
  landscape: '4 / 3',
};

function slideshow(gallery, view, settings, togglePicker) {
  const count = gallery.items.length;
  const current = Math.min(Number(view.galleryPage) || 0, count - 1);
  const root = el('section', { cls: 'desk-carousel', attr: { 'aria-label': '图片轮播' } });
  const slides = gallery.items.map((item, index) => {
    const src = view.resolveImage(item.path);
    const position = /art-veil\.jpg$/i.test(item.path) ? '50% 45%'
      : /art-dress\.jpg$/i.test(item.path) ? '50% 44%' : '50% 50%';
    return button({
      cls: ['desk-carousel-slide', index === current ? 'is-active' : ''],
      title: item.path, ariaLabel: '打开图片：' + item.name,
      attr: { 'data-slide-index': index, 'aria-hidden': index !== current ? 'true' : 'false', tabindex: index === current ? '0' : '-1' },
      onClick: () => view.openFile(item.path),
    }, [src ? el('img', { attr: { src, alt: item.name, draggable: 'false' }, style: { 'object-position': position } })
      : span({ text: '图片已移动' })]);
  });
  root.appendChild(div({ cls: 'desk-carousel-track' }, slides));
  root.appendChild(div({ cls: 'desk-banner-caption' }, [
    el('em', { text: '生活 · 求知 · 远行' }),
    el('strong', { text: '好好生活，认真求知，走自己的路。' }),
  ]));
  const paused = view.galleryPaused || settings.galleryAutoRotate === false;
  root.appendChild(div({ cls: 'desk-carousel-controls', attr: { role: 'group', 'aria-label': '轮播控制' } }, [
    button({ cls: 'desk-carousel-arrow', text: '‹', ariaLabel: '上一张', title: '上一张',
      onClick: () => view.shiftGalleryPage(-1, count) }),
    div({ cls: 'desk-carousel-dots' }, gallery.items.map((item, index) => button({
      cls: ['desk-carousel-dot', index === current ? 'is-active' : ''],
      ariaLabel: '第 ' + (index + 1) + ' 张：' + item.name, title: item.name,
      attr: { 'data-carousel-dot': index, 'aria-pressed': index === current ? 'true' : 'false' },
      onClick: () => view.shiftGalleryPage(index - view.galleryPage, count),
    }))),
    button({ cls: 'desk-carousel-arrow', text: '›', ariaLabel: '下一张', title: '下一张',
      onClick: () => view.shiftGalleryPage(1, count) }),
    button({ cls: 'desk-carousel-pause', text: paused ? '▶' : 'Ⅱ',
      ariaLabel: paused ? '继续轮播' : '暂停轮播', title: paused ? '继续轮播' : '暂停轮播',
      onClick: () => view.toggleGalleryRotation() }),
  ]));
  root.appendChild(button({ cls: 'desk-carousel-settings', text: '···',
    ariaLabel: '更换图片目录', title: '更换图片目录', onClick: togglePicker }));
  root.appendChild(span({ cls: 'desk-carousel-status', text: (current + 1) + ' / ' + count,
    attr: { 'aria-live': 'off' } }));
  if (!view.galleryPickerOpen) view.configureGalleryRotation(count, 1);
  else view.clearGalleryRotation();
  return root;
}

const SYSTEM_SEGMENTS = new Set(['.obsidian', '.git', '.trash', 'node_modules']);

function isImage(name) {
  return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(name || '');
}

/** Image-heavy folders used only as shortcuts; never a fixed/prebuilt list. */
function suggestFolders(view, limit = 4, workRoot = '') {
  const vault = view && view.app && view.app.vault;
  const files = vault && typeof vault.getFiles === 'function' ? vault.getFiles() : [];
  const root = String(workRoot || '').replace(/\/+$/, '');
  const counts = new Map();
  files.forEach((file) => {
    if (!isImage(file.name)) return;
    if (root && !(file.path === root || file.path.startsWith(`${root}/`))) return;
    const folder = file.path.includes('/') ? file.path.replace(/\/[^/]*$/, '') : '';
    if (!folder) return;
    counts.set(folder, (counts.get(folder) || 0) + 1);
  });
  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([folder, count]) => ({ folder, count }));
}

/** Every user folder Obsidian has loaded, including empty folders. */
function listVaultFolders(view) {
  const vault = view && view.app && view.app.vault;
  const loaded = vault && typeof vault.getAllLoadedFiles === 'function' ? vault.getAllLoadedFiles() : [];
  return loaded
    .filter((file) => file && file.children && file.path)
    .map((file) => String(file.path).replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .filter((folder) => folder && !folder.split('/').some((part) => SYSTEM_SEGMENTS.has(part)))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

/** Compact but unambiguous enough for repeated names such as assets/. */
function folderLabel(folder, workRoot = '') {
  const root = String(workRoot || '').replace(/\/+$/, '');
  let shown = String(folder || '');
  if (root && shown.startsWith(`${root}/`)) shown = shown.slice(root.length + 1);
  const parts = shown.split('/').filter(Boolean);
  return parts.slice(-2).join('/') || shown;
}

/** Accept only Vault-relative user paths. Absolute/external paths stay unsupported. */
function validateVaultFolderPath(input) {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, error: '请输入 Vault 内的目录路径' };
  if (/^[a-zA-Z]:[\\/]/.test(raw) || /^[\\/]/.test(raw) || /^[a-z]+:\/\//i.test(raw)) {
    return { ok: false, error: '这里只支持当前 Vault 内的相对路径' };
  }
  const parts = raw.replace(/\\/g, '/').split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) {
    return { ok: false, error: '目录路径不能包含 . 或 ..' };
  }
  if (parts.some((part) => SYSTEM_SEGMENTS.has(part))) {
    return { ok: false, error: '不能把画面墙放进插件、回收站或代码依赖目录' };
  }
  return { ok: true, path: parts.join('/') };
}

function pickerControls(view, settings, gallery) {
  const folders = listVaultFolders(view);
  const selected = { value: '' };
  const select = el('select', { cls: 'desk-gallery-select', ariaLabel: '选择 Vault 内目录' });
  const placeholder = el('option', { text: '选择 Vault 内任意目录…', attr: { value: '' } });
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);
  folders.forEach((folder) => {
    const option = el('option', { text: folder, attr: { value: folder } });
    if (folder === gallery.folder) option.disabled = true;
    select.appendChild(option);
  });
  select.addEventListener('change', () => { selected.value = select.value; });

  const useButton = button({
    cls: 'desk-head-btn',
    text: '使用所选目录',
    onClick: () => {
      if (!selected.value) { view.notice('请先选择一个目录'); return; }
      view.setGalleryFolder(selected.value);
    },
  });

  const defaultPath = settings.workRoot ? `${settings.workRoot}/画面墙` : '画面墙';
  const input = el('input', {
    cls: 'desk-gallery-input',
    attr: { type: 'text', value: defaultPath, placeholder: '例如：图片/画面墙' },
    ariaLabel: '新建画面墙目录',
  });
  const createButton = button({
    cls: 'desk-head-btn',
    text: '新建并使用',
    onClick: () => view.createGalleryFolder(input.value),
  });

  return div({ cls: 'desk-gallery-browser' }, [
    div({ cls: 'desk-gallery-control' }, [select, useButton]),
    div({ cls: 'desk-gallery-control' }, [input, createButton]),
    el('small', { text: '只使用当前 Vault 内的目录；可以选择空目录，也可以新建多级目录。' }),
  ]);
}

const galleryCard = {
  id: 'gallery',
  label: '画面墙',
  kicker: 'VISUAL',
  span: 'full',
  grow: 'compact',
  desc: '本地图片单图轮播或多图网格，支持手动切换与暂停',
  templates: ['general', 'study'],
  needs: ['gallery'],
  render(ctx) {
    const { model, settings, view } = ctx;
    const gallery = model.gallery || { configured: false, items: [], total: 0 };
    const ratio = RATIOS[settings.galleryRatio] || RATIOS.square;
    const limit = Math.max(3, Math.min(12, Number(settings.galleryCount) || 6));
    const pickerOpen = Boolean(view.galleryPickerOpen);
    const togglePicker = async () => {
      view.galleryPickerOpen = !pickerOpen;
      await view.refresh();
    };
    const renderPicker = () => {
      const picks = suggestFolders(view, 8, settings.workRoot)
        .filter((pick) => pick.folder !== gallery.folder);
      return div({ cls: 'desk-gallery-setup' }, [
        span({ text: '推荐目录来自当前 Vault 的实时统计，只列出至少有 3 张图片的目录。也可以选择或新建任意 Vault 目录。' }),
        picks.length
          ? div({ cls: 'desk-gallery-picks' }, picks.map((pick) => button({
            cls: 'desk-head-btn',
            text: `${folderLabel(pick.folder, settings.workRoot)}　${pick.count} 张`,
            title: pick.folder,
            onClick: () => view.setGalleryFolder(pick.folder),
          })))
          : el('em', { text: '没有其他成组图片目录，可以在下面选择空目录或新建目录。' }),
        pickerControls(view, settings, gallery),
      ]);
    };

    if (!gallery.configured) {
      return [
        ui.cardHead('VISUAL', '画面墙', [ui.countChip(`扫描范围内 ${gallery.total} 张图`)]),
        renderPicker(),
      ];
    }

    if (!gallery.items.length) {
      return [
        ui.cardHead('VISUAL', '画面墙', [
          { label: '打开目录', onClick: () => view.plugin.revealFolder(gallery.folder) },
          { label: pickerOpen ? '取消' : '换目录', onClick: togglePicker },
        ]),
        pickerOpen
          ? renderPicker()
          : ui.empty(`${gallery.folder} 里还没有图片。`, '可以保留这个空目录并往里面放图，或者换一个目录。'),
      ];
    }

    if (settings.galleryMode !== 'grid') {
      return [
        slideshow(gallery, view, settings, togglePicker),
        pickerOpen ? renderPicker() : null,
      ];
    }

    const pageCount = Math.max(1, Math.ceil(gallery.items.length / limit));
    const pageIndex = Math.min(Number(view.galleryPage) || 0, pageCount - 1);
    const start = pageIndex * limit;
    const shown = gallery.items.slice(start, start + limit);
    if (pickerOpen && typeof view.clearGalleryRotation === 'function') {
      view.clearGalleryRotation();
    } else if (typeof view.configureGalleryRotation === 'function') {
      view.configureGalleryRotation(gallery.items.length, limit);
    }
    const tiles = shown.map((item) => {
      const src = typeof view.resolveImage === 'function' ? view.resolveImage(item.path) : '';
      const media = src
        ? el('img', {
          cls: 'desk-shot-img',
          attr: { src, alt: item.name, loading: 'lazy', draggable: 'false' },
        })
        : div({ cls: 'desk-shot-missing' }, [span({ text: '图片已移动' })]);
      return button({
        cls: 'desk-shot',
        style: { 'aspect-ratio': ratio },
        title: `${item.path}　·　${ageLabel(item.idle)}`,
        onClick: () => view.openFile(item.path),
      }, [
        media,
        div({ cls: 'desk-shot-cap' }, [
          span({ text: item.name }),
          el('small', { text: ageLabel(item.idle) }),
        ]),
      ]);
    });

    return [
      ui.cardHead('VISUAL', '画面墙', [
        ui.countChip(`${gallery.items.length} 张`),
        { label: '打开目录', onClick: () => view.plugin.revealFolder(gallery.folder) },
        { label: pickerOpen ? '取消' : '换目录', onClick: togglePicker },
      ]),
      pickerOpen ? renderPicker() : null,
      div({ cls: 'desk-shots', style: { '--desk-shot-min': shown.length <= 4 ? '200px' : '150px' } }, tiles),
      pageCount > 1
        ? div({ cls: 'desk-gallery-nav' }, [
          button({ cls: 'desk-head-btn', text: '上一组', onClick: () => view.shiftGalleryPage(-1, pageCount) }),
          span({
            text: view.galleryPaused || settings.galleryAutoRotate === false
              ? `第 ${pageIndex + 1} / ${pageCount} 组 · 已暂停`
              : `第 ${pageIndex + 1} / ${pageCount} 组 · 每 ${Math.max(3, Math.min(60, Number(settings.galleryRotateSeconds) || 8))} 秒自动切换`,
          }),
          button({
            cls: 'desk-head-btn',
            text: view.galleryPaused || settings.galleryAutoRotate === false ? '继续' : '暂停',
            onClick: () => view.toggleGalleryRotation(),
          }),
          button({ cls: 'desk-head-btn', text: '下一组', onClick: () => view.shiftGalleryPage(1, pageCount) }),
        ])
        : el('p', { cls: 'desk-hint-alt', text: '这个目录的图片已全部显示。' }),
    ];
  },
};

module.exports = [galleryCard];
module.exports.galleryCard = galleryCard;
module.exports.suggestFolders = suggestFolders;
module.exports.listVaultFolders = listVaultFolders;
module.exports.folderLabel = folderLabel;
module.exports.validateVaultFolderPath = validateVaultFolderPath;

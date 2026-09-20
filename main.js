/*
 * Desk — local workspace dashboard for Obsidian
 * Generated from src/. Do not edit main.js directly; edit src/ and run: npm run build
 */
"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/util.js
var require_util = __commonJS({
  "src/util.js"(exports2, module2) {
    "use strict";
    function parseList(value) {
      return String(value || "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
    }
    function dateKey(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    function startOfDay(date) {
      const copy = new Date(date);
      copy.setHours(0, 0, 0, 0);
      return copy;
    }
    function daysBetween(fromMs, toMs) {
      return Math.floor((startOfDay(new Date(toMs)) - startOfDay(new Date(fromMs))) / 864e5);
    }
    function ageLabel(days) {
      if (days <= 0) return "\u4ECA\u5929";
      if (days === 1) return "\u6628\u5929";
      return `${days} \u5929\u524D`;
    }
    function inFolder(path, folder, normalize = (value) => value) {
      if (!folder) return false;
      const prefix = normalize(folder);
      return path === prefix || path.startsWith(`${prefix}/`);
    }
    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }
    function barWidth(value, max, floor = 3) {
      if (!max) return `${floor}%`;
      return `${Math.max(floor, Math.round(value / max * 100))}%`;
    }
    function setFrontmatterField(text, key, value) {
      const source = String(text === void 0 || text === null ? "" : text);
      const line = `${key}: ${value}`;
      const opened = /^---\r?\n/.test(source);
      if (!opened) {
        return { ok: true, text: `---
${line}
---

${source.replace(/^\s+/, "")}`, reason: "created" };
      }
      const lines = source.split(/\r?\n/);
      let close = -1;
      for (let i = 1; i < lines.length; i += 1) {
        if (/^(---|\.\.\.)\s*$/.test(lines[i])) {
          close = i;
          break;
        }
      }
      if (close === -1) return { ok: false, text: source, reason: "malformed" };
      const pattern = new RegExp(`^${key}\\s*:`, "i");
      for (let i = 1; i < close; i += 1) {
        if (!pattern.test(lines[i])) continue;
        if (lines[i] === line) return { ok: false, text: source, reason: "unchanged" };
        let end = i;
        while (end + 1 < close && /^(\s+\S|\s*-\s)/.test(lines[end + 1])) end += 1;
        lines.splice(i, end - i + 1, line);
        return { ok: true, text: lines.join("\n"), reason: "replaced" };
      }
      lines.splice(close, 0, line);
      return { ok: true, text: lines.join("\n"), reason: "inserted" };
    }
    function topEntries(map, limit) {
      return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }));
    }
    function sumValues(map) {
      let total = 0;
      map.forEach((value) => {
        total += value;
      });
      return total;
    }
    module2.exports = {
      parseList,
      dateKey,
      startOfDay,
      daysBetween,
      ageLabel,
      inFolder,
      clamp,
      barWidth,
      topEntries,
      sumValues,
      setFrontmatterField
    };
  }
});

// src/registry.js
var require_registry = __commonJS({
  "src/registry.js"(exports2, module2) {
    "use strict";
    var { parseList } = require_util();
    var TEMPLATES = [
      {
        id: "general",
        label: "\u901A\u7528\u5DE5\u4F5C\u53F0",
        desc: "\u5F85\u529E\u3001\u65E5\u5386\u3001\u52A8\u7EBF\u3001\u4EA7\u51FA\u8282\u594F\u3002\u4EFB\u4F55\u5E93\u88C5\u4E0A\u5C31\u6709\u4E1C\u897F\u770B\u3002"
      },
      {
        id: "study",
        label: "\u8BA1\u7B97\u673A\u5B66\u4E60",
        desc: "\u6280\u672F\u6808\u5206\u5E03\u3001\u6982\u5FF5\u503A\u3001\u8BBA\u6587\u8FDB\u5EA6\u3001\u590D\u4E60\u961F\u5217\u3002"
      }
    ];
    var TEMPLATE_IDS = TEMPLATES.map((item) => item.id);
    var CARDS = [];
    var BY_ID = /* @__PURE__ */ new Map();
    function register(card) {
      if (BY_ID.has(card.id)) throw new Error(`duplicate card id: ${card.id}`);
      const entry = {
        span: "half",
        templates: [],
        needs: [],
        // How the card behaves when its row is taller than its content:
        //   'fill'    — a list inside grows to use the space (default for list cards)
        //   'compact' — content is fixed; the card keeps its natural height
        // Cards that render a fixed widget (a month grid, a 4-step checklist) must be
        // 'compact', or the row's spare height becomes dead space inside them.
        grow: "fill",
        ...card
      };
      if (entry.grow !== "fill" && entry.grow !== "compact") {
        throw new Error(`card ${entry.id}: grow must be 'fill' or 'compact'`);
      }
      if (entry.span !== "half" && entry.span !== "full") {
        throw new Error(`card ${entry.id}: span must be 'half' or 'full'`);
      }
      entry.templates.forEach((id) => {
        if (!TEMPLATE_IDS.includes(id)) throw new Error(`card ${entry.id}: unknown template ${id}`);
      });
      CARDS.push(entry);
      BY_ID.set(entry.id, entry);
      return entry;
    }
    function allCards() {
      return CARDS;
    }
    function getCard(id) {
      return BY_ID.get(id);
    }
    function templateCards(templateId) {
      return CARDS.filter((card) => card.templates.includes(templateId)).map((card) => card.id);
    }
    function layout(enabledIds2, cols = 2) {
      const columns = Math.max(1, Math.min(3, Number(cols) || 2));
      const picked = enabledIds2.map((id) => BY_ID.get(id)).filter(Boolean).map((card) => ({ ...card, stretch: false, cols: 1 }));
      let used = 0;
      picked.forEach((card, index) => {
        if (columns === 1) {
          card.cols = 1;
          card.stretch = true;
          return;
        }
        if (card.span === "full") {
          card.cols = columns;
          card.stretch = false;
          used = 0;
          return;
        }
        const remaining = columns - used;
        const rest = picked.slice(index + 1);
        let pairable = 0;
        for (const item of rest) {
          if (item.span === "full") break;
          pairable += 1;
          if (pairable >= remaining) break;
        }
        if (pairable === 0) {
          card.cols = remaining;
          card.stretch = remaining > 1;
          used = 0;
          return;
        }
        card.cols = 1;
        used += 1;
        if (used >= columns) used = 0;
      });
      return picked;
    }
    function enabledIds(value) {
      return parseList(value).filter((id) => BY_ID.has(id));
    }
    function requiredData(cards) {
      const set = /* @__PURE__ */ new Set();
      cards.forEach((card) => card.needs.forEach((key) => set.add(key)));
      return set;
    }
    module2.exports = {
      TEMPLATES,
      TEMPLATE_IDS,
      register,
      allCards,
      getCard,
      templateCards,
      layout,
      enabledIds,
      requiredData
    };
  }
});

// src/settings.js
var require_settings = __commonJS({
  "src/settings.js"(exports2, module2) {
    "use strict";
    var { templateCards } = require_registry();
    var DEFAULTS = {
      // identity / chrome
      template: "general",
      // Grid width: 1, 2 or 3 columns. More columns means narrower, taller cards,
      // which suits a wide monitor; 1 suits a sidebar.
      columns: 2,
      // Optional hero background, read from a vault file. Deliberately a path rather
      // than a bundled asset: shipping images would bloat the package, and loading
      // them remotely would break the "local only, never connects" promise.
      heroImage: "",
      /**
       * Folder the visual card draws from. Empty by default, and that is not laziness:
       * a real vault is mostly UI screenshots (415 images here, nearly all captures),
       * so auto-showing "all images" produces a wall of grey dialogs. The user picks
       * the folder worth looking at; the card explains itself until they do.
       */
      galleryFolder: "",
      galleryCount: 6,
      galleryAutoRotate: true,
      galleryRotateSeconds: 8,
      // Frame shape. Tall suits illustration and posters, wide suits screenshots and
      // site mockups, square is the safe default for mixed folders.
      galleryRatio: "square",
      // Reversible dashboard cleanup. These records never delete or edit source files.
      itemStates: {},
      // Closed items move to archive when Desk next opens/refreshes after this many days. 0 = never.
      trashArchiveDays: 30,
      // Editable cards. scratchText lives in settings on purpose: it is meant to be
      // throwaway, and a note per stray thought would clutter the vault. The pinned
      // card is the opposite — it edits a real file.
      scratchText: "",
      scratchSavedAt: "",
      pinnedPath: "",
      // Max card height as a fraction of the pane, so a taller pane shows more rows
      // rather than stopping at a fixed pixel height.
      cardMaxVh: 72,
      displayName: "",
      dailyMessage: "\u628A\u96BE\u7684\u4E8B\u62C6\u5C0F\uFF0C\u7136\u540E\u4E00\u4EF6\u4E00\u4EF6\u505A\u5B8C\u3002",
      autoOpen: true,
      cards: "",
      // folders — blank means "this vault does not have one"
      workRoot: "",
      activeFolder: "",
      dailyFolder: "",
      projectFolder: "",
      researchFolder: "",
      blockerFolder: "",
      inboxFolder: "",
      // study template: where a note created from the concept-debt card is filed
      conceptFolder: "",
      // arsenal card: folders holding packaged skills (a folder per skill, each with
      // SKILL.md). These are usually dot-folders, which Obsidian excludes from its
      // file index, so they are read through the vault adapter instead.
      skillFolders: ".claude/skills, .obsidian/.claude/skills",
      templateFolder: "",
      // thresholds
      staleDays: 3,
      taskLimit: 12,
      heatWeeks: 26,
      reviewMinDays: 14,
      // task hygiene: a vault of notes is not a task database
      taskMaxAgeDays: 45,
      taskExcludes: "node_modules, skills-main, skill-pack, .backup, 08-Templates, \u6A21\u677F, \u95EE\u5377, \u5907\u4EFD, recordings, _archive, \u5F52\u6863, \u5B58\u6863",
      // Cap how many tasks one source note may contribute. A single planning note can
      // hold 80+ checkboxes and would otherwise fill the card, hiding every other
      // project. 6 leaves room for a note's real shortlist without letting it dominate
      // a 12-row card. 0 disables the cap.
      taskPerSource: 6,
      /**
       * Minimum checkbox text length. Was 4, which is wrong outside a CJK vault.
       *
       * 4 characters is a phrase in Chinese but a whole task in English: "gym",
       * "pay rent", "call Bob" were all silently deleted. Measured on the vault this
       * was originally tuned against, 1 through 4 admit the identical 114 tasks — the
       * threshold was protecting against nothing here while quietly discarding real
       * work in anyone else's vault. 2 still drops single-character placeholder rows.
       */
      taskMinLength: 2,
      // Machine-written bookkeeping files, plus vendored bundles. A third-party pack
      // committed into the vault reads as hundreds of notes created on one day, which
      // wrecks the output chart and floods the task list with someone else's docs.
      noteExcludes: "STATE, STATUS, MANIFEST, LOCK, CHECKPOINT, index.md, README, CHANGELOG, .feishu., source-archive, skill-pack, skills-main, node_modules, .venv, site-packages",
      // ownership
      myNames: "\u6211",
      teamNames: ""
    };
    var PRESETS = {
      general: {
        displayName: "",
        cards: () => templateCards("general")
      },
      study: {
        cards: () => templateCards("study")
      }
    };
    var FOLDER_HINTS = [
      ["activeFolder", [/11-Active$/, /进行中$/, /active$/i, /wip$/i]],
      ["dailyFolder", [/01-Daily$/, /日报$/, /daily$/i, /journal$/i]],
      ["projectFolder", [/02-Projects$/, /项目$/, /projects?$/i]],
      ["researchFolder", [/06-Research$/, /研究$/, /research$/i, /papers?$/i]],
      ["blockerFolder", [/04-Blockers$/, /阻塞$/, /blockers?$/i]],
      ["inboxFolder", [/00-Inbox$/, /收件箱$/, /inbox$/i]],
      ["templateFolder", [/08-Templates$/, /模板$/, /templates?$/i]]
    ];
    function matchKeys(name) {
      return FOLDER_HINTS.filter(([, patterns]) => patterns.some((pattern) => pattern.test(name))).map(([key]) => key);
    }
    var ARCHIVE_CJK = /(归档|存档|备份|副本|旧版|废弃)/;
    var ARCHIVE_LATIN = /(^|[_\-\s])(archive[d]?|backup|bak|old|deprecated|snapshot|copy)([_\-\s]|$)/i;
    var DATED_SNAPSHOT = /[_-]\d{4}[-_]?\d{2}[-_]?\d{2}$/;
    function isArchivePath(folderPath) {
      return folderPath.split("/").some((part) => {
        const bare = part.replace(/^_+/, "");
        return ARCHIVE_CJK.test(bare) || ARCHIVE_LATIN.test(bare) || DATED_SNAPSHOT.test(bare);
      });
    }
    function detectWorkRoot(folderPaths, counts = null) {
      const parents = /* @__PURE__ */ new Map();
      folderPaths.forEach((path) => {
        if (isArchivePath(path)) return;
        const parts = path.split("/");
        const name = parts[parts.length - 1];
        if (!matchKeys(name).length) return;
        const parent = parts.slice(0, -1).join("/");
        if (!parents.has(parent)) parents.set(parent, /* @__PURE__ */ new Set());
        matchKeys(name).forEach((key) => parents.get(parent).add(key));
      });
      if (!parents.size) return "";
      const weight = (path) => counts ? counts[path] || 0 : 0;
      const ranked = [...parents.entries()].map(([path, keys]) => ({ path, hits: keys.size, notes: weight(path) })).sort((a, b) => b.hits - a.hits || b.notes - a.notes || a.path.split("/").length - b.path.split("/").length);
      const best = ranked[0];
      return best.hits >= 3 ? best.path : "";
    }
    function detectFolders(folderPaths, root = "") {
      const scope = (root ? folderPaths.filter((path) => path.startsWith(`${root}/`)) : folderPaths).filter((path) => !isArchivePath(path));
      const out = {};
      FOLDER_HINTS.forEach(([key, patterns]) => {
        const hits = scope.filter((path) => patterns.some((pattern) => pattern.test(path.split("/").pop())));
        if (!hits.length) return;
        hits.sort((a, b) => a.split("/").length - b.split("/").length || a.length - b.length);
        out[key] = hits[0];
      });
      return out;
    }
    function detectLayout(folderPaths, counts = null) {
      const workRoot = detectWorkRoot(folderPaths, counts);
      return { workRoot, ...detectFolders(folderPaths, workRoot) };
    }
    module2.exports = {
      DEFAULTS,
      PRESETS,
      FOLDER_HINTS,
      matchKeys,
      isArchivePath,
      detectFolders,
      detectWorkRoot,
      detectLayout
    };
  }
});

// src/dom.js
var require_dom = __commonJS({
  "src/dom.js"(exports2, module2) {
    "use strict";
    var DATA_PREFIX = "data-";
    function classNames(value) {
      if (!value) return [];
      if (Array.isArray(value)) return value.flatMap(classNames);
      return String(value).split(/\s+/).filter(Boolean);
    }
    function applyProps(node, props) {
      if (!props) return;
      const { cls, text, title, attr, style, onClick, ariaLabel, html } = props;
      if (html !== void 0) {
        throw new Error("el(): html is not supported on purpose \u2014 build child nodes instead");
      }
      if (cls) {
        classNames(cls).forEach((name) => node.classList.add(name));
      }
      if (text !== void 0 && text !== null) node.textContent = String(text);
      if (title) node.setAttribute("title", String(title));
      if (ariaLabel) node.setAttribute("aria-label", String(ariaLabel));
      if (attr) {
        Object.entries(attr).forEach(([key, value]) => {
          if (value === void 0 || value === null || value === false) return;
          node.setAttribute(key, String(value));
        });
      }
      if (style) {
        Object.entries(style).forEach(([key, value]) => {
          if (value === void 0 || value === null) return;
          node.style.setProperty(key, String(value));
        });
      }
      if (onClick) node.addEventListener("click", onClick);
    }
    function appendChildren(node, children) {
      if (children === void 0 || children === null || children === false) return;
      if (Array.isArray(children)) {
        children.forEach((child) => appendChildren(node, child));
        return;
      }
      if (typeof children === "string" || typeof children === "number") {
        node.appendChild(node.ownerDocument.createTextNode(String(children)));
        return;
      }
      if (children.nodeType) {
        node.appendChild(children);
        return;
      }
      throw new Error(`el(): unsupported child ${Object.prototype.toString.call(children)}`);
    }
    var ambientDocument = typeof document !== "undefined" ? document : null;
    function setDocument2(doc) {
      ambientDocument = doc;
    }
    function el(tag, props = null, children = null) {
      const doc = props && props.doc || ambientDocument;
      if (!doc) throw new Error("el(): no document available \u2014 call setDocument() first");
      const node = doc.createElement(tag);
      applyProps(node, props);
      appendChildren(node, children);
      return node;
    }
    var div = (props, children) => el("div", props, children);
    var span = (props, children) => el("span", props, children);
    var button = (props, children) => el("button", props, children);
    function fill(node, children) {
      while (node.firstChild) node.removeChild(node.firstChild);
      appendChildren(node, children);
      return node;
    }
    function data(map) {
      const out = {};
      Object.entries(map || {}).forEach(([key, value]) => {
        if (value === void 0 || value === null || value === "") return;
        out[`${DATA_PREFIX}${key}`] = String(value);
      });
      return out;
    }
    module2.exports = { el, div, span, button, fill, data, setDocument: setDocument2 };
  }
});

// src/ui.js
var require_ui = __commonJS({
  "src/ui.js"(exports2, module2) {
    "use strict";
    var { el, div, span, button, data } = require_dom();
    var { barWidth } = require_util();
    function cardHead(kicker, title, actions = []) {
      const right = (Array.isArray(actions) ? actions : [actions]).filter(Boolean).map((item) => item.nodeType ? item : headButton(item));
      return div({ cls: "desk-card-head" }, [
        div({}, [
          kicker ? span({ text: kicker }) : null,
          el("h2", { text: title })
        ]),
        ...right
      ]);
    }
    function headButton({ label, onClick, kind = "" }) {
      return button({ cls: ["desk-head-btn", kind], text: label, onClick });
    }
    function countChip(text) {
      return el("b", { cls: "desk-count", text });
    }
    function empty(text, hint, { fill = false } = {}) {
      return div({ cls: ["desk-empty", fill ? "desk-fill" : ""] }, [
        span({ text }),
        hint ? el("em", { text: hint }) : null
      ]);
    }
    function missingFolder(folder, what) {
      return div({ cls: "desk-empty" }, [
        span({ text: `\u8FD9\u4E2A\u5E93\u6CA1\u6709 ` }),
        el("code", { text: folder || what }),
        span({ text: " \u76EE\u5F55\u3002\u53EF\u4EE5\u5728\u8BBE\u7F6E\u91CC\u6539\u8DEF\u5F84\uFF0C\u6216\u8005\u5173\u6389\u8FD9\u5F20\u5361\u7247\u3002" })
      ]);
    }
    function subSection(head, body) {
      return div({ cls: "desk-sub" }, [
        div({ cls: "desk-sub-head", text: head }),
        body
      ]);
    }
    function barRow(label, value, max, { floor = 3, tone = "" } = {}) {
      return div({ cls: ["desk-bar-row", tone] }, [
        span({ text: label, title: label }),
        div({}, [el("i", { style: { width: barWidth(value, max, floor) } })]),
        el("b", { text: String(value) })
      ]);
    }
    function barList(rows, emptyText) {
      if (!rows.length) return empty(emptyText);
      const max = Math.max(...rows.map((row) => row.value));
      return div({ cls: "desk-bars-plain" }, rows.map((row) => barRow(row.label, row.value, max, row)));
    }
    function listRow({ title, meta, icon, tone, onClick, badge, dismiss, view }) {
      if (dismiss && view && typeof view.isItemHidden === "function" && view.isItemHidden(dismiss)) return null;
      const body = span({ cls: "desk-row-body" }, [
        el("strong", { text: title }),
        meta ? el("small", { text: meta }) : null
      ]);
      if (dismiss && view) {
        return div({ cls: ["desk-row", tone] }, [
          button({
            cls: "desk-row-toggle",
            ariaLabel: `\u5173\u95ED\uFF1A${title}`,
            title: "\u52FE\u9009\u540E\u79FB\u5165 Desk \u56DE\u6536\u7AD9\uFF0C\u4E0D\u5220\u9664\u6E90\u6587\u4EF6",
            attr: { role: "checkbox", "aria-checked": "false" },
            onClick: (event) => {
              if (event && typeof event.stopPropagation === "function") event.stopPropagation();
              view.closeItem(dismiss);
            }
          }),
          button({ cls: "desk-row-main", onClick, title }, [body]),
          badge ? el("em", { cls: "desk-row-badge", text: badge }) : null
        ]);
      }
      const shownIcon = icon !== void 0 && icon !== null && String(icon).trim() ? icon : null;
      return button({ cls: ["desk-row", tone], onClick, title }, [
        shownIcon !== null ? el("i", { text: shownIcon }) : null,
        body,
        badge ? el("em", { cls: "desk-row-badge", text: badge }) : null
      ]);
    }
    function rowList(rows, emptyNode, cls = "", { fill = true } = {}) {
      rows = (rows || []).filter(Boolean);
      if (!rows.length) {
        if (!fill) return emptyNode;
        return div({ cls: ["desk-row-list", "desk-fill", "is-empty", cls] }, emptyNode ? [emptyNode] : []);
      }
      return div({ cls: ["desk-row-list", fill ? "desk-fill" : "", cls] }, rows);
    }
    function metrics(items) {
      return div({ cls: "desk-metrics" }, items.map((item) => div({ cls: item.tone || "" }, [
        el("b", { text: String(item.value) }),
        span({ text: item.label })
      ])));
    }
    function segmented(options, active, onPick) {
      return div({ cls: "desk-switch" }, options.map((option) => button({
        cls: option.key === active ? "is-active" : "",
        text: option.label,
        onClick: () => onPick(option.key)
      })));
    }
    function progress(label, done, total, { tone = "" } = {}) {
      const pct = total ? Math.round(done / total * 100) : 0;
      return div({ cls: ["desk-progress", tone] }, [
        div({ cls: "desk-progress-head" }, [
          span({ text: label, title: label }),
          el("b", { text: `${done}/${total}` })
        ]),
        div({ cls: "desk-progress-track" }, [
          el("i", { style: { width: `${pct}%` } })
        ])
      ]);
    }
    function tags(items, cls = "") {
      if (!items.length) return null;
      return div({ cls: ["desk-tags", cls] }, items.map((item) => typeof item === "string" ? el("em", { text: item }) : el("em", { cls: item.tone, text: item.label })));
    }
    function note(text, action) {
      return div({ cls: "desk-note" }, [
        span({ text }),
        action ? button({ text: action.label, onClick: action.onClick }) : null
      ]);
    }
    function checkRow({ text, done, meta, onToggle, onOpen, tone }) {
      return div({ cls: ["desk-task", tone, done ? "is-done" : ""] }, [
        button({
          cls: ["desk-check", done ? "is-on" : ""],
          ariaLabel: done ? "\u6807\u8BB0\u672A\u5B8C\u6210" : "\u6807\u8BB0\u5B8C\u6210",
          onClick: (event) => {
            event.stopPropagation();
            onToggle == null ? void 0 : onToggle();
          }
        }),
        button({ cls: "desk-task-body", onClick: onOpen, title: text }, [
          el("strong", { text }),
          meta ? el("small", {}, meta) : null
        ])
      ]);
    }
    function blockerRow({ title, status, state, age, stale, onResolve, onObsolete, onOpen }) {
      const unknown = state === "unknown";
      return div({ cls: ["desk-task", "desk-blocker", stale ? "is-stale" : ""] }, [
        button({
          cls: "desk-check",
          ariaLabel: `\u628A\u300C${title}\u300D\u6807\u8BB0\u4E3A\u5DF2\u89E3\u51B3`,
          title: "\u6807\u8BB0\u4E3A\u5DF2\u89E3\u51B3\uFF08\u5199\u5165\u6E90\u7B14\u8BB0 status: resolved\uFF09",
          onClick: (event) => {
            event.stopPropagation();
            onResolve == null ? void 0 : onResolve();
          }
        }),
        button({ cls: "desk-task-body", onClick: onOpen, title }, [
          el("strong", { text: title }),
          el("small", {}, [
            unknown ? el("em", { cls: "is-unknown", text: "\u72B6\u6001\u672A\u8BB0\u5F55" }) : el("em", { cls: "is-waiting", text: status }),
            age ? span({ cls: ["desk-task-age", stale ? "is-stale" : ""], text: age }) : null
          ])
        ]),
        button({
          cls: "desk-row-x",
          text: "\u5212\u6389",
          ariaLabel: `\u628A\u300C${title}\u300D\u6807\u8BB0\u4E3A\u8FC7\u65F6`,
          title: "\u5DF2\u7ECF\u4E0D\u91CD\u8981\u4E86\uFF08\u5199\u5165\u6E90\u7B14\u8BB0 status: obsolete\uFF09",
          onClick: (event) => {
            event.stopPropagation();
            onObsolete == null ? void 0 : onObsolete();
          }
        })
      ]);
    }
    module2.exports = {
      cardHead,
      headButton,
      countChip,
      empty,
      missingFolder,
      subSection,
      barRow,
      barList,
      listRow,
      rowList,
      metrics,
      segmented,
      progress,
      tags,
      note,
      checkRow,
      blockerRow,
      el,
      div,
      span,
      button,
      data
    };
  }
});

// src/tasks.js
var require_tasks = __commonJS({
  "src/tasks.js"(exports2, module2) {
    "use strict";
    var { parseList, daysBetween } = require_util();
    var TASK_LINE = /^(\s*)[-*+]\s+\[( |x|X|\/|-)\]\s*(.+)$/;
    var TASK_FIELDS = [
      ["due", /[📅📆🗓]\s*(\d{4}-\d{2}-\d{2})/u],
      ["scheduled", /[⏳⌛]\s*(\d{4}-\d{2}-\d{2})/u],
      ["start", /🛫\s*(\d{4}-\d{2}-\d{2})/u],
      ["done", /✅\s*(\d{4}-\d{2}-\d{2})/u]
    ];
    var PRIORITY = [["high", /[⏫🔺]/u], ["medium", /🔼/u], ["low", /[🔽⏬]/u]];
    var EXTRA_EMOJI = /[🔁➕🆔⛔🏁]/gu;
    var WAIT_VERB = /(确认|拍板|决定|审阅|审核|回复|反馈|批准|签署|通知|提供|发起|同意|定稿)/;
    var WAIT_LEAD = /^(等|待|等待|需要|请)/;
    function classifyOwner(text, myNames, teamNames) {
      const prefix = text.match(/^([^：:，。\s]{1,10})[：:]\s*\S/);
      if (prefix) {
        const label = prefix[1];
        if (myNames.some((name) => label === name)) return { owner: "me", who: label };
        if (teamNames.some((name) => label.includes(name))) return { owner: "other", who: label };
      }
      const mentioned = teamNames.find((name) => text.includes(name));
      if (mentioned && (WAIT_LEAD.test(text) || WAIT_VERB.test(text))) {
        return { owner: "other", who: mentioned };
      }
      return { owner: "me", who: "" };
    }
    function parseTasks(content, file) {
      const out = [];
      const lines = content.split(/\r?\n/);
      let inCode = false;
      lines.forEach((line, index) => {
        if (/^\s*(```|~~~)/.test(line)) {
          inCode = !inCode;
          return;
        }
        if (inCode) return;
        const match = line.match(TASK_LINE);
        if (!match) return;
        const marker = match[2];
        const raw = match[3].trim();
        let text = raw;
        const fields = {};
        TASK_FIELDS.forEach(([key, pattern]) => {
          const hit = raw.match(pattern);
          if (hit) fields[key] = hit[1];
          text = text.replace(pattern, "");
        });
        let priority = "none";
        PRIORITY.forEach(([level, pattern]) => {
          if (pattern.test(text)) {
            priority = level;
            text = text.replace(pattern, "");
          }
        });
        text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(EXTRA_EMOJI, "").replace(/[*_`~]/g, "").replace(/[\uD800-\uDFFF]/g, "").replace(/\s+/g, " ").trim();
        if (!text) return;
        out.push({
          text,
          done: /x/i.test(marker),
          cancelled: marker === "-",
          line: index,
          path: file.path,
          basename: file.basename,
          due: fields.due || "",
          scheduled: fields.scheduled || "",
          priority,
          mtime: file.stat.mtime
        });
      });
      return out;
    }
    function dedupeTasks(tasks) {
      const seen = /* @__PURE__ */ new Map();
      const penalty = (path) => (/source-archive|artifacts|\.feishu\.|archive|归档/i.test(path) ? 2 : 0) + (path.split("/").length > 5 ? 1 : 0);
      tasks.forEach((task) => {
        const previous = seen.get(task.text);
        if (!previous || penalty(task.path) < penalty(previous.path)) seen.set(task.text, task);
      });
      return [...seen.values()];
    }
    var PRIORITY_RANK = { high: 0, medium: 1, none: 2, low: 3 };
    function sortTasks(tasks, today) {
      return [...tasks].sort((a, b) => {
        const aDue = a.due || a.scheduled;
        const bDue = b.due || b.scheduled;
        const aOver = aDue && aDue <= today ? 0 : 1;
        const bOver = bDue && bDue <= today ? 0 : 1;
        if (aOver !== bOver) return aOver - bOver;
        if (aDue && bDue && aDue !== bDue) return aDue.localeCompare(bDue);
        if (aDue && !bDue) return -1;
        if (!aDue && bDue) return 1;
        if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
          return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        }
        return b.mtime - a.mtime;
      });
    }
    function isRelevantTask(task, settings) {
      if (task.due || task.scheduled) return true;
      const base = Number(settings.taskMaxAgeDays || 0);
      const ageLimit = task.owner === "other" ? base * 3 : base;
      const excludes = parseList(settings.taskExcludes);
      if (excludes.some((fragment) => task.path.includes(fragment))) return false;
      if (/^其他\s*[（(：:]/.test(task.text) || /[：:]$/.test(task.text)) return false;
      if (task.text.length < Number(settings.taskMinLength || 1)) return false;
      if (ageLimit > 0 && daysBetween(task.mtime, Date.now()) > ageLimit) return false;
      return true;
    }
    function capPerSource(tasks, limit) {
      const max = Number(limit || 0);
      if (max <= 0) return { tasks, capped: 0 };
      const seen = /* @__PURE__ */ new Map();
      const kept = [];
      let capped = 0;
      tasks.forEach((task) => {
        if (task.due || task.scheduled) {
          kept.push(task);
          return;
        }
        const count = seen.get(task.path) || 0;
        if (count >= max) {
          capped += 1;
          return;
        }
        seen.set(task.path, count + 1);
        kept.push(task);
      });
      return { tasks: kept, capped };
    }
    module2.exports = {
      TASK_LINE,
      TASK_FIELDS,
      PRIORITY,
      EXTRA_EMOJI,
      PRIORITY_RANK,
      classifyOwner,
      parseTasks,
      dedupeTasks,
      sortTasks,
      isRelevantTask,
      capPerSource
    };
  }
});

// src/scan.js
var require_scan = __commonJS({
  "src/scan.js"(exports2, module2) {
    "use strict";
    var { parseList, dateKey, startOfDay, daysBetween, inFolder, topEntries, sumValues } = require_util();
    var {
      parseTasks,
      dedupeTasks,
      sortTasks,
      classifyOwner,
      isRelevantTask,
      capPerSource
    } = require_tasks();
    var SKILL_CACHE_MS = 5 * 60 * 1e3;
    var LANG_ALIAS = {
      py: "python",
      js: "javascript",
      ts: "typescript",
      sh: "bash",
      shell: "bash",
      zsh: "bash",
      ps1: "powershell",
      pwsh: "powershell",
      yml: "yaml",
      md: "markdown",
      jsonc: "json",
      tsx: "typescript",
      jsx: "javascript",
      "c++": "cpp",
      "c#": "csharp",
      golang: "go",
      rs: "rust",
      kt: "kotlin"
    };
    var LANG_IGNORE = /* @__PURE__ */ new Set(["text", "txt", "markdown", "md", "plaintext", "output", "log", ""]);
    function isGeneratedReport(content) {
      const head = content.slice(0, 400);
      return /^#\s*Review:/m.test(head) && /^Reviewer:/m.test(head) && /^Commit:/m.test(head);
    }
    var IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
    var STALE_BLOCKER_DAYS = 30;
    var CLOSED_STATUS = /* @__PURE__ */ new Set([
      "resolved",
      "closed",
      "done",
      "fixed",
      "wontfix",
      "won't fix",
      "cancelled",
      "canceled",
      "abandoned",
      "obsolete",
      "dropped",
      "shipped",
      "\u5DF2\u89E3\u51B3",
      "\u5DF2\u5B8C\u6210",
      "\u5DF2\u5173\u95ED",
      "\u5DF2\u653E\u5F03",
      "\u4F5C\u5E9F",
      "\u8FC7\u65F6"
    ]);
    function readBlockerStatus(frontmatter) {
      const raw = frontmatter && frontmatter.status;
      const value = String(raw === void 0 || raw === null ? "" : raw).trim();
      if (!value) return { status: "", state: "unknown" };
      const key = value.toLowerCase();
      if (CLOSED_STATUS.has(key)) return { status: value, state: "closed" };
      return { status: value, state: "open" };
    }
    function extractLangs(content) {
      const counts = /* @__PURE__ */ new Map();
      for (const match of content.matchAll(/^[ \t]*(?:```|~~~)([A-Za-z0-9+#._-]+)/gm)) {
        const raw = match[1].toLowerCase();
        const lang = LANG_ALIAS[raw] || raw;
        if (LANG_IGNORE.has(lang) || lang.length > 12) continue;
        counts.set(lang, (counts.get(lang) || 0) + 1);
      }
      return [...counts.entries()].map(([name, count]) => ({ name, count }));
    }
    var PLACEHOLDER_LINK = /^(\.{2,}|…+|xxx+|todo|tbd|文档名|笔记名|概念名|note ?name|待补|某某|示例|example|placeholder)$/i;
    function isConceptName(target) {
      if (!target) return false;
      if (target.includes("/") || target.includes("\\")) return false;
      if (/^\d{2}[_\-\s]/.test(target)) return false;
      if (/\.(md|txt|png|jpe?g|gif|svg|webp|pdf|canvas|excalidraw|zip|html?|docx?|xlsx?|pptx?|mp[34]|m4a|wav|csv|json|ya?ml)$/i.test(target)) return false;
      if (target.includes("__")) return false;
      if (/^\d{4}-\d{2}-\d{2}/.test(target)) return false;
      if (/^[A-Z][A-Z0-9_-]{2,}/.test(target)) return false;
      if (PLACEHOLDER_LINK.test(target.trim())) return false;
      if (/(^|[-_\s])(project|roadmap|status|report|notes|draft|todo|index|readme|template|v\d+)([-_\s]|$)/i.test(target)) {
        return false;
      }
      if (target.trim().length < 2) return false;
      if (target.length > 40) return false;
      return true;
    }
    function parseSkillDescription(text) {
      const lines = String(text || "").split(/\r?\n/);
      if (lines[0] !== "---") return "";
      const end = lines.indexOf("---", 1);
      const body = lines.slice(1, end < 0 ? lines.length : end);
      const at = body.findIndex((line) => /^description:/.test(line));
      if (at < 0) return "";
      const first = body[at].replace(/^description:\s*/, "").trim();
      if (first === "|" || first === ">" || first === "|-" || first === ">-") {
        const folded = [];
        for (let index = at + 1; index < body.length; index += 1) {
          if (!/^\s+\S/.test(body[index])) break;
          folded.push(body[index].trim());
        }
        return folded.join(" ");
      }
      return first.replace(/^["']|["']$/g, "");
    }
    function extractLinks(content) {
      const out = /* @__PURE__ */ new Set();
      for (const match of content.matchAll(/\[\[([^\]|#^]+)/g)) {
        const target = match[1].trim();
        if (target) out.add(target);
      }
      return [...out];
    }
    var DeskData = class {
      constructor(app, settings, { normalize = (value) => value } = {}) {
        this.app = app;
        this.settings = settings;
        this.normalize = normalize;
        this.cache = null;
        this.fileCache = /* @__PURE__ */ new Map();
        this.skillCache = null;
        this.lastScanMs = 0;
      }
      invalidate() {
        this.cache = null;
      }
      in(path, folder) {
        return inFolder(path, folder, this.normalize);
      }
      markdownFiles() {
        const root = this.normalize(this.settings.workRoot || "");
        return this.app.vault.getMarkdownFiles().filter((file) => !root || this.in(file.path, root));
      }
      folderExists(path) {
        var _a, _b, _c;
        if (!path) return false;
        const node = (_c = (_b = (_a = this.app) == null ? void 0 : _a.vault) == null ? void 0 : _b.getAbstractFileByPath) == null ? void 0 : _c.call(_b, this.normalize(path));
        return Boolean(node && node.children);
      }
      /**
       * Scan the vault. `needs` is a Set of derived-view keys; anything not asked for
       * is skipped. Tasks and the code profile share the single read pass.
       */
      async collect(needs = null) {
        const want = (key) => !needs || needs.has(key);
        if (this.cache) {
          const covered = this.cache.needs;
          const satisfied = !covered || !needs || [...needs].every((key) => covered.has(key));
          if (satisfied) return this.cache;
        }
        const started = Date.now();
        const files = this.markdownFiles();
        const today = dateKey(/* @__PURE__ */ new Date());
        const toRead = [];
        files.forEach((file) => {
          const meta = this.app.metadataCache.getFileCache(file);
          if (!meta) {
            toRead.push(file);
            return;
          }
          const hasTask = Array.isArray(meta.listItems) && meta.listItems.some((item) => item.task !== void 0);
          const hasCode = Array.isArray(meta.sections) && meta.sections.some((s) => s.type === "code");
          const hasLink = Array.isArray(meta.links) && meta.links.length > 0;
          if (hasTask || hasCode || want("concepts") && hasLink) toRead.push(file);
        });
        const codeEntries = [];
        const linkEntries = [];
        const tasks = [];
        const batches = await Promise.all(toRead.map(async (file) => {
          const cached = this.fileCache.get(file.path);
          if (cached && cached.mtime === file.stat.mtime) {
            if (cached.langs.length) codeEntries.push({ file, langs: cached.langs });
            if (cached.links.length) linkEntries.push({ file, links: cached.links });
            return cached.tasks.map((task) => ({ ...task, mtime: file.stat.mtime }));
          }
          try {
            const content = await this.app.vault.cachedRead(file);
            const hasBoxes = content.includes("- [") || content.includes("* [");
            const parsed = hasBoxes && !isGeneratedReport(content) ? parseTasks(content, file) : [];
            const langs = extractLangs(content);
            const links = content.includes("[[") ? extractLinks(content) : [];
            this.fileCache.set(file.path, { mtime: file.stat.mtime, tasks: parsed, langs, links });
            if (langs.length) codeEntries.push({ file, langs });
            if (links.length) linkEntries.push({ file, links });
            return parsed;
          } catch (e) {
            return [];
          }
        }));
        batches.forEach((batch) => tasks.push(...batch));
        if (this.fileCache.size > files.length * 2) {
          const live = new Set(files.map((file) => file.path));
          [...this.fileCache.keys()].forEach((key) => {
            if (!live.has(key)) this.fileCache.delete(key);
          });
        }
        const myNames = parseList(this.settings.myNames);
        const teamNames = parseList(this.settings.teamNames);
        tasks.forEach((task) => {
          const { owner, who } = classifyOwner(task.text, myNames, teamNames);
          task.owner = owner;
          task.who = who;
        });
        const allOpen = tasks.filter((task) => !task.done && !task.cancelled);
        const relevant = dedupeTasks(allOpen.filter((task) => isRelevantTask(task, this.settings)));
        const ranked = sortTasks(relevant, today);
        const { tasks: openTasks, capped } = capPerSource(ranked, this.settings.taskPerSource);
        const model = {
          needs: needs || null,
          files,
          tasks,
          openTasks,
          allOpenCount: allOpen.length,
          // Two different reductions, reported separately because they mean different
          // things to the user: filtered items are judged irrelevant, capped items are
          // relevant but crowded out by a busy source note.
          hiddenCount: allOpen.length - relevant.length,
          cappedCount: capped,
          mineCount: openTasks.filter((task) => task.owner === "me").length,
          waitingCount: openTasks.filter((task) => task.owner === "other").length,
          doneTasks: tasks.filter((task) => task.done)
        };
        if (want("active")) model.active = this.activeStreams();
        if (want("streak")) model.streak = this.dailyStreak();
        if (want("heat")) model.heat = this.outputHeat(files);
        if (want("digest")) model.digest = this.digestQueue(files);
        if (want("blockers")) model.blockers = this.openBlockers(files);
        if (want("recent")) model.recent = this.recentWork(files);
        if (want("code")) model.code = this.codeProfile(codeEntries);
        if (want("concepts")) model.concepts = this.conceptDebt(linkEntries, files);
        if (want("review")) model.review = this.reviewQueue(files);
        if (want("gallery")) model.gallery = this.galleryImages();
        if (want("arsenal")) model.arsenal = this.arsenal(files, await this.loadSkills());
        this.lastScanMs = Date.now() - started;
        model.scanMs = this.lastScanMs;
        this.cache = model;
        return model;
      }
      /** 11-Active: one entry per workstream folder, flagged when it stalls. */
      activeStreams() {
        var _a, _b, _c;
        const rootPath = this.normalize(this.settings.activeFolder || "");
        const root = rootPath && ((_c = (_b = (_a = this.app) == null ? void 0 : _a.vault) == null ? void 0 : _b.getAbstractFileByPath) == null ? void 0 : _c.call(_b, rootPath));
        if (!root || !root.children) return [];
        const now = Date.now();
        return root.children.filter((child) => child.children).map((folder) => {
          const notes = [];
          const walk = (dir) => dir.children.forEach((child) => {
            if (child.children) walk(child);
            else if (child.extension === "md") notes.push(child);
          });
          walk(folder);
          const latest = notes.reduce((max, note) => Math.max(max, note.stat.mtime), 0);
          const idle = latest ? daysBetween(latest, now) : 999;
          const state = notes.find((note) => note.basename === "STATE") || null;
          return {
            name: folder.name,
            path: folder.path,
            notes: notes.length,
            latest,
            idle,
            stale: idle >= Number(this.settings.staleDays || 3),
            statePath: state ? state.path : "",
            newest: notes.sort((a, b) => b.stat.mtime - a.stat.mtime)[0] || null
          };
        }).sort((a, b) => b.idle - a.idle);
      }
      /** Which of the last N days have a daily report file. */
      dailyStreak(span = 14) {
        const folder = this.normalize(this.settings.dailyFolder || "");
        if (!folder) return [];
        const reports = /* @__PURE__ */ new Map();
        this.app.vault.getMarkdownFiles().filter((file) => this.in(file.path, folder)).forEach((file) => {
          const hit = file.basename.match(/(\d{4}-\d{2}-\d{2})/);
          if (!hit) return;
          const isReport = /日报|report/i.test(file.basename);
          const key = hit[1];
          if (!reports.has(key) || isReport && !reports.get(key).isReport) {
            reports.set(key, { file, isReport });
          }
        });
        const days = [];
        const now = /* @__PURE__ */ new Date();
        for (let offset = span - 1; offset >= 0; offset -= 1) {
          const date = new Date(now);
          date.setDate(date.getDate() - offset);
          const key = dateKey(date);
          const entry = reports.get(key);
          days.push({
            key,
            day: date.getDate(),
            weekday: date.getDay(),
            weekend: date.getDay() === 0 || date.getDay() === 6,
            has: Boolean(entry),
            report: Boolean(entry && entry.isReport),
            path: entry ? entry.file.path : ""
          });
        }
        return days;
      }
      /**
       * GitHub-style grid: notes created per day, plus per-folder distribution.
       *
       * Only human notes are counted. A vendored bundle dropped into the vault (one
       * real case: 130 files from a skill pack landing on a single day) otherwise
       * sets the peak so high that every genuine day of work renders as the palest
       * shade — the chart becomes unreadable precisely because of noise.
       */
      outputHeat(files) {
        const weeks = Number(this.settings.heatWeeks || 26);
        const byDay = /* @__PURE__ */ new Map();
        const byFolder = /* @__PURE__ */ new Map();
        const cutoff = startOfDay(/* @__PURE__ */ new Date()).getTime() - (weeks * 7 - 1) * 864e5;
        files.filter((file) => this.isHumanNote(file)).forEach((file) => {
          const stamped = file.path.match(/(\d{4})-(\d{2})-(\d{2})/);
          const created = stamped ? new Date(Number(stamped[1]), Number(stamped[2]) - 1, Number(stamped[3])).getTime() : Math.min(file.stat.ctime, file.stat.mtime);
          if (created >= cutoff && created <= Date.now()) {
            const key = dateKey(new Date(created));
            byDay.set(key, (byDay.get(key) || 0) + 1);
          }
          const parts = file.path.split("/");
          const bucket = parts.length > 1 ? parts[1] : "(root)";
          if (file.stat.mtime >= cutoff) byFolder.set(bucket, (byFolder.get(bucket) || 0) + 1);
        });
        const end = startOfDay(/* @__PURE__ */ new Date());
        const endOffset = (end.getDay() + 6) % 7;
        const columns = [];
        const cursor = new Date(end);
        cursor.setDate(cursor.getDate() - endOffset - (weeks - 1) * 7);
        for (let week = 0; week < weeks; week += 1) {
          const column = [];
          for (let day = 0; day < 7; day += 1) {
            const key = dateKey(cursor);
            const future = cursor > end;
            column.push({ key, count: future ? -1 : byDay.get(key) || 0, month: cursor.getMonth() });
            cursor.setDate(cursor.getDate() + 1);
          }
          columns.push(column);
        }
        const counts = [...byDay.values()];
        const total = counts.reduce((sum, value) => sum + value, 0);
        const folders = topEntries(byFolder, 6);
        const folderTotal = folders.reduce((sum, item) => sum + item.count, 0) || 1;
        return {
          columns,
          total,
          peak: counts.length ? Math.max(...counts) : 0,
          activeDays: counts.length,
          folders,
          folderTotal,
          weeks
        };
      }
      /** Inbox + recent research that has not been filed yet. */
      digestQueue(files) {
        const inbox = this.normalize(this.settings.inboxFolder || "");
        const research = this.normalize(this.settings.researchFolder || "");
        return files.filter((file) => this.in(file.path, inbox) || this.in(file.path, research)).filter((file) => this.isHumanNote(file)).sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 8).map((file) => ({
          title: file.basename,
          path: file.path,
          source: this.in(file.path, inbox) ? "\u6536\u4EF6\u7BB1" : "\u7814\u7A76",
          idle: daysBetween(file.stat.mtime, Date.now())
        }));
      }
      /**
       * Blocker notes that are not closed.
       *
       * Returns `state` alongside `status` so the card can separate "written down as
       * open" from "never recorded" — the two need different affordances: one is
       * closed by flipping a field, the other by first writing one.
       *
       * `idle` and `stale` are carried too: a blocker untouched for months is a
       * different problem from yesterday's, and a card that showed both identically is
       * how three May notes stayed on screen into September.
       *
       * No slice here. The card decides how many to show and whether to show the stale
       * ones, because that choice belongs next to the control that resolves them —
       * capping in the scanner is what made stale items unreachable, not fewer.
       */
      openBlockers(files) {
        const folder = this.normalize(this.settings.blockerFolder || "");
        if (!folder) return [];
        const now = Date.now();
        return files.filter((file) => this.in(file.path, folder)).map((file) => {
          const meta = this.app.metadataCache.getFileCache(file);
          const { status, state } = readBlockerStatus(meta && meta.frontmatter);
          const idle = daysBetween(file.stat.mtime, now);
          return {
            title: file.basename,
            path: file.path,
            status,
            state,
            mtime: file.stat.mtime,
            idle,
            stale: idle >= STALE_BLOCKER_DAYS
          };
        }).filter((item) => item.state !== "closed").sort((a, b) => b.idle - a.idle);
      }
      /**
       * Machine-generated bookkeeping notes are not "work I was doing".
       *
       * Three shapes show up in a synced vault and all of them polluted the review
       * and weekly cards before being filtered:
       *  - SCREAMING_SNAKE basenames written by scripts
       *  - upload copies that flatten the path with '__' separators
       *  - artefact directories from push/fetch pipelines
       */
      isHumanNote(file) {
        const excludes = parseList(this.settings.noteExcludes);
        if (excludes.some((fragment) => file.path.includes(fragment))) return false;
        if (/^[A-Z][A-Z0-9_-]*$/.test(file.basename)) return false;
        if (file.basename.includes("__")) return false;
        if (/\/(artifacts|fetched|artefacts|dist|build|out)\//i.test(`/${file.path}/`)) return false;
        if (/_upload_|_push_\d|\.before_|\.backup-|\.final\./i.test(file.basename)) return false;
        return true;
      }
      /**
       * Images for the visual card, read from the vault's own files.
       *
       * Deliberately NOT "every image in the vault": a working vault is mostly
       * screenshots, and 415 of them (measured here) would make a wall of grey UI
       * captures rather than something worth looking at. So this reads a folder the
       * user nominates, and until they nominate one it shows nothing and says why.
       *
       * No bundled or remote images — the package is main.js + manifest + styles.css,
       * and "never connects" is the plugin's core promise. The pictures are yours.
       */
      galleryImages() {
        const folder = this.normalize(this.settings.galleryFolder || "");
        const root = this.normalize(this.settings.workRoot || "");
        const all = this.app.vault.getFiles ? this.app.vault.getFiles() : [];
        const allImages = all.filter((file) => IMAGE_EXT.test(file.name || ""));
        const scopedImages = allImages.filter((file) => !root || this.in(file.path, root));
        if (!folder) {
          return { configured: false, folder: "", items: [], total: scopedImages.length };
        }
        const items = allImages.filter((file) => this.in(file.path, folder)).sort((a, b) => b.stat.mtime - a.stat.mtime || a.path.localeCompare(b.path)).map((file) => ({
          name: file.basename || file.name,
          path: file.path,
          mtime: file.stat.mtime,
          idle: daysBetween(file.stat.mtime, Date.now())
        }));
        return { configured: true, folder, items, total: scopedImages.length };
      }
      /** Language mix across fenced code blocks, plus the notes that carry them. */
      codeProfile(entries) {
        const langCount = /* @__PURE__ */ new Map();
        const notes = [];
        entries.forEach(({ file, langs }) => {
          langs.forEach(({ name, count }) => langCount.set(name, (langCount.get(name) || 0) + count));
          if (langs.length) notes.push({ file, langs: langs.map((item) => item.name) });
        });
        const languages = topEntries(langCount, 7);
        const total = sumValues(langCount) || 1;
        const recent = notes.filter(({ file }) => this.isHumanNote(file)).sort((a, b) => b.file.stat.mtime - a.file.stat.mtime).slice(0, 5).map(({ file, langs }) => ({
          title: file.basename,
          path: file.path,
          langs: langs.slice(0, 3),
          idle: daysBetween(file.stat.mtime, Date.now())
        }));
        const recentWindow = Date.now() - 7 * 864e5;
        const fresh = /* @__PURE__ */ new Map();
        entries.forEach(({ file, langs }) => {
          if (file.stat.mtime < recentWindow) return;
          langs.forEach(({ name, count }) => fresh.set(name, (fresh.get(name) || 0) + count));
        });
        return { languages, total, recent, blocks: total, fresh: topEntries(fresh, 5) };
      }
      /**
       * Concept debt: wiki links pointing at notes that do not exist.
       * In a study vault these are the concepts you referenced but never wrote up —
       * the strongest single signal of what to learn next.
       */
      conceptDebt(linkEntries, files) {
        const existing = /* @__PURE__ */ new Set();
        files.forEach((file) => {
          existing.add(file.basename.toLowerCase());
          existing.add(file.path.replace(/\.md$/, "").toLowerCase());
        });
        (this.app.vault.getFiles ? this.app.vault.getFiles() : []).forEach((file) => {
          existing.add(file.name.toLowerCase());
          existing.add(file.path.toLowerCase());
        });
        const missing = /* @__PURE__ */ new Map();
        linkEntries.forEach(({ file, links }) => {
          links.forEach((raw) => {
            const target = raw.trim();
            const key = target.toLowerCase();
            if (existing.has(key) || existing.has(`${key}.md`)) return;
            if (!isConceptName(target)) return;
            if (!missing.has(key)) missing.set(key, { name: target, count: 0, sources: [] });
            const entry = missing.get(key);
            entry.count += 1;
            if (entry.sources.length < 3) entry.sources.push({ title: file.basename, path: file.path });
          });
        });
        const items = [...missing.values()].filter((item) => item.count >= 2).sort((a, b) => b.count - a.count);
        return { items: items.slice(0, 12), total: items.length };
      }
      /**
       * Review queue: notes not touched for a while, oldest first.
       * A poor man's spaced repetition that needs no extra metadata.
       */
      reviewQueue(files) {
        const min = Number(this.settings.reviewMinDays || 14);
        const now = Date.now();
        const items = files.filter((file) => this.isHumanNote(file)).map((file) => ({
          title: file.basename,
          path: file.path,
          bucket: file.path.split("/").slice(-2, -1)[0] || "",
          idle: daysBetween(file.stat.mtime, now)
        })).filter((item) => item.idle >= min).sort((a, b) => b.idle - a.idle);
        return { items: items.slice(0, 10), total: items.length, min };
      }
      /**
       * The arsenal: reusable capabilities this vault has accumulated.
       *
       * Three kinds, deliberately kept separate because they answer different
       * questions:
       *   skills     — packaged procedures (a SKILL.md folder). "What can I ask for
       *                by name?" A skill carrying a LESSONS.md is flagged: that file
       *                is the non-revertible sediment, worth more than the procedure.
       *   templates  — reusable document shells. "What do I not have to write again?"
       *   playbooks  — SOPs and workflow notes. "How did we decide to do this?"
       *
       * Skills live outside the vault's note tree (an agent config folder), so they
       * are read through the vault adapter rather than the markdown index — and the
       * folder is a setting, never a hardcoded path.
       */
      arsenal(files, skills = []) {
        const templates = this.scanAssetFolder(files, this.settings.templateFolder, "template");
        const playbooks = this.scanPlaybooks(files);
        return {
          skills,
          templates,
          playbooks,
          total: skills.length + templates.length + playbooks.length,
          withLessons: skills.filter((item) => item.lessons).length
        };
      }
      /**
       * Packaged skills. Each is a folder holding SKILL.md, whose frontmatter
       * `description` is the one-line summary.
       *
       * These live in dot-folders (`.claude/skills/…`), which Obsidian deliberately
       * excludes from its file index — `getAbstractFileByPath` returns null for them.
       * So this reads through the vault *adapter*, which does see them. That means
       * real IO, so it is cached by folder mtime and only ever reads the first 2 KB of
       * each SKILL.md: enough for frontmatter, and it keeps a folder of long
       * procedure documents from costing anything noticeable.
       *
       * The results are async, unlike every other scanner here, so `arsenal()` is
       * given the already-loaded list rather than fetching it itself.
       */
      async loadSkills() {
        var _a, _b;
        const adapter = (_b = (_a = this.app) == null ? void 0 : _a.vault) == null ? void 0 : _b.adapter;
        if (!adapter || typeof adapter.list !== "function") return [];
        const roots = parseList(this.settings.skillFolders);
        const signature = roots.join("|");
        const fresh = this.skillCache && this.skillCache.signature === signature && Date.now() - this.skillCache.at < SKILL_CACHE_MS;
        if (fresh) return this.skillCache.items;
        const out = [];
        const seen = /* @__PURE__ */ new Set();
        for (const root of roots) {
          const base = this.normalize(root);
          let listing;
          try {
            listing = await adapter.list(base);
          } catch (e) {
            continue;
          }
          for (const dir of listing.folders || []) {
            const name = dir.split("/").pop();
            const key = `${base}::${name}`;
            if (seen.has(key)) continue;
            let inner;
            try {
              inner = await adapter.list(dir);
            } catch (e) {
              continue;
            }
            const manifest = (inner.files || []).find((file) => file.endsWith("/SKILL.md"));
            if (!manifest) continue;
            seen.add(key);
            const lessons = (inner.files || []).find((file) => file.endsWith("/LESSONS.md")) || "";
            let description = "";
            let mtime = 0;
            try {
              const stat = await adapter.stat(manifest);
              mtime = stat && stat.mtime || 0;
              const head = (await adapter.read(manifest)).slice(0, 2048);
              description = parseSkillDescription(head);
            } catch (e) {
            }
            out.push({
              name,
              path: manifest,
              scope: base,
              description,
              lessons,
              mtime
            });
          }
        }
        const items = out.sort((a, b) => b.mtime - a.mtime);
        this.skillCache = { signature, items, at: Date.now() };
        return items;
      }
      /**
       * Drop the skill listing so the next scan re-reads it.
       *
       * Also invalidates the model cache: skills are only read while building a
       * model, so leaving that cached would serve the old listing anyway and make
       * this call silently do nothing.
       */
      forgetSkills() {
        this.skillCache = null;
        this.invalidate();
      }
      /** Reusable document shells from a templates folder. */
      scanAssetFolder(files, folder, kind) {
        const root = this.normalize(folder || "");
        if (!root) return [];
        return files.filter((file) => this.in(file.path, root)).filter((file) => this.isHumanNote(file)).map((file) => ({
          name: file.basename,
          path: file.path,
          kind,
          mtime: file.stat.mtime
        })).sort((a, b) => b.mtime - a.mtime);
      }
      /**
       * SOPs and workflow notes, found by name rather than location: a vault records
       * "how we decided to do this" wherever the work happened, not in one folder.
       */
      scanPlaybooks(files) {
        return files.filter((file) => /SOP|流程|工作流|状态机|checklist|清单|规范/i.test(file.basename)).filter((file) => this.isHumanNote(file)).map((file) => ({
          name: file.basename,
          path: file.path,
          kind: "playbook",
          mtime: file.stat.mtime
        })).sort((a, b) => b.mtime - a.mtime).slice(0, 12);
      }
      /**
       * Enabled community plugins, as a zero-setup inventory of the user's stack.
       * Reads the in-memory plugin registry rather than touching .obsidian on disk,
       * because hardcoding the config directory path is a review rejection.
       */
      installedPlugins() {
        const registry = this.app && this.app.plugins;
        if (!registry) return [];
        const manifests = registry.manifests || {};
        const enabled = registry.enabledPlugins;
        const ids = enabled && typeof enabled.has === "function" ? [...enabled] : Object.keys(manifests);
        return ids.filter((id) => id !== "desk").map((id) => manifests[id] && manifests[id].name || id).sort((a, b) => a.localeCompare(b));
      }
      /** Recently touched project/research notes, for "where was I". */
      recentWork(files) {
        const roots = [this.settings.projectFolder, this.settings.activeFolder, this.settings.researchFolder].map((folder) => this.normalize(folder || "")).filter(Boolean);
        return files.filter((file) => roots.some((root) => this.in(file.path, root))).filter((file) => this.isHumanNote(file)).sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 6).map((file) => ({
          title: file.basename,
          path: file.path,
          bucket: file.path.split("/")[1] || "",
          idle: daysBetween(file.stat.mtime, Date.now())
        }));
      }
    };
    module2.exports = {
      DeskData,
      extractLangs,
      extractLinks,
      isConceptName,
      isGeneratedReport,
      readBlockerStatus,
      LANG_ALIAS,
      LANG_IGNORE
    };
  }
});

// src/item-state.js
var require_item_state = __commonJS({
  "src/item-state.js"(exports2, module2) {
    "use strict";
    var DAY_MS = 24 * 60 * 60 * 1e3;
    function itemKey(cardId, id) {
      return `${String(cardId || "").trim()}:${String(id || "").trim()}`;
    }
    function itemSignature(parts) {
      const values = Array.isArray(parts) ? parts : [parts];
      return values.map((value) => String(value != null ? value : "")).join("");
    }
    function normalizeItemStates(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return {};
      const out = {};
      Object.entries(value).forEach(([key, record]) => {
        if (!record || typeof record !== "object") return;
        if (record.state !== "closed" && record.state !== "archived") return;
        out[key] = {
          state: record.state,
          cardId: String(record.cardId || key.split(":")[0] || ""),
          cardLabel: String(record.cardLabel || ""),
          label: String(record.label || key),
          sourcePaths: Array.isArray(record.sourcePaths) ? record.sourcePaths.map(String) : [],
          signature: String(record.signature || ""),
          closedAt: String(record.closedAt || ""),
          archivedAt: String(record.archivedAt || ""),
          sourceUpdated: Boolean(record.sourceUpdated)
        };
      });
      return out;
    }
    function closeItem(states, item, now = /* @__PURE__ */ new Date()) {
      const next = normalizeItemStates(states);
      const key = item.key || itemKey(item.cardId, item.id);
      next[key] = {
        state: "closed",
        cardId: String(item.cardId || ""),
        cardLabel: String(item.cardLabel || ""),
        label: String(item.label || item.id || key),
        sourcePaths: Array.isArray(item.sourcePaths) ? item.sourcePaths.map(String) : [],
        signature: String(item.signature || ""),
        closedAt: now.toISOString(),
        archivedAt: "",
        sourceUpdated: false
      };
      return next;
    }
    function restoreItem(states, key) {
      const next = normalizeItemStates(states);
      delete next[key];
      return next;
    }
    function archiveItem(states, key, now = /* @__PURE__ */ new Date()) {
      const next = normalizeItemStates(states);
      if (!next[key]) return next;
      next[key] = { ...next[key], state: "archived", archivedAt: now.toISOString() };
      return next;
    }
    function restoreAll(states, state = "") {
      const next = normalizeItemStates(states);
      Object.keys(next).forEach((key) => {
        if (!state || next[key].state === state) delete next[key];
      });
      return next;
    }
    function archiveAll(states, now = /* @__PURE__ */ new Date()) {
      const next = normalizeItemStates(states);
      Object.keys(next).forEach((key) => {
        if (next[key].state === "closed") {
          next[key] = { ...next[key], state: "archived", archivedAt: now.toISOString() };
        }
      });
      return next;
    }
    function sweepExpired(states, now = /* @__PURE__ */ new Date(), days = 30) {
      const next = normalizeItemStates(states);
      const limit = Number(days);
      if (!Number.isFinite(limit) || limit <= 0) return { states: next, changed: false };
      let changed = false;
      Object.keys(next).forEach((key) => {
        const record = next[key];
        if (record.state !== "closed") return;
        const closed = Date.parse(record.closedAt);
        if (!Number.isFinite(closed) || now.getTime() - closed < limit * DAY_MS) return;
        next[key] = { ...record, state: "archived", archivedAt: now.toISOString() };
        changed = true;
      });
      return { states: next, changed };
    }
    function itemVisibility(states, item) {
      const normalized = normalizeItemStates(states);
      const key = item.key || itemKey(item.cardId, item.id);
      const record = normalized[key];
      if (!record) return { hidden: false, key, record: null, changed: false };
      const changed = Boolean(record.signature && item.signature && record.signature !== item.signature);
      if (record.state === "closed" && changed) {
        return { hidden: false, key, record, changed: true };
      }
      return { hidden: true, key, record, changed };
    }
    function counts(states) {
      const out = { closed: 0, archived: 0, total: 0 };
      Object.values(normalizeItemStates(states)).forEach((record) => {
        out[record.state] += 1;
        out.total += 1;
      });
      return out;
    }
    module2.exports = {
      DAY_MS,
      itemKey,
      itemSignature,
      normalizeItemStates,
      closeItem,
      restoreItem,
      archiveItem,
      restoreAll,
      archiveAll,
      sweepExpired,
      itemVisibility,
      counts
    };
  }
});

// src/cards/core.js
var require_core = __commonJS({
  "src/cards/core.js"(exports2, module2) {
    "use strict";
    var ui = require_ui();
    var { el, div, span, button } = require_dom();
    var { dateKey, ageLabel, inFolder } = require_util();
    var { sortTasks } = require_tasks();
    var { itemSignature } = require_item_state();
    var TASK_SCOPES = [
      { key: "mine", label: "\u6211\u7684" },
      { key: "waiting", label: "\u7B49\u4EBA" },
      { key: "due", label: "\u5230\u671F" },
      { key: "active", label: "\u8FDB\u884C\u4E2D" },
      { key: "all", label: "\u5E38\u7528" },
      { key: "raw", label: "\u5168\u90E8" }
    ];
    function taskSource(task) {
      const name = task.basename || "";
      const folder = task.path.split("/").slice(-2, -1)[0] || "";
      const uninformative = /^(STATE|STATUS|README|INDEX|MANIFEST|CHECKPOINT)$/i.test(name) || /^\d{4}-\d{2}-\d{2}/.test(name);
      return uninformative && folder ? folder : name;
    }
    function taskMeta(task, today) {
      const due = task.due || task.scheduled;
      const overdue = due && due < today;
      const isToday = due === today;
      const parts = [];
      if (due) {
        parts.push(el("em", {
          cls: overdue ? "is-overdue" : isToday ? "is-today" : "",
          text: overdue ? `\u903E\u671F ${due}` : isToday ? "\u4ECA\u5929" : due
        }));
      }
      if (task.owner === "other") {
        parts.push(el("em", { cls: "is-waiting", text: `\u7B49 ${task.who || "\u4ED6\u4EBA"}` }));
      }
      const source = taskSource(task);
      if (source) parts.push(span({ cls: "desk-task-src", text: source }));
      return parts.flatMap((node, index) => index ? [span({ cls: "desk-sep", text: "\xB7" }), node] : [node]);
    }
    function renderTaskList(ctx) {
      const { model, settings, view } = ctx;
      const today = dateKey(/* @__PURE__ */ new Date());
      const limit = Number(settings.taskLimit || 12);
      const scope = view.taskScope;
      let tasks = model.openTasks;
      if (scope === "raw") {
        tasks = sortTasks(model.tasks.filter((task) => !task.done && !task.cancelled), today);
      } else if (scope === "mine") {
        tasks = tasks.filter((task) => task.owner === "me");
      } else if (scope === "waiting") {
        tasks = tasks.filter((task) => task.owner === "other");
      } else if (scope === "due") {
        tasks = tasks.filter((task) => {
          const due = task.due || task.scheduled;
          return due && due <= today;
        });
      } else if (scope === "active") {
        tasks = tasks.filter((task) => inFolder(task.path, settings.activeFolder, view.normalize));
      }
      const shown = tasks.slice(0, limit);
      const parts = [];
      if (model.hiddenCount || model.cappedCount) {
        const bits = [];
        if (model.hiddenCount) bits.push(`\u5DF2\u8FC7\u6EE4 ${model.hiddenCount} \u6761\u9648\u65E7/\u975E\u4EFB\u52A1\u590D\u9009\u6846`);
        if (model.cappedCount) bits.push(`${model.cappedCount} \u6761\u6765\u81EA\u540C\u4E00\u7B14\u8BB0\u672A\u5C55\u5F00`);
        parts.push(ui.note(
          `${bits.join(" \xB7 ")}\uFF08\u5171 ${model.allOpenCount} \u6761\u672A\u5B8C\u6210\uFF09`,
          { label: "\u89C4\u5219", onClick: () => view.explainFilters() }
        ));
      }
      if (!shown.length) {
        parts.push(ui.empty(
          "\u8FD9\u4E2A\u8303\u56F4\u91CC\u6CA1\u6709\u5F85\u529E\u3002",
          model.hiddenCount ? "\u653E\u5BBD\u8BBE\u7F6E\u91CC\u7684\u300C\u5F85\u529E\u6700\u5927\u5929\u6570\u300D\u53EF\u4EE5\u770B\u5230\u66F4\u591A\u3002" : "\u8981\u4E48\u771F\u505A\u5B8C\u4E86\uFF0C\u8981\u4E48\u8BE5\u53BB\u7B14\u8BB0\u91CC\u8BB0\u4E00\u6761\u3002"
        ));
        return parts;
      }
      parts.push(div({ cls: "desk-task-list desk-fill" }, shown.map((task) => ui.checkRow({
        text: task.text,
        done: task.done,
        meta: taskMeta(task, today),
        tone: [`desk-p-${task.priority}`, task.owner === "other" ? "is-waiting" : ""],
        onToggle: () => view.toggleTask(task),
        onOpen: () => view.openFile(task.path, task.line)
      }))));
      if (tasks.length > limit) {
        parts.push(ui.note(`\u8FD8\u6709 ${tasks.length - limit} \u6761\u672A\u663E\u793A`));
      }
      return parts;
    }
    var todayCard = {
      id: "today",
      label: "\u5F85\u529E",
      kicker: "TODAY",
      span: "half",
      desc: "\u6309\u5F52\u5C5E\u5206\u6D41\u7684\u5F85\u529E\u6E05\u5355\uFF0C\u53EF\u76F4\u63A5\u52FE\u9009",
      templates: ["general", "study"],
      needs: [],
      render(ctx) {
        const { model, view } = ctx;
        const options = TASK_SCOPES.map((item) => ({
          key: item.key,
          label: item.key === "mine" && model.mineCount ? `\u6211\u7684 ${model.mineCount}` : item.key === "waiting" && model.waitingCount ? `\u7B49\u4EBA ${model.waitingCount}` : item.label
        }));
        return [
          div({ cls: "desk-card-head" }, [
            div({}, [span({ text: "TODAY" }), el("h2", { text: "\u5F85\u529E" })]),
            ui.segmented(options, view.taskScope, (key) => view.setTaskScope(key))
          ]),
          ...renderTaskList(ctx)
        ];
      }
    };
    var calendarCard = {
      id: "calendar",
      label: "\u672C\u6708\u53F0\u5386",
      kicker: "CALENDAR",
      span: "half",
      // The month grid is fixed, but the selected-day detail list below it is not,
      // so this card can still use spare height productively.
      grow: "fill",
      desc: "\u6539\u52A8\u3001\u5230\u671F\u3001\u65E5\u62A5\u7684\u6708\u89C6\u56FE\uFF0C\u70B9\u67D0\u5929\u770B\u5F53\u5929\u53D1\u751F\u4E86\u4EC0\u4E48",
      templates: ["general", "study"],
      needs: ["streak"],
      render(ctx) {
        const { model, view } = ctx;
        const now = /* @__PURE__ */ new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        const mondayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
        const dueByDay = /* @__PURE__ */ new Map();
        model.openTasks.forEach((task) => {
          const due = task.due || task.scheduled;
          if (due) dueByDay.set(due, (dueByDay.get(due) || 0) + 1);
        });
        const touchedByDay = /* @__PURE__ */ new Map();
        model.files.forEach((file) => {
          const key = dateKey(new Date(file.stat.mtime));
          touchedByDay.set(key, (touchedByDay.get(key) || 0) + 1);
        });
        const reportDays = new Set((model.streak || []).filter((day) => day.report).map((day) => day.key));
        const cells = [];
        for (let index = 0; index < mondayOffset; index += 1) cells.push(span({ cls: "is-blank" }));
        for (let day = 1; day <= days; day += 1) {
          const key = dateKey(new Date(year, month, day));
          const due = dueByDay.get(key) || 0;
          const touched = touchedByDay.get(key) || 0;
          cells.push(button({
            cls: [
              key === dateKey(now) ? "is-today" : "",
              key === view.selectedDate ? "is-selected" : "",
              touched ? "has-note" : "",
              due ? "has-due" : "",
              reportDays.has(key) ? "has-report" : ""
            ],
            title: `${touched} \u7BC7\u6539\u52A8${due ? ` \xB7 ${due} \u6761\u5230\u671F` : ""}`,
            onClick: () => view.selectDate(key)
          }, [
            el("b", { text: String(day) }),
            due ? el("i", { text: String(due) }) : touched ? el("u") : null
          ]));
        }
        while (cells.length % 7 !== 0) cells.push(span({ cls: "is-blank" }));
        return [
          ui.cardHead("CALENDAR", `${month + 1}\u6708`, [
            { label: "\u56DE\u5230\u4ECA\u5929", onClick: () => view.selectDate(dateKey(/* @__PURE__ */ new Date())) }
          ]),
          div({ cls: "desk-weekdays" }, ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u65E5"].map((text) => span({ text }))),
          div({ cls: "desk-month" }, cells),
          dayDetail(ctx, view.selectedDate)
        ];
      }
    };
    function dayDetail(ctx, key) {
      const { model, view } = ctx;
      const display = /* @__PURE__ */ new Date(`${key}T12:00:00`);
      const label = `${display.getMonth() + 1}\u6708${display.getDate()}\u65E5`;
      const touched = model.files.filter((file) => dateKey(new Date(file.stat.mtime)) === key).sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 6);
      const due = model.openTasks.filter((task) => (task.due || task.scheduled) === key);
      const rows = [
        ...due.map((task) => ui.listRow({
          title: task.text,
          meta: `\u5230\u671F \xB7 ${task.basename}`,
          icon: "",
          dismiss: {
            cardId: "calendar-day",
            cardLabel: "\u672C\u6708\u53F0\u5386",
            id: `${key}:${task.path}:${task.line}`,
            label: task.text,
            sourcePaths: [task.path],
            signature: itemSignature([task.text, task.due, task.scheduled])
          },
          view,
          tone: "is-due",
          onClick: () => view.openFile(task.path, task.line)
        })),
        ...touched.map((file) => ui.listRow({
          title: file.basename,
          meta: `${file.path.split("/")[1] || ""} \xB7 ${new Date(file.stat.mtime).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`,
          icon: "",
          dismiss: {
            cardId: "calendar-day",
            cardLabel: "\u672C\u6708\u53F0\u5386",
            id: `${key}:${file.path}`,
            label: file.basename,
            sourcePaths: [file.path],
            signature: itemSignature([file.path, file.stat.mtime])
          },
          view,
          onClick: () => view.openFile(file.path)
        }))
      ];
      return div({ cls: "desk-day-detail" }, [
        div({ cls: "desk-day-head" }, [
          div({}, [span({ text: "DAY" }), el("strong", { text: label })]),
          button({ cls: "desk-head-btn", text: "\u6253\u5F00\u5F53\u5929\u76EE\u5F55", onClick: () => view.plugin.revealDay(key) })
        ]),
        ui.rowList(rows, ui.empty("\u8FD9\u5929\u6CA1\u6709\u6539\u52A8\uFF0C\u4E5F\u6CA1\u6709\u5230\u671F\u4E8B\u9879\u3002"), "desk-day-rows")
      ]);
    }
    var heatCard = {
      id: "heat",
      label: "\u4EA7\u51FA\u8282\u594F",
      kicker: "OUTPUT",
      span: "full",
      grow: "compact",
      desc: "\u70ED\u529B\u56FE + \u4EA7\u51FA\u6307\u6807 + \u76EE\u5F55\u5206\u5E03",
      templates: ["general", "study"],
      needs: ["heat"],
      render(ctx) {
        const { model, view } = ctx;
        const heat = model.heat;
        const level = (count) => {
          if (count < 0) return "is-future";
          if (!count) return "is-l0";
          const step = Math.max(1, Math.ceil(heat.peak / 4));
          return `is-l${Math.min(4, Math.ceil(count / step))}`;
        };
        const grid = div({ cls: "desk-heat-grid" }, heat.columns.map((column) => div(
          { cls: "desk-heat-col" },
          column.map((cell) => span({
            cls: ["desk-heat-cell", level(cell.count)],
            title: `${cell.key}${cell.count >= 0 ? ` \xB7 ${cell.count} \u7BC7` : ""}`,
            onClick: () => {
              if (cell.count >= 0) view.selectDate(cell.key);
            }
          }))
        )));
        const avg = heat.activeDays ? (heat.total / heat.activeDays).toFixed(1) : "0";
        return [
          ui.cardHead("OUTPUT", "\u4EA7\u51FA\u8282\u594F"),
          ui.metrics([
            { value: heat.total, label: "\u65B0\u5EFA\u7B14\u8BB0" },
            { value: heat.activeDays, label: "\u6709\u4EA7\u51FA\u7684\u5929" },
            { value: avg, label: "\u6D3B\u8DC3\u65E5\u5747" },
            { value: heat.peak, label: "\u5355\u65E5\u5CF0\u503C" }
          ]),
          div({ cls: "desk-heat-scroll" }, [grid]),
          div({ cls: "desk-heat-legend" }, [
            span({ text: "\u5C11" }),
            ...["is-l0", "is-l1", "is-l2", "is-l3", "is-l4"].map((cls) => el("i", { cls })),
            span({ text: "\u591A" }),
            el("em", { text: `\u8FD1 ${heat.weeks} \u5468 \xB7 \u6309\u7B14\u8BB0\u5F52\u5C5E\u65E5` })
          ]),
          ui.subSection("\u8FD1\u671F\u6539\u52A8\u5206\u5E03", ui.barList(
            heat.folders.map((folder) => ({ label: folder.name, value: folder.count })),
            "\u8FD8\u6CA1\u6709\u8DB3\u591F\u7684\u6539\u52A8\u6570\u636E\u3002"
          ))
        ];
      }
    };
    var digestCard = {
      id: "digest",
      label: "\u5F85\u6D88\u5316 / \u963B\u585E",
      kicker: "TO DIGEST",
      span: "half",
      desc: "\u963B\u585E\u9879\u3001\u6536\u4EF6\u7BB1\u672A\u5F52\u7C7B\u3001\u6700\u8FD1\u52A8\u8FC7\u7684\u7B14\u8BB0",
      templates: ["general"],
      needs: ["digest", "blockers", "recent"],
      render(ctx) {
        const { model, view, settings } = ctx;
        const blockers = model.blockers || [];
        const fresh = blockers.filter((item) => !item.stale);
        const stale = blockers.filter((item) => item.stale);
        const blockerRow = (item) => ui.blockerRow({
          title: item.title,
          status: item.status,
          state: item.state,
          age: ageLabel(item.idle),
          stale: item.stale,
          onResolve: () => view.resolveBlocker(item, "resolved"),
          onObsolete: () => view.resolveBlocker(item, "obsolete"),
          onOpen: () => view.openFile(item.path)
        });
        const rows = [
          ...fresh.slice(0, 5).map(blockerRow),
          ...stale.map(blockerRow),
          ...(model.digest || []).map((item) => ui.listRow({
            title: item.title,
            meta: `${item.source} \xB7 ${ageLabel(item.idle)}`,
            icon: "",
            dismiss: {
              cardId: "digest",
              cardLabel: "\u5F85\u6D88\u5316 / \u963B\u585E",
              id: item.path,
              label: item.title,
              sourcePaths: [item.path],
              signature: itemSignature([item.path, item.title, item.source])
            },
            view,
            onClick: () => view.openFile(item.path)
          }))
        ];
        const recent = (model.recent || []).map((item) => ui.listRow({
          title: item.title,
          meta: `${item.bucket} \xB7 ${ageLabel(item.idle)}`,
          icon: "",
          dismiss: {
            cardId: "digest-recent",
            cardLabel: "\u6700\u8FD1\u52A8\u8FC7",
            id: item.path,
            label: item.title,
            sourcePaths: [item.path],
            signature: itemSignature([item.path, item.title, item.bucket])
          },
          view,
          onClick: () => view.openFile(item.path)
        }));
        return [
          ui.cardHead("TO DIGEST", "\u5F85\u6D88\u5316 / \u963B\u585E", [
            stale.length ? ui.countChip(`${stale.length} \u9879\u8D85 30 \u5929`) : null,
            { label: "\u6253\u5F00\u6536\u4EF6\u7BB1", onClick: () => view.plugin.revealFolder(settings.inboxFolder) }
          ]),
          ui.rowList(rows, ui.empty("\u6536\u4EF6\u7BB1\u548C\u963B\u585E\u533A\u90FD\u6E05\u7A7A\u4E86\u3002"), "desk-digest-list"),
          // A secondary list keeps its content height; the primary list above takes
          // the card's spare space.
          ui.subSection("RECENT \xB7 \u6700\u8FD1\u52A8\u8FC7", ui.rowList(recent, ui.empty("\u6CA1\u6709\u6700\u8FD1\u6539\u52A8\u7684\u9879\u76EE\u7B14\u8BB0\u3002"), "", { fill: false }))
        ];
      }
    };
    module2.exports = [todayCard, calendarCard, digestCard];
    module2.exports.heatCard = heatCard;
  }
});

// src/cards/work.js
var require_work = __commonJS({
  "src/cards/work.js"(exports2, module2) {
    "use strict";
    var ui = require_ui();
    var { el, div, span, button } = require_dom();
    var { dateKey, ageLabel } = require_util();
    var { itemSignature } = require_item_state();
    var activeCard = {
      id: "active",
      label: "\u8FDB\u884C\u4E2D\u7684\u7EBF",
      kicker: "IN FLIGHT",
      span: "half",
      desc: "\u8DE8\u5929\u672A\u95ED\u73AF\u7684\u5DE5\u4F5C\u7EBF\uFF0C\u505C\u6EDE\u4F1A\u6807\u7EA2\uFF1B\u76F4\u63A5\u8DF3\u5230\u8BE5\u7EBF\u7684 STATE.md",
      templates: ["general"],
      needs: ["active", "streak"],
      render(ctx) {
        const { model, view, settings, data } = ctx;
        const streams = model.active || [];
        let body;
        if (!streams.length) {
          body = data.folderExists(settings.activeFolder) ? ui.empty(`${settings.activeFolder} \u91CC\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u7EBF\u3002`, "\u8DE8\u5929\u6CA1\u505A\u5B8C\u7684\u5DE5\u4F5C\u653E\u8FDB\u6765\uFF0C\u5C31\u4E0D\u4F1A\u5FD8\u3002") : ui.missingFolder(settings.activeFolder, "\u8FDB\u884C\u4E2D");
        } else {
          body = ui.rowList(streams.map((stream) => ui.listRow({
            title: stream.name,
            meta: `${stream.notes} \u7BC7 \xB7 \u6700\u540E\u52A8\u4E8E ${stream.latest ? ageLabel(stream.idle) : "\u672A\u77E5"}${stream.statePath ? " \xB7 \u6709 STATE" : ""}`,
            icon: "",
            dismiss: {
              cardId: "active",
              cardLabel: "\u8FDB\u884C\u4E2D\u7684\u7EBF",
              id: stream.path,
              label: stream.name,
              sourcePaths: [stream.statePath || stream.newest && stream.newest.path || stream.path],
              signature: itemSignature([stream.path, stream.notes, stream.latest, stream.statePath])
            },
            view,
            tone: stream.stale ? "is-stale" : "",
            badge: stream.stale ? `\u505C\u6EDE ${stream.idle} \u5929` : "\u6D3B\u8DC3",
            // Prefer STATE.md: per the vault convention it is the canonical status
            // note, so opening it answers "where was I" directly.
            onClick: () => view.openFile(stream.statePath || stream.newest && stream.newest.path || stream.path)
          })), null, "desk-stream-list");
        }
        return [
          ui.cardHead("IN FLIGHT", "\u8FDB\u884C\u4E2D\u7684\u7EBF", [
            { label: "\u6253\u5F00\u76EE\u5F55", onClick: () => view.plugin.revealFolder(settings.activeFolder) }
          ]),
          body,
          ui.subSection("DAILY LOG \xB7 \u65E5\u62A5\u8FDE\u7EED\u6027", streakStrip(ctx))
        ];
      }
    };
    function streakStrip(ctx) {
      const { model, view } = ctx;
      const days = model.streak || [];
      if (!days.length) return ui.empty("\u6CA1\u6709\u914D\u7F6E\u65E5\u62A5\u76EE\u5F55\u3002");
      const today = dateKey(/* @__PURE__ */ new Date());
      const cells = days.map((day) => button({
        cls: [
          day.report ? "is-report" : day.has ? "is-note" : "is-missing",
          day.weekend ? "is-weekend" : "",
          day.key === today ? "is-today" : ""
        ],
        title: day.has ? `${day.key} \u5DF2\u5199` : `${day.key} \u7F3A\u65E5\u62A5`,
        onClick: () => day.path ? view.openFile(day.path) : view.plugin.revealDay(day.key)
      }, [el("b", { text: String(day.day) })]));
      const written = days.filter((day) => day.report).length;
      const missing = days.filter((day) => !day.has && !day.weekend).length;
      return div({}, [
        div({ cls: "desk-streak" }, cells),
        div({ cls: "desk-streak-note", text: `\u8FD1 ${days.length} \u5929\u5199\u4E86 ${written} \u4EFD\u65E5\u62A5${missing ? ` \xB7 \u6709 ${missing} \u4E2A\u5DE5\u4F5C\u65E5\u7A7A\u7740` : " \xB7 \u5DE5\u4F5C\u65E5\u6CA1\u6709\u7F3A\u53E3"}` })
      ]);
    }
    module2.exports = [activeCard];
  }
});

// src/cards/study.js
var require_study = __commonJS({
  "src/cards/study.js"(exports2, module2) {
    "use strict";
    var ui = require_ui();
    var { el, div, span } = require_dom();
    var { ageLabel } = require_util();
    var { itemSignature } = require_item_state();
    var codeCard = {
      id: "code",
      label: "\u4EE3\u7801\u4E0E\u6280\u672F\u6808",
      kicker: "CODE",
      span: "half",
      desc: "\u8BED\u8A00\u5206\u5E03 + \u6700\u8FD1 7 \u5929\u5728\u5199\u4EC0\u4E48 + \u5E26\u4EE3\u7801\u7684\u7B14\u8BB0",
      templates: ["study", "general"],
      needs: ["code"],
      render(ctx) {
        const { model, view } = ctx;
        const code = model.code;
        if (!code.languages.length) {
          return [
            ui.cardHead("CODE", "\u4EE3\u7801\u4E0E\u6280\u672F\u6808"),
            ui.empty("\u8FD8\u6CA1\u6709\u5E26\u8BED\u8A00\u6807\u8BB0\u7684\u4EE3\u7801\u5757\u3002", "\u5199\u7B14\u8BB0\u65F6\u7ED9\u56F4\u680F\u52A0\u4E0A\u8BED\u8A00\uFF08```python\uFF09\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002")
          ];
        }
        const recent = code.recent.map((item) => ui.listRow({
          title: item.title,
          meta: `${item.langs.join(" \xB7 ")} \xB7 ${ageLabel(item.idle)}`,
          icon: "",
          dismiss: {
            cardId: "code-recent",
            cardLabel: "\u6700\u8FD1\u4EE3\u7801\u7B14\u8BB0",
            id: item.path,
            label: item.title,
            sourcePaths: [item.path],
            signature: itemSignature([item.path, item.title, item.langs])
          },
          view,
          onClick: () => view.openFile(item.path)
        }));
        return [
          ui.cardHead("CODE", "\u4EE3\u7801\u4E0E\u6280\u672F\u6808", [ui.countChip(`${code.blocks} \u5757`)]),
          ui.barList(code.languages.map((lang) => ({ label: lang.name, value: lang.count })), "\u6682\u65E0\u8BED\u8A00\u6570\u636E"),
          // "What am I in right now" is a different question from "what have I used".
          code.fresh.length ? ui.subSection("\u8FD1 7 \u5929\u5728\u5199", ui.tags(code.fresh.map((lang) => `${lang.name} ${lang.count}`), "is-fresh")) : null,
          // This card's body is fixed-size bars, so the trailing list is the only
          // thing that can absorb spare height — it must fill.
          ui.subSection(
            "RECENT \xB7 \u6700\u8FD1\u5199\u8FC7\u4EE3\u7801\u7684\u7B14\u8BB0",
            ui.rowList(recent, ui.empty("\u6CA1\u6709\u6700\u8FD1\u7684\u4EE3\u7801\u7B14\u8BB0\u3002"))
          )
        ];
      }
    };
    var conceptCard = {
      id: "concepts",
      label: "\u6982\u5FF5\u503A",
      kicker: "DEBT",
      span: "half",
      desc: "\u4F60\u5F15\u7528\u8FC7\u4F46\u8FD8\u6CA1\u5199\u7684\u6982\u5FF5\uFF08\u672A\u89E3\u6790\u7684 [[\u94FE\u63A5]]\uFF09\uFF0C\u6309\u88AB\u5F15\u7528\u6B21\u6570\u6392\u5E8F",
      templates: ["study"],
      needs: ["concepts"],
      render(ctx) {
        const { model, view } = ctx;
        const concepts = model.concepts || { items: [], total: 0 };
        if (!concepts.items.length) {
          return [
            ui.cardHead("DEBT", "\u6982\u5FF5\u503A"),
            ui.empty("\u6CA1\u6709\u672A\u89E3\u6790\u7684\u94FE\u63A5\u3002", "\u5199\u7B14\u8BB0\u65F6\u7528 [[\u6982\u5FF5\u540D]] \u63D0\u5230\u8FD8\u6CA1\u5B66\u7684\u4E1C\u897F\uFF0C\u8FD9\u91CC\u5C31\u4F1A\u6392\u961F\u3002")
          ];
        }
        const rows = concepts.items.map((item) => ui.listRow({
          title: item.name,
          meta: `\u88AB ${item.count} \u5904\u5F15\u7528 \xB7 ${item.sources.map((source) => source.title).join("\u3001")}`,
          icon: String(item.count),
          tone: item.count >= 3 ? "is-hot" : "",
          badge: "\u65B0\u5EFA",
          dismiss: {
            cardId: "concepts",
            cardLabel: "\u6982\u5FF5\u503A",
            id: item.name,
            label: item.name,
            sourcePaths: item.sources.map((source) => source.path).filter(Boolean),
            signature: itemSignature([item.name, item.count, item.sources.map((source) => source.path)])
          },
          view,
          // Clicking creates the missing note: the point of the card is to pay the debt.
          onClick: () => view.createConceptNote(item.name, item.sources[0])
        }));
        return [
          ui.cardHead("DEBT", "\u6982\u5FF5\u503A", [ui.countChip(`${concepts.total} \u4E2A`)]),
          ui.note("\u8FD9\u4E9B\u662F\u4F60\u5728\u7B14\u8BB0\u91CC [[\u63D0\u5230]] \u8FC7\u3001\u4F46\u8FD8\u6CA1\u6709\u5BF9\u5E94\u7B14\u8BB0\u7684\u6982\u5FF5\u3002\u70B9\u4E00\u6761\u76F4\u63A5\u5EFA\u7B14\u8BB0\u3002"),
          ui.rowList(rows, ui.empty("\u6CA1\u6709\u672A\u89E3\u6790\u7684\u94FE\u63A5\u3002"), "desk-concept-list")
        ];
      }
    };
    var reviewCard = {
      id: "review",
      label: "\u590D\u4E60\u961F\u5217",
      kicker: "REVIEW",
      span: "half",
      desc: "\u5F88\u4E45\u6CA1\u78B0\u8FC7\u7684\u7B14\u8BB0\uFF0C\u6700\u4E45\u7684\u6392\u524D\u9762\uFF08\u65E0\u9700\u989D\u5916\u5143\u6570\u636E\u7684\u95F4\u9694\u91CD\u590D\uFF09",
      templates: ["study"],
      needs: ["review"],
      render(ctx) {
        const { model, view } = ctx;
        const review = model.review || { items: [], total: 0, min: 14 };
        const rows = review.items.map((item) => ui.listRow({
          title: item.title,
          meta: `${item.bucket ? `${item.bucket} \xB7 ` : ""}${ageLabel(item.idle)}`,
          icon: "",
          dismiss: {
            cardId: "review",
            cardLabel: "\u590D\u4E60\u961F\u5217",
            id: item.path,
            label: item.title,
            sourcePaths: [item.path],
            signature: itemSignature([item.path, item.title])
          },
          view,
          tone: item.idle >= review.min * 4 ? "is-cold" : "",
          onClick: () => view.openFile(item.path)
        }));
        return [
          ui.cardHead("REVIEW", "\u590D\u4E60\u961F\u5217", [ui.countChip(`${review.total} \u7BC7`)]),
          ui.note(`\u8D85\u8FC7 ${review.min} \u5929\u6CA1\u6253\u5F00\u8FC7\u7684\u7B14\u8BB0\u3002\u770B\u4E00\u773C\u8FD8\u8BB0\u5F97\u591A\u5C11\uFF0C\u6BD4\u91CD\u65B0\u5B66\u4FBF\u5B9C\u3002`),
          ui.rowList(rows, ui.empty("\u6240\u6709\u7B14\u8BB0\u90FD\u5728\u6700\u8FD1\u78B0\u8FC7\u3002"), "desk-review-list")
        ];
      }
    };
    module2.exports = [codeCard, conceptCard, reviewCard];
  }
});

// src/cards/notes.js
var require_notes = __commonJS({
  "src/cards/notes.js"(exports2, module2) {
    "use strict";
    var ui = require_ui();
    var { el, div, span, button } = require_dom();
    var { ageLabel, daysBetween } = require_util();
    var scratchCard = {
      id: "scratch",
      label: "\u4FBF\u7B7E",
      kicker: "SCRATCH",
      span: "half",
      grow: "fill",
      desc: "\u53EF\u4EE5\u76F4\u63A5\u6253\u5B57\u7684\u4FBF\u7B7E\u3002\u5185\u5BB9\u5B58\u5728\u63D2\u4EF6\u8BBE\u7F6E\u91CC\uFF0C\u91CD\u542F\u4E0D\u4E22",
      templates: ["general", "study"],
      needs: [],
      render(ctx) {
        const { view, settings } = ctx;
        const value = String(settings.scratchText || "");
        const area = el("textarea", {
          cls: "desk-scratch desk-fill",
          attr: {
            // No real names here: this plugin gets handed to other people, and a
            // stranger's dashboard should not name the author's colleagues.
            placeholder: "\u4ECA\u5929\u7684\u7126\u70B9\u3001\u4E34\u65F6\u60F3\u5230\u7684\u4E8B\u3001\u8981\u95EE\u8C01\u7684\u95EE\u9898\u2026\n\n\u8FD9\u5F20\u5361\u7684\u5185\u5BB9\u4E0D\u4F1A\u5199\u8FDB\u7B14\u8BB0\uFF0C\u53EA\u5B58\u5728\u63D2\u4EF6\u8BBE\u7F6E\u91CC\u3002",
            spellcheck: "false"
          }
        });
        area.value = value;
        area.addEventListener("input", () => view.queueScratchSave(area.value));
        area.addEventListener("blur", () => view.flushScratchSave(area.value));
        return [
          ui.cardHead("SCRATCH", "\u4FBF\u7B7E", [
            {
              label: "\u5B58\u4E3A\u7B14\u8BB0",
              onClick: () => view.scratchToNote(area.value)
            }
          ]),
          area,
          div({ cls: "desk-note" }, [
            span({ text: settings.scratchSavedAt ? `\u4E0A\u6B21\u4FDD\u5B58 ${settings.scratchSavedAt}` : "\u8FB9\u6253\u5B57\u8FB9\u5B58" })
          ])
        ];
      }
    };
    var pinnedCard = {
      id: "pinned",
      label: "\u9489\u4F4F\u7684\u7B14\u8BB0",
      kicker: "PINNED",
      span: "half",
      grow: "fill",
      desc: "\u628A\u4E00\u7BC7\u7B14\u8BB0\u9489\u5728\u5DE5\u4F5C\u53F0\u4E0A\uFF0C\u53EF\u76F4\u63A5\u7F16\u8F91\uFF0C\u6539\u52A8\u5199\u56DE\u539F\u6587\u4EF6",
      templates: ["general", "study"],
      needs: [],
      render(ctx) {
        const { view, settings, data } = ctx;
        const target = String(settings.pinnedPath || "").trim();
        if (!target) {
          return [
            ui.cardHead("PINNED", "\u9489\u4F4F\u7684\u7B14\u8BB0"),
            div({ cls: "desk-hint desk-fill" }, [
              span({ text: "\u8FD8\u6CA1\u6709\u9489\u4F4F\u4EFB\u4F55\u7B14\u8BB0\u3002\u5728\u8BBE\u7F6E\u91CC\u586B\u4E00\u4E2A\u8DEF\u5F84\uFF0C\u6216\u8005\u7528\u4E0B\u9762\u7684\u6309\u94AE\u65B0\u5EFA\u4E00\u7BC7\u3002" }),
              button({
                cls: "desk-head-btn",
                text: "\u65B0\u5EFA\u5E76\u9489\u4F4F",
                onClick: () => view.createPinnedNote()
              })
            ])
          ];
        }
        const file = data.app.vault.getAbstractFileByPath(data.normalize(target));
        if (!file || file.children) {
          return [
            ui.cardHead("PINNED", "\u9489\u4F4F\u7684\u7B14\u8BB0"),
            ui.empty(`\u627E\u4E0D\u5230\u8FD9\u7BC7\u7B14\u8BB0\uFF1A${target}`, "\u5728\u8BBE\u7F6E\u91CC\u6539\u8DEF\u5F84\uFF0C\u6216\u8005\u65B0\u5EFA\u4E00\u7BC7\u3002", { fill: true })
          ];
        }
        const content = view.pinnedCache;
        if (content === null || content === void 0) {
          return [ui.cardHead("PINNED", "\u9489\u4F4F\u7684\u7B14\u8BB0"), ui.empty("\u6B63\u5728\u8BFB\u2026", "", { fill: true })];
        }
        const area = el("textarea", {
          cls: "desk-scratch desk-fill",
          attr: { spellcheck: "false" }
        });
        area.value = content;
        area.addEventListener("input", () => view.queuePinnedSave(area.value));
        area.addEventListener("blur", () => view.flushPinnedSave(area.value));
        const idle = daysBetween(file.stat.mtime, Date.now());
        return [
          ui.cardHead("PINNED", file.basename, [
            ui.countChip(ageLabel(idle)),
            { label: "\u6253\u5F00", onClick: () => view.openFile(target) }
          ]),
          area,
          div({ cls: "desk-note" }, [span({ text: `\u76F4\u63A5\u7F16\u8F91\uFF0C\u6539\u52A8\u5199\u56DE ${target}` })])
        ];
      }
    };
    module2.exports = [scratchCard, pinnedCard];
  }
});

// src/cards/arsenal.js
var require_arsenal = __commonJS({
  "src/cards/arsenal.js"(exports2, module2) {
    "use strict";
    var ui = require_ui();
    var { el, div, span } = require_dom();
    var { ageLabel, daysBetween } = require_util();
    var { itemSignature } = require_item_state();
    var GROUPS = [
      { key: "skills", label: "\u80FD\u529B", hint: "\u6210\u7CFB\u7EDF\u7684 skill\uFF0C\u53EF\u76F4\u63A5\u6309\u540D\u8C03\u7528" },
      { key: "templates", label: "\u6A21\u677F", hint: "\u4E0D\u5FC5\u91CD\u5199\u7684\u6587\u6863\u9AA8\u67B6" },
      { key: "playbooks", label: "\u6253\u6CD5", hint: "SOP / \u6D41\u7A0B / \u6E05\u5355" }
    ];
    var arsenalCard = {
      id: "arsenal",
      label: "\u6B66\u5668\u5E93",
      kicker: "ARSENAL",
      span: "half",
      grow: "fill",
      desc: "\u5DF2\u6C89\u6DC0\u7684 skill\u3001\u6A21\u677F\u3001SOP\u3002\u56DE\u7B54\u300C\u6211\u6709\u4EC0\u4E48\u53EF\u4EE5\u590D\u7528\u300D\u800C\u4E0D\u662F\u300C\u6211\u5728\u505A\u4EC0\u4E48\u300D",
      templates: ["general", "study"],
      needs: ["arsenal"],
      render(ctx) {
        const { model, view, settings } = ctx;
        const arsenal = model.arsenal || { skills: [], templates: [], playbooks: [], total: 0, withLessons: 0 };
        const group = view.arsenalGroup || "skills";
        if (!arsenal.total) {
          return [
            ui.cardHead("ARSENAL", "\u6B66\u5668\u5E93"),
            div({ cls: "desk-hint desk-fill" }, [
              span({ text: "\u8FD8\u6CA1\u6709\u8BC6\u522B\u5230\u53EF\u590D\u7528\u8D44\u4EA7\u3002\u8FD9\u5F20\u5361\u627E\u4E09\u7C7B\u4E1C\u897F\uFF1A" }),
              el("ul", {}, GROUPS.map((item) => el("li", { text: `${item.label} \u2014\u2014 ${item.hint}` }))),
              span({
                cls: "desk-hint-alt",
                text: `\u80FD\u529B\u76EE\u5F55\u5728\u8BBE\u7F6E\u91CC\u914D\uFF08\u5F53\u524D\uFF1A${settings.skillFolders || "\u672A\u8BBE\u7F6E"}\uFF09\uFF0C\u6A21\u677F\u76EE\u5F55\u7528\u300C\u6A21\u677F\u76EE\u5F55\u300D\u90A3\u4E00\u9879\u3002`
              })
            ])
          ];
        }
        const counts = {
          skills: arsenal.skills.length,
          templates: arsenal.templates.length,
          playbooks: arsenal.playbooks.length
        };
        const options = GROUPS.filter((item) => counts[item.key] > 0).map((item) => ({ key: item.key, label: `${item.label} ${counts[item.key]}` }));
        const active = counts[group] ? group : options[0] && options[0].key || "skills";
        return [
          div({ cls: "desk-card-head" }, [
            div({}, [span({ text: "ARSENAL" }), el("h2", { text: "\u6B66\u5668\u5E93" })]),
            ui.segmented(options, active, (key) => view.setArsenalGroup(key))
          ]),
          arsenal.withLessons ? ui.note(`${arsenal.withLessons} \u4E2A\u80FD\u529B\u5E26 LESSONS \u2014\u2014 \u90A3\u662F\u4E0D\u56DE\u6EDA\u7684\u6C89\u6DC0\uFF0C\u6BD4\u6D41\u7A0B\u672C\u8EAB\u503C\u94B1`) : null,
          renderGroup(ctx, arsenal, active)
        ];
      }
    };
    function renderGroup(ctx, arsenal, group) {
      const { view } = ctx;
      const now = Date.now();
      if (group === "skills") {
        const rows2 = arsenal.skills.map((skill) => ui.listRow({
          title: skill.name,
          // Description first: the point of the card is recognising what a skill does
          // without opening it. Age is secondary here, unlike the activity cards.
          meta: skill.description || "(\u6CA1\u6709 description)",
          icon: skill.lessons ? "L" : "",
          tone: skill.lessons ? "is-hot" : "",
          // Scope disambiguates same-named skills, e.g. a directory-scoped variant.
          badge: shortScope(skill.scope),
          onClick: () => view.openArsenalItem(skill.lessons || skill.path)
        }));
        return ui.rowList(rows2, ui.empty("\u6CA1\u6709\u627E\u5230 SKILL.md\u3002", "", { fill: true }), "desk-arsenal-list");
      }
      const items = group === "templates" ? arsenal.templates : arsenal.playbooks;
      const rows = items.map((item) => ui.listRow({
        title: item.name,
        meta: `${item.path.split("/").slice(-2, -1)[0] || ""} \xB7 ${ageLabel(daysBetween(item.mtime, now))}`,
        icon: "",
        dismiss: {
          cardId: `arsenal-${group}`,
          cardLabel: group === "templates" ? "\u6A21\u677F" : "SOP / \u624B\u518C",
          id: item.path,
          label: item.name,
          sourcePaths: [item.path],
          signature: itemSignature([item.path, item.mtime])
        },
        view,
        onClick: () => view.openArsenalItem(item.path)
      }));
      return ui.rowList(rows, ui.empty("\u8FD9\u4E00\u7C7B\u8FD8\u6CA1\u6709\u5185\u5BB9\u3002", "", { fill: true }), "desk-arsenal-list");
    }
    function shortScope(scope) {
      const parts = String(scope || "").split("/").filter(Boolean);
      if (parts.length < 2) return "";
      const first = parts[0];
      return first === ".claude" ? "" : first;
    }
    module2.exports = [arsenalCard];
    module2.exports.GROUPS = GROUPS;
    module2.exports.shortScope = shortScope;
  }
});

// src/cards/gallery.js
var require_gallery = __commonJS({
  "src/cards/gallery.js"(exports2, module2) {
    "use strict";
    var ui = require_ui();
    var { el, div, span, button } = require_dom();
    var { ageLabel } = require_util();
    var RATIOS = {
      portrait: "3 / 4",
      square: "1 / 1",
      landscape: "4 / 3"
    };
    var SYSTEM_SEGMENTS = /* @__PURE__ */ new Set([".obsidian", ".git", ".trash", "node_modules"]);
    function isImage(name) {
      return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(name || "");
    }
    function suggestFolders(view, limit = 4, workRoot = "") {
      const vault = view && view.app && view.app.vault;
      const files = vault && typeof vault.getFiles === "function" ? vault.getFiles() : [];
      const root = String(workRoot || "").replace(/\/+$/, "");
      const counts = /* @__PURE__ */ new Map();
      files.forEach((file) => {
        if (!isImage(file.name)) return;
        if (root && !(file.path === root || file.path.startsWith(`${root}/`))) return;
        const folder = file.path.includes("/") ? file.path.replace(/\/[^/]*$/, "") : "";
        if (!folder) return;
        counts.set(folder, (counts.get(folder) || 0) + 1);
      });
      return [...counts.entries()].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([folder, count]) => ({ folder, count }));
    }
    function listVaultFolders(view) {
      const vault = view && view.app && view.app.vault;
      const loaded = vault && typeof vault.getAllLoadedFiles === "function" ? vault.getAllLoadedFiles() : [];
      return loaded.filter((file) => file && file.children && file.path).map((file) => String(file.path).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")).filter((folder) => folder && !folder.split("/").some((part) => SYSTEM_SEGMENTS.has(part))).sort((a, b) => a.localeCompare(b, "zh-CN"));
    }
    function folderLabel(folder, workRoot = "") {
      const root = String(workRoot || "").replace(/\/+$/, "");
      let shown = String(folder || "");
      if (root && shown.startsWith(`${root}/`)) shown = shown.slice(root.length + 1);
      const parts = shown.split("/").filter(Boolean);
      return parts.slice(-2).join("/") || shown;
    }
    function validateVaultFolderPath(input) {
      const raw = String(input || "").trim();
      if (!raw) return { ok: false, error: "\u8BF7\u8F93\u5165 Vault \u5185\u7684\u76EE\u5F55\u8DEF\u5F84" };
      if (/^[a-zA-Z]:[\\/]/.test(raw) || /^[\\/]/.test(raw) || /^[a-z]+:\/\//i.test(raw)) {
        return { ok: false, error: "\u8FD9\u91CC\u53EA\u652F\u6301\u5F53\u524D Vault \u5185\u7684\u76F8\u5BF9\u8DEF\u5F84" };
      }
      const parts = raw.replace(/\\/g, "/").split("/").filter(Boolean);
      if (!parts.length || parts.some((part) => part === "." || part === "..")) {
        return { ok: false, error: "\u76EE\u5F55\u8DEF\u5F84\u4E0D\u80FD\u5305\u542B . \u6216 .." };
      }
      if (parts.some((part) => SYSTEM_SEGMENTS.has(part))) {
        return { ok: false, error: "\u4E0D\u80FD\u628A\u753B\u9762\u5899\u653E\u8FDB\u63D2\u4EF6\u3001\u56DE\u6536\u7AD9\u6216\u4EE3\u7801\u4F9D\u8D56\u76EE\u5F55" };
      }
      return { ok: true, path: parts.join("/") };
    }
    function pickerControls(view, settings, gallery) {
      const folders = listVaultFolders(view);
      const selected = { value: "" };
      const select = el("select", { cls: "desk-gallery-select", ariaLabel: "\u9009\u62E9 Vault \u5185\u76EE\u5F55" });
      const placeholder = el("option", { text: "\u9009\u62E9 Vault \u5185\u4EFB\u610F\u76EE\u5F55\u2026", attr: { value: "" } });
      placeholder.disabled = true;
      placeholder.selected = true;
      select.appendChild(placeholder);
      folders.forEach((folder) => {
        const option = el("option", { text: folder, attr: { value: folder } });
        if (folder === gallery.folder) option.disabled = true;
        select.appendChild(option);
      });
      select.addEventListener("change", () => {
        selected.value = select.value;
      });
      const useButton = button({
        cls: "desk-head-btn",
        text: "\u4F7F\u7528\u6240\u9009\u76EE\u5F55",
        onClick: () => {
          if (!selected.value) {
            view.notice("\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u76EE\u5F55");
            return;
          }
          view.setGalleryFolder(selected.value);
        }
      });
      const defaultPath = settings.workRoot ? `${settings.workRoot}/\u753B\u9762\u5899` : "\u753B\u9762\u5899";
      const input = el("input", {
        cls: "desk-gallery-input",
        attr: { type: "text", value: defaultPath, placeholder: "\u4F8B\u5982\uFF1A\u56FE\u7247/\u753B\u9762\u5899" },
        ariaLabel: "\u65B0\u5EFA\u753B\u9762\u5899\u76EE\u5F55"
      });
      const createButton = button({
        cls: "desk-head-btn",
        text: "\u65B0\u5EFA\u5E76\u4F7F\u7528",
        onClick: () => view.createGalleryFolder(input.value)
      });
      return div({ cls: "desk-gallery-browser" }, [
        div({ cls: "desk-gallery-control" }, [select, useButton]),
        div({ cls: "desk-gallery-control" }, [input, createButton]),
        el("small", { text: "\u53EA\u4F7F\u7528\u5F53\u524D Vault \u5185\u7684\u76EE\u5F55\uFF1B\u53EF\u4EE5\u9009\u62E9\u7A7A\u76EE\u5F55\uFF0C\u4E5F\u53EF\u4EE5\u65B0\u5EFA\u591A\u7EA7\u76EE\u5F55\u3002" })
      ]);
    }
    var galleryCard = {
      id: "gallery",
      label: "\u753B\u9762\u5899",
      kicker: "VISUAL",
      span: "full",
      grow: "compact",
      desc: "\u628A Vault \u91CC\u7684\u56FE\u7247\u94FA\u6210\u4E00\u9762\u5899\u3002\u6307\u4E00\u4E2A\u76EE\u5F55\uFF0C\u70B9\u5F00\u5373\u5927\u56FE",
      templates: ["general", "study"],
      needs: ["gallery"],
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
          const picks = suggestFolders(view, 8, settings.workRoot).filter((pick) => pick.folder !== gallery.folder);
          return div({ cls: "desk-gallery-setup" }, [
            span({ text: "\u63A8\u8350\u76EE\u5F55\u6765\u81EA\u5F53\u524D Vault \u7684\u5B9E\u65F6\u7EDF\u8BA1\uFF0C\u53EA\u5217\u51FA\u81F3\u5C11\u6709 3 \u5F20\u56FE\u7247\u7684\u76EE\u5F55\u3002\u4E5F\u53EF\u4EE5\u9009\u62E9\u6216\u65B0\u5EFA\u4EFB\u610F Vault \u76EE\u5F55\u3002" }),
            picks.length ? div({ cls: "desk-gallery-picks" }, picks.map((pick) => button({
              cls: "desk-head-btn",
              text: `${folderLabel(pick.folder, settings.workRoot)}\u3000${pick.count} \u5F20`,
              title: pick.folder,
              onClick: () => view.setGalleryFolder(pick.folder)
            }))) : el("em", { text: "\u6CA1\u6709\u5176\u4ED6\u6210\u7EC4\u56FE\u7247\u76EE\u5F55\uFF0C\u53EF\u4EE5\u5728\u4E0B\u9762\u9009\u62E9\u7A7A\u76EE\u5F55\u6216\u65B0\u5EFA\u76EE\u5F55\u3002" }),
            pickerControls(view, settings, gallery)
          ]);
        };
        if (!gallery.configured) {
          return [
            ui.cardHead("VISUAL", "\u753B\u9762\u5899", [ui.countChip(`\u626B\u63CF\u8303\u56F4\u5185 ${gallery.total} \u5F20\u56FE`)]),
            renderPicker()
          ];
        }
        if (!gallery.items.length) {
          return [
            ui.cardHead("VISUAL", "\u753B\u9762\u5899", [
              { label: "\u6253\u5F00\u76EE\u5F55", onClick: () => view.plugin.revealFolder(gallery.folder) },
              { label: pickerOpen ? "\u53D6\u6D88" : "\u6362\u76EE\u5F55", onClick: togglePicker }
            ]),
            pickerOpen ? renderPicker() : ui.empty(`${gallery.folder} \u91CC\u8FD8\u6CA1\u6709\u56FE\u7247\u3002`, "\u53EF\u4EE5\u4FDD\u7559\u8FD9\u4E2A\u7A7A\u76EE\u5F55\u5E76\u5F80\u91CC\u9762\u653E\u56FE\uFF0C\u6216\u8005\u6362\u4E00\u4E2A\u76EE\u5F55\u3002")
          ];
        }
        const pageCount = Math.max(1, Math.ceil(gallery.items.length / limit));
        const pageIndex = Math.min(Number(view.galleryPage) || 0, pageCount - 1);
        const start = pageIndex * limit;
        const shown = gallery.items.slice(start, start + limit);
        if (pickerOpen && typeof view.clearGalleryRotation === "function") {
          view.clearGalleryRotation();
        } else if (typeof view.configureGalleryRotation === "function") {
          view.configureGalleryRotation(gallery.items.length, limit);
        }
        const tiles = shown.map((item) => {
          const src = typeof view.resolveImage === "function" ? view.resolveImage(item.path) : "";
          const media = src ? el("img", {
            cls: "desk-shot-img",
            attr: { src, alt: item.name, loading: "lazy", draggable: "false" }
          }) : div({ cls: "desk-shot-missing" }, [span({ text: "\u56FE\u7247\u5DF2\u79FB\u52A8" })]);
          return button({
            cls: "desk-shot",
            style: { "aspect-ratio": ratio },
            title: `${item.path}\u3000\xB7\u3000${ageLabel(item.idle)}`,
            onClick: () => view.openFile(item.path)
          }, [
            media,
            div({ cls: "desk-shot-cap" }, [
              span({ text: item.name }),
              el("small", { text: ageLabel(item.idle) })
            ])
          ]);
        });
        return [
          ui.cardHead("VISUAL", "\u753B\u9762\u5899", [
            ui.countChip(`${gallery.items.length} \u5F20`),
            { label: "\u6253\u5F00\u76EE\u5F55", onClick: () => view.plugin.revealFolder(gallery.folder) },
            { label: pickerOpen ? "\u53D6\u6D88" : "\u6362\u76EE\u5F55", onClick: togglePicker }
          ]),
          pickerOpen ? renderPicker() : null,
          div({ cls: "desk-shots", style: { "--desk-shot-min": shown.length <= 4 ? "200px" : "150px" } }, tiles),
          pageCount > 1 ? div({ cls: "desk-gallery-nav" }, [
            button({ cls: "desk-head-btn", text: "\u4E0A\u4E00\u7EC4", onClick: () => view.shiftGalleryPage(-1, pageCount) }),
            span({
              text: view.galleryPaused || settings.galleryAutoRotate === false ? `\u7B2C ${pageIndex + 1} / ${pageCount} \u7EC4 \xB7 \u5DF2\u6682\u505C` : `\u7B2C ${pageIndex + 1} / ${pageCount} \u7EC4 \xB7 \u6BCF ${Math.max(3, Math.min(60, Number(settings.galleryRotateSeconds) || 8))} \u79D2\u81EA\u52A8\u5207\u6362`
            }),
            button({
              cls: "desk-head-btn",
              text: view.galleryPaused || settings.galleryAutoRotate === false ? "\u7EE7\u7EED" : "\u6682\u505C",
              onClick: () => view.toggleGalleryRotation()
            }),
            button({ cls: "desk-head-btn", text: "\u4E0B\u4E00\u7EC4", onClick: () => view.shiftGalleryPage(1, pageCount) })
          ]) : el("p", { cls: "desk-hint-alt", text: "\u8FD9\u4E2A\u76EE\u5F55\u7684\u56FE\u7247\u5DF2\u5168\u90E8\u663E\u793A\u3002" })
        ];
      }
    };
    module2.exports = [galleryCard];
    module2.exports.galleryCard = galleryCard;
    module2.exports.suggestFolders = suggestFolders;
    module2.exports.listVaultFolders = listVaultFolders;
    module2.exports.folderLabel = folderLabel;
    module2.exports.validateVaultFolderPath = validateVaultFolderPath;
  }
});

// src/cards/index.js
var require_cards = __commonJS({
  "src/cards/index.js"(exports2, module2) {
    "use strict";
    var { register } = require_registry();
    var core = require_core();
    var MODULES = [
      core,
      require_work(),
      require_study(),
      require_notes(),
      require_arsenal()
    ];
    var gallery = require_gallery();
    var TRAILING = [core.heatCard, gallery.galleryCard];
    var registered = false;
    function registerAll() {
      if (registered) return;
      MODULES.forEach((cards) => {
        (Array.isArray(cards) ? cards : []).forEach((card) => register(card));
      });
      TRAILING.forEach((card) => register(card));
      registered = true;
    }
    module2.exports = { registerAll };
  }
});

// src/view.js
var require_view = __commonJS({
  "src/view.js"(exports2, module2) {
    "use strict";
    var { el, div, span, button, fill } = require_dom();
    var ui = require_ui();
    var { DeskData } = require_scan();
    var registry = require_registry();
    var { registerAll } = require_cards();
    var { dateKey, setFrontmatterField } = require_util();
    var { TASK_LINE } = require_tasks();
    var itemState = require_item_state();
    var { validateVaultFolderPath } = require_gallery();
    var VIEW_TYPE = "desk-home";
    var NARROW_ONE_COL = 620;
    var NARROW_TWO_COL = 900;
    function makeView({ ItemView, Notice, normalizePath }) {
      registerAll();
      return class DeskHomeView extends ItemView {
        constructor(leaf, plugin) {
          super(leaf);
          this.plugin = plugin;
          this.normalize = normalizePath;
          this.data = new DeskData(this.app, plugin.settings, { normalize: normalizePath });
          this.selectedDate = dateKey(/* @__PURE__ */ new Date());
          this.taskScope = "mine";
          this.pinnedCache = null;
          this.arsenalGroup = "skills";
          this.galleryPickerOpen = false;
          this.galleryPage = 0;
          this.galleryPaused = false;
          this.galleryTimer = 0;
          this.galleryTimerKey = "";
          this.itemVaultOpen = false;
          this.itemVaultTab = "closed";
          this.itemStateSaveTimer = 0;
          this.textPreview = null;
          this.rendering = false;
          this.pendingRender = false;
          this.suppressRefresh = false;
          this.scratchTimer = 0;
          this.pinnedTimer = 0;
          this.paneObserver = null;
          this.paneTimer = 0;
          this.lastCols = 0;
        }
        getViewType() {
          return VIEW_TYPE;
        }
        getDisplayText() {
          return "Desk";
        }
        getIcon() {
          return "layout-dashboard";
        }
        async onOpen() {
          await this.render();
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
        notice(message, timeout) {
          new Notice(message, timeout);
        }
        /**
         * Refresh triggered by a vault event or a settings change.
         *
         * Deliberately does NOT drop the skill cache: those files are outside the
         * vault index, so re-reading them on every note edit would put real IO back
         * into what is otherwise a zero-read refresh. Use `hardRefresh()` (the
         * refresh button) to pick up an edited skill immediately.
         */
        async refresh() {
          if (this.suppressRefresh) return;
          this.clearGalleryRotation();
          this.data.settings = this.plugin.settings;
          this.data.invalidate();
          this.pinnedCache = null;
          this.arsenalGroup = "skills";
          this.textPreview = null;
          await this.render({ preserveScroll: true });
        }
        /**
         * Everything a plain refresh does, plus dropping caches that no vault event
         * can invalidate (skills in dot-folders). This is what the refresh button
         * calls, so there is always a way to see an external edit at once.
         */
        async hardRefresh() {
          this.data.forgetSkills();
          await this.refresh();
        }
        /** Re-render from cached data, e.g. after a tab switch. */
        async rerender() {
          await this.render({ preserveScroll: true });
        }
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
          if (file && !file.children) {
            await this.openFile(path);
            return;
          }
          const adapter = this.app.vault.adapter;
          if (!adapter || typeof adapter.read !== "function") {
            this.notice(`\u8FD9\u4E2A\u6587\u4EF6\u4E0D\u5728 Vault \u7D22\u5F15\u91CC\uFF1A${path}`);
            return;
          }
          try {
            const content = await adapter.read(this.normalize(path));
            this.showText(path, content);
          } catch (e) {
            this.notice(`\u8BFB\u4E0D\u5230\uFF1A${path}`);
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
          if (!file) {
            this.notice(`\u627E\u4E0D\u5230\u6587\u4EF6\uFF1A${path}`);
            return;
          }
          const leaf = this.app.workspace.getLeaf("tab");
          await leaf.openFile(file);
          if (typeof line === "number") {
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
          if (!file) {
            this.notice("\u6E90\u6587\u4EF6\u5DF2\u4E0D\u5B58\u5728");
            return;
          }
          const content = await this.app.vault.read(file);
          const lines = content.split(/\r?\n/);
          const line = lines[task.line];
          if (!line || !TASK_LINE.test(line)) {
            this.notice("\u5F85\u529E\u884C\u5DF2\u53D8\u5316\uFF0C\u5DF2\u5237\u65B0");
            await this.refresh();
            return;
          }
          lines[task.line] = line.replace(/\[( |x|X|\/|-)\]/, task.done ? "[ ]" : "[x]");
          await this.app.vault.modify(file, lines.join("\n"));
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
        async resolveBlocker(item, value = "resolved") {
          const file = this.app.vault.getAbstractFileByPath(this.normalize(item.path));
          if (!file || file.children) {
            this.notice("\u6E90\u6587\u4EF6\u5DF2\u4E0D\u5B58\u5728\uFF0C\u5DF2\u5237\u65B0");
            await this.refresh();
            return;
          }
          let text;
          try {
            text = await this.app.vault.read(file);
          } catch (error) {
            this.notice(`\u8BFB\u4E0D\u5230\u6E90\u6587\u4EF6\uFF1A${error && error.message ? error.message : error}`);
            return;
          }
          const result = setFrontmatterField(text, "status", value);
          if (!result.ok) {
            this.notice(result.reason === "malformed" ? `${item.title} \u7684 frontmatter \u6CA1\u6709\u95ED\u5408\uFF0C\u5148\u624B\u52A8\u4FEE\u4E00\u4E0B` : "\u72B6\u6001\u6CA1\u6709\u53D8\u5316");
            await this.refresh();
            return;
          }
          await this.app.vault.modify(file, result.text);
          this.notice(`${item.title} \u2192 status: ${value}`);
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
          this.plugin.settings.scratchSavedAt = (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit"
          });
          this.suppressRefresh = true;
          try {
            await this.plugin.saveData(this.plugin.settings);
          } finally {
            this.suppressRefresh = false;
          }
        }
        /** Promote scratch text into a real note, so it stops being ephemeral. */
        async scratchToNote(text) {
          const body = String(text || "").trim();
          if (!body) {
            this.notice("\u4FBF\u7B7E\u662F\u7A7A\u7684");
            return;
          }
          const folder = this.plugin.settings.inboxFolder || "";
          const stamp = dateKey(/* @__PURE__ */ new Date());
          let path = this.normalize(`${folder ? `${folder}/` : ""}${stamp}_\u4FBF\u7B7E.md`);
          let counter = 2;
          while (this.app.vault.getAbstractFileByPath(path)) {
            path = this.normalize(`${folder ? `${folder}/` : ""}${stamp}_\u4FBF\u7B7E-${counter}.md`);
            counter += 1;
          }
          if (folder) await this.plugin.ensureFolder(folder);
          const file = await this.app.vault.create(path, `---
created: ${stamp}
type: scratch
---

${body}
`);
          await this.app.workspace.getLeaf("tab").openFile(file);
          this.notice(`\u5DF2\u5B58\u4E3A ${path}`);
        }
        queuePinnedSave(text) {
          window.clearTimeout(this.pinnedTimer);
          this.pinnedTimer = window.setTimeout(() => this.flushPinnedSave(text), 1200);
        }
        async flushPinnedSave(text) {
          window.clearTimeout(this.pinnedTimer);
          const target = String(this.plugin.settings.pinnedPath || "").trim();
          if (!target) return;
          const file = this.app.vault.getAbstractFileByPath(this.normalize(target));
          if (!file || file.children) return;
          if (this.pinnedCache === text) return;
          this.pinnedCache = text;
          this.suppressRefresh = true;
          try {
            await this.app.vault.modify(file, text);
          } catch (error) {
            this.notice(`\u4FDD\u5B58\u5931\u8D25\uFF1A${error && error.message ? error.message : error}`);
          } finally {
            window.setTimeout(() => {
              this.suppressRefresh = false;
            }, 2e3);
          }
        }
        async createPinnedNote() {
          const folder = this.plugin.settings.inboxFolder || "";
          const stamp = dateKey(/* @__PURE__ */ new Date());
          const path = this.normalize(`${folder ? `${folder}/` : ""}${stamp}_\u5DE5\u4F5C\u53F0\u4FBF\u7B7E.md`);
          let file = this.app.vault.getAbstractFileByPath(path);
          if (!file) {
            if (folder) await this.plugin.ensureFolder(folder);
            file = await this.app.vault.create(path, `# \u5F53\u524D\u7126\u70B9

- [ ]
`);
          }
          this.plugin.settings.pinnedPath = file.path;
          await this.plugin.saveSettings();
        }
        /** Read the pinned note once per refresh so the card stays synchronous. */
        async loadPinned() {
          const target = String(this.plugin.settings.pinnedPath || "").trim();
          if (!target) {
            this.pinnedCache = null;
            return;
          }
          const file = this.app.vault.getAbstractFileByPath(this.normalize(target));
          if (!file || file.children) {
            this.pinnedCache = null;
            return;
          }
          try {
            this.pinnedCache = await this.app.vault.cachedRead(file);
          } catch (e) {
            this.pinnedCache = null;
          }
        }
        explainFilters() {
          const settings = this.plugin.settings;
          this.notice([
            "\u5F85\u529E\u8FC7\u6EE4\u89C4\u5219\uFF1A",
            `\xB7 \u6587\u4EF6\u8D85\u8FC7 ${settings.taskMaxAgeDays} \u5929\u6CA1\u6539\u52A8`,
            "\xB7 \u8DEF\u5F84\u547D\u4E2D\u6392\u9664\u8BCD\uFF08\u6A21\u677F/\u95EE\u5377/\u5907\u4EFD/\u5F52\u6863/\u7B2C\u4E09\u65B9\u4ED3\u5E93\u7B49\uFF09",
            "\xB7 \u95EE\u5377\u9009\u9879\u6837\u5F0F\uFF08\u300C\u5176\u4ED6\uFF1A\u300D\u6216\u4EE5\u5192\u53F7\u7ED3\u5C3E\uFF09",
            `\xB7 \u77ED\u4E8E ${settings.taskMinLength} \u5B57`,
            settings.taskPerSource ? `\u53E6\u5916\uFF0C\u540C\u4E00\u7BC7\u7B14\u8BB0\u6700\u591A\u5C55\u793A ${settings.taskPerSource} \u6761\uFF0C\u907F\u514D\u4E00\u4E2A\u5927\u8BA1\u5212\u6324\u6389\u522B\u7684\u9879\u76EE\u3002` : "",
            "\u5E26\u660E\u786E\u5230\u671F\u65E5\u7684\u5F85\u529E\u6C38\u4E0D\u8FC7\u6EE4\u3001\u4E5F\u4E0D\u9650\u6D41\u3002\u5207\u5230\u300C\u5168\u90E8\u300D\u770B\u539F\u59CB\u6E05\u5355\uFF0C\u89C4\u5219\u90FD\u5728\u8BBE\u7F6E\u91CC\u3002"
          ].filter(Boolean).join("\n"), 14e3);
        }
        /** Create a note for an unresolved concept link, seeded with its backlinks. */
        async createConceptNote(name, source) {
          const folder = this.plugin.settings.conceptFolder || this.plugin.settings.inboxFolder || "";
          const safe = String(name).replace(/[\\/:*?"<>|]/g, "-").trim();
          if (!safe) return;
          const path = this.normalize(`${folder ? `${folder}/` : ""}${safe}.md`);
          let file = this.app.vault.getAbstractFileByPath(path);
          if (!file) {
            if (folder) await this.plugin.ensureFolder(folder);
            const body = [
              "---",
              `created: ${dateKey(/* @__PURE__ */ new Date())}`,
              "type: concept",
              "status: draft",
              "---",
              "",
              `# ${name}`,
              "",
              "## \u4E00\u53E5\u8BDD\u89E3\u91CA",
              "",
              "## \u4E3A\u4EC0\u4E48\u4F1A\u9047\u5230\u5B83",
              source ? `- \u6765\u81EA [[${source.title}]]` : "",
              "",
              "## \u8FD8\u4E0D\u6E05\u695A\u7684",
              ""
            ].filter((part) => part !== null).join("\n");
            file = await this.app.vault.create(path, body);
          }
          await this.app.workspace.getLeaf("tab").openFile(file);
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
          if (!width) return wanted;
          if (width < NARROW_ONE_COL) return 1;
          if (width < NARROW_TWO_COL) return Math.min(wanted, 2);
          return wanted;
        }
        /** Usable content width of this pane, or 0 when it has no layout yet. */
        paneWidth() {
          const host = this.containerEl && this.containerEl.children ? this.containerEl.children[1] : null;
          const node = host || this.containerEl;
          if (!node || typeof node.getBoundingClientRect !== "function") return 0;
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
          if (this.paneObserver || typeof ResizeObserver === "undefined") return;
          const host = this.containerEl && this.containerEl.children ? this.containerEl.children[1] : null;
          if (!host) return;
          this.lastCols = this.columnCount();
          this.paneObserver = new ResizeObserver(() => {
            const next = this.columnCount();
            if (next === this.lastCols) return;
            this.lastCols = next;
            window.clearTimeout(this.paneTimer);
            this.paneTimer = window.setTimeout(() => this.rerender(), 90);
          });
          this.paneObserver.observe(host);
        }
        /** Cards currently enabled, falling back to the active template's set. */
        activeCards() {
          const stored = registry.enabledIds(this.plugin.settings.cards);
          const ids = stored.length ? stored : registry.templateCards(this.plugin.settings.template || "general");
          return registry.layout(ids, this.columnCount());
        }
        async render({ preserveScroll = false } = {}) {
          if (this.rendering) {
            this.pendingRender = true;
            return;
          }
          this.rendering = true;
          try {
            const container = this.containerEl.children[1];
            const heatLeft = preserveScroll ? (container.querySelector(".desk-heat-scroll") || {}).scrollLeft || 0 : null;
            const outerTop = preserveScroll ? container.scrollTop : 0;
            await this.maintainItemStates(/* @__PURE__ */ new Date());
            const cards = this.activeCards();
            const cols = this.columnCount();
            const rawVh = Number(this.plugin.settings.cardMaxVh);
            const maxVh = Number.isFinite(rawVh) ? Math.max(40, Math.min(120, rawVh)) : 72;
            const needs = registry.requiredData(cards);
            if (cards.some((card) => card.id === "pinned")) await this.loadPinned();
            const model = await this.data.collect(needs);
            const now = /* @__PURE__ */ new Date();
            const today = dateKey(now);
            if (!this.selectedDate.startsWith(today.slice(0, 7))) this.selectedDate = today;
            const ctx = {
              model,
              settings: this.plugin.settings,
              view: this,
              data: this.data,
              now
            };
            const paneWidth = this.paneWidth();
            const root = div({
              cls: "desk-root",
              attr: {
                "data-pane": paneWidth < NARROW_ONE_COL ? "narrow" : paneWidth < NARROW_TWO_COL ? "medium" : "wide"
              }
            }, [
              div({ cls: "desk-wash desk-wash-one" }),
              div({ cls: "desk-wash desk-wash-two" }),
              div({ cls: "desk-wash desk-wash-three" }),
              el("main", { cls: "desk-shell" }, [
                this.renderHero(ctx),
                this.renderDock(ctx),
                el("section", {
                  cls: "desk-grid",
                  attr: { "data-cols": String(cols) },
                  // The grid's column count and the card height cap are both settings,
                  // applied as custom properties so the stylesheet stays static.
                  style: {
                    "--desk-cols": String(cols),
                    "--desk-card-max": `${maxVh}vh`
                  }
                }, cards.map((card) => this.renderCard(card, ctx))),
                this.renderFooter(ctx)
              ]),
              this.renderItemVaultButton(),
              this.renderItemVault(),
              this.renderTextPreview()
            ]);
            fill(container, root);
            if (preserveScroll) {
              container.scrollTop = outerTop;
              const scroller = container.querySelector(".desk-heat-scroll");
              if (scroller && heatLeft) scroller.scrollLeft = heatLeft;
            } else {
              const scroller = container.querySelector(".desk-heat-scroll");
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
            "desk-card",
            `desk-card-${card.id}`,
            // How many grid columns this card occupies, as decided by the solver for
            // the current column count. `is-full`/`is-half` are kept as stable hooks
            // for user CSS snippets but no longer drive placement.
            `desk-span-${card.cols || 1}`,
            `is-${card.span}`,
            card.stretch ? "is-stretch" : "",
            // A compact card opts out of row stretching so spare height does not
            // become dead space inside a fixed-size body.
            card.grow === "compact" ? "is-compact" : ""
          ];
          try {
            const node = el("article", { cls }, card.render(ctx));
            if (card.grow !== "compact" && !node.querySelector(".desk-fill")) {
              const candidates = node.querySelectorAll(".desk-row-list, .desk-task-list, .desk-empty, .desk-hint");
              const last = candidates[candidates.length - 1];
              if (last) last.classList.add("desk-fill");
            }
            const filler = node.querySelector(".desk-fill");
            if (filler) {
              node.classList.add("has-fill");
              let parent = filler.parentElement;
              while (parent && parent !== node) {
                parent.classList.add("is-growing");
                parent = parent.parentElement;
              }
            }
            return node;
          } catch (error) {
            console.error(`[desk] card ${card.id} failed to render`, error);
            return el("article", { cls: [...cls, "is-error"] }, [
              ui.cardHead("ERROR", card.label),
              ui.empty(`\u8FD9\u5F20\u5361\u7247\u6E32\u67D3\u5931\u8D25\uFF1A${error && error.message ? error.message : error}`, "\u5176\u5B83\u5361\u7247\u4E0D\u53D7\u5F71\u54CD\u3002\u53EF\u4EE5\u5728\u8BBE\u7F6E\u91CC\u5148\u5173\u6389\u5B83\u3002")
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
          const target = String(configured || "").trim();
          if (!target) return "";
          if (/^(https?|data):/i.test(target)) {
            return "";
          }
          const file = this.app.vault.getAbstractFileByPath(this.normalize(target));
          if (!file || file.children) return "";
          if (!/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(file.name)) return "";
          const adapter = this.app.vault.adapter;
          if (!adapter || typeof adapter.getResourcePath !== "function") return "";
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
          const target = String(imagePath || "").trim();
          if (!target || /^(https?|data):/i.test(target)) return "";
          const adapter = this.app.vault.adapter;
          if (!adapter || typeof adapter.getResourcePath !== "function") return "";
          const file = this.app.vault.getAbstractFileByPath(this.normalize(target));
          if (!file || file.children) return "";
          return adapter.getResourcePath(file.path);
        }
        /** Make a folder the gallery source, from inside the card. */
        async setGalleryFolder(folder) {
          this.galleryPickerOpen = false;
          this.galleryPage = 0;
          this.galleryPaused = false;
          this.clearGalleryRotation();
          this.plugin.settings.galleryFolder = String(folder || "").trim();
          await this.plugin.saveSettings();
          this.notice(folder ? `\u753B\u9762\u5899\u5DF2\u6307\u5411 ${folder}` : "\u753B\u9762\u5899\u5DF2\u6E05\u7A7A");
        }
        /** Create a safe Vault-relative folder and use it as the gallery source. */
        async createGalleryFolder(input) {
          const checked = validateVaultFolderPath(input);
          if (!checked.ok) {
            this.notice(checked.error);
            return false;
          }
          await this.plugin.ensureFolder(checked.path);
          const folder = this.app.vault.getAbstractFileByPath(this.normalize(checked.path));
          if (!folder || !folder.children) {
            this.notice(`\u76EE\u5F55\u521B\u5EFA\u5931\u8D25\uFF1A${checked.path}`);
            return false;
          }
          await this.setGalleryFolder(checked.path);
          return true;
        }
        clearGalleryRotation() {
          if (this.galleryTimer) window.clearInterval(this.galleryTimer);
          this.galleryTimer = 0;
          this.galleryTimerKey = "";
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
            if (typeof document !== "undefined" && document.hidden) return;
            this.galleryPage = (this.galleryPage + 1) % pages;
            this.rerender();
          }, seconds * 1e3);
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
        async maintainItemStates(now = /* @__PURE__ */ new Date()) {
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
          if (visibility.changed && visibility.record.state === "closed") {
            delete states[visibility.key];
            this.plugin.settings.itemStates = states;
            this.scheduleItemStateSave();
            return false;
          }
          if (visibility.changed && visibility.record.state === "archived" && !visibility.record.sourceUpdated) {
            states[visibility.key] = { ...visibility.record, sourceUpdated: true };
            this.plugin.settings.itemStates = states;
            this.scheduleItemStateSave();
          }
          return visibility.hidden;
        }
        async closeItem(item) {
          this.plugin.settings.itemStates = itemState.closeItem(this.itemStates(), item, /* @__PURE__ */ new Date());
          await this.plugin.saveSettings();
          this.notice("\u5DF2\u79FB\u5165 Desk \u56DE\u6536\u7AD9\uFF1B\u4E0D\u4F1A\u5220\u9664\u6E90\u6587\u4EF6");
          await this.rerender();
        }
        async restoreItem(key) {
          this.plugin.settings.itemStates = itemState.restoreItem(this.itemStates(), key);
          await this.plugin.saveSettings();
          await this.rerender();
        }
        async archiveItem(key) {
          this.plugin.settings.itemStates = itemState.archiveItem(this.itemStates(), key, /* @__PURE__ */ new Date());
          await this.plugin.saveSettings();
          await this.rerender();
        }
        async archiveAllItems() {
          this.plugin.settings.itemStates = itemState.archiveAll(this.itemStates(), /* @__PURE__ */ new Date());
          await this.plugin.saveSettings();
          this.itemVaultTab = "archived";
          await this.rerender();
        }
        async restoreAllItems(state) {
          this.plugin.settings.itemStates = itemState.restoreAll(this.itemStates(), state);
          await this.plugin.saveSettings();
          await this.rerender();
        }
        openItemVault(tab = "closed") {
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
            cls: "desk-recycle-button",
            text: `\u56DE\u6536\u7AD9 ${summary.closed}`,
            title: `\u56DE\u6536\u7AD9 ${summary.closed} \u9879 \xB7 \u5F52\u6863 ${summary.archived} \u9879`,
            onClick: () => this.openItemVault(summary.closed ? "closed" : "archived")
          });
        }
        renderItemVault() {
          if (!this.itemVaultOpen) return null;
          const states = this.itemStates();
          const summary = itemState.counts(states);
          const tab = this.itemVaultTab === "archived" ? "archived" : "closed";
          const records = Object.entries(states).filter(([, record]) => record.state === tab).sort((a, b) => String(b[1].archivedAt || b[1].closedAt).localeCompare(String(a[1].archivedAt || a[1].closedAt)));
          const days = Number(this.plugin.settings.trashArchiveDays) || 0;
          return div({ cls: "desk-recycle-overlay", onClick: (event) => {
            if (event.target && event.target.classList.contains("desk-recycle-overlay")) this.closeItemVault();
          } }, [
            el("aside", { cls: "desk-recycle-drawer", attr: { role: "dialog", "aria-label": "Desk \u56DE\u6536\u7AD9" } }, [
              div({ cls: "desk-recycle-head" }, [
                div({}, [span({ text: "DESK" }), el("h2", { text: "\u56DE\u6536\u7AD9\u4E0E\u5F52\u6863" })]),
                button({ cls: "desk-head-btn", text: "\u5173\u95ED", onClick: () => this.closeItemVault() })
              ]),
              div({ cls: "desk-recycle-tabs" }, [
                button({ cls: tab === "closed" ? "is-active" : "", text: `\u56DE\u6536\u7AD9 ${summary.closed}`, onClick: () => {
                  this.itemVaultTab = "closed";
                  this.rerender();
                } }),
                button({ cls: tab === "archived" ? "is-active" : "", text: `\u5F52\u6863 ${summary.archived}`, onClick: () => {
                  this.itemVaultTab = "archived";
                  this.rerender();
                } })
              ]),
              tab === "closed" ? el("p", { cls: "desk-recycle-note", text: days > 0 ? `\u9879\u76EE\u5173\u95ED ${days} \u5929\u540E\uFF0C\u5728\u4E0B\u6B21\u6253\u5F00\u6216\u5237\u65B0 Desk \u65F6\u81EA\u52A8\u5F52\u6863\u3002` : "\u81EA\u52A8\u5F52\u6863\u5DF2\u5173\u95ED\u3002" }) : el("p", { cls: "desk-recycle-note", text: "\u5F52\u6863\u53EA\u9690\u85CF\u5DE5\u4F5C\u53F0\u9879\u76EE\uFF0C\u4E0D\u5220\u9664\u3001\u79FB\u52A8\u6216\u4FEE\u6539\u6E90\u6587\u4EF6\u3002" }),
              records.length ? div({ cls: "desk-recycle-list" }, records.map(([key, record]) => div({ cls: "desk-recycle-item" }, [
                div({ cls: "desk-recycle-item-main" }, [
                  span({ text: record.cardLabel || record.cardId || "\u5DE5\u4F5C\u53F0\u9879\u76EE" }),
                  el("strong", { text: record.label }),
                  el("small", { text: record.sourceUpdated ? "\u5F52\u6863\u540E\u6E90\u6570\u636E\u6709\u66F4\u65B0" : record.sourcePaths[0] || "\u8BA1\u7B97\u9879\u76EE" })
                ]),
                div({ cls: "desk-recycle-actions" }, [
                  record.sourcePaths[0] ? button({ cls: "desk-head-btn", text: "\u6253\u5F00", onClick: () => this.openFile(record.sourcePaths[0]) }) : null,
                  button({ cls: "desk-head-btn", text: "\u6062\u590D", onClick: () => this.restoreItem(key) }),
                  tab === "closed" ? button({ cls: "desk-head-btn", text: "\u5F52\u6863", onClick: () => this.archiveItem(key) }) : null
                ])
              ]))) : div({ cls: "desk-recycle-empty", text: tab === "closed" ? "\u56DE\u6536\u7AD9\u662F\u7A7A\u7684\u3002" : "\u8FD8\u6CA1\u6709\u5F52\u6863\u9879\u76EE\u3002" }),
              records.length ? div({ cls: "desk-recycle-footer" }, [
                button({ cls: "desk-head-btn", text: "\u6062\u590D\u5168\u90E8", onClick: () => this.restoreAllItems(tab) }),
                tab === "closed" ? button({ cls: "desk-head-btn", text: "\u5168\u90E8\u5F52\u6863", onClick: () => this.archiveAllItems() }) : null
              ]) : null
            ])
          ]);
        }
        renderHero(ctx) {
          const { model, settings, now } = ctx;
          const today = dateKey(now);
          const hour = now.getHours();
          const greeting = hour < 6 ? "\u8FD8\u6CA1\u7761" : hour < 11 ? "\u65E9\u4E0A\u597D" : hour < 14 ? "\u4E2D\u5348\u597D" : hour < 18 ? "\u4E0B\u5348\u597D" : "\u665A\u4E0A\u597D";
          const weekdays = ["\u661F\u671F\u65E5", "\u661F\u671F\u4E00", "\u661F\u671F\u4E8C", "\u661F\u671F\u4E09", "\u661F\u671F\u56DB", "\u661F\u671F\u4E94", "\u661F\u671F\u516D"];
          const name = String(settings.displayName || "").trim();
          const message = String(settings.dailyMessage || "").trim();
          const dueToday = model.openTasks.filter((task) => {
            const due = task.due || task.scheduled;
            return due && due <= today;
          }).length;
          const stale = (model.active || []).filter((stream) => stream.stale).length;
          const template = registry.TEMPLATES.find((item) => item.id === (settings.template || "general"));
          const heroImage = this.resolveHeroImage(settings.heroImage);
          return el("header", {
            cls: ["desk-hero", heroImage ? "has-image" : ""],
            style: heroImage ? { "--desk-hero-image": `url("${heroImage}")` } : null
          }, [
            div({}, [
              div({ cls: "desk-kicker", text: template ? template.label.toUpperCase() : "DESK" }),
              el("h1", { text: name ? `${greeting}\uFF0C${name}` : greeting }),
              el("p", { text: `${now.getFullYear()}\u5E74${now.getMonth() + 1}\u6708${now.getDate()}\u65E5 ${weekdays[now.getDay()]}` }),
              message ? el("p", { cls: "desk-focus", text: message }) : null
            ]),
            div({ cls: "desk-hero-side" }, [
              div({ cls: "desk-status" }, [
                span({ cls: "desk-dot" }),
                span({ text: `\u672C\u5730\u626B\u63CF ${model.files.length} \u7BC7` }),
                button({ cls: "desk-head-btn", text: "\u5237\u65B0", onClick: () => this.hardRefresh() })
              ]),
              div({ cls: "desk-pills" }, [
                span({ cls: dueToday ? "is-warn" : "", text: `${dueToday} \u6761\u5230\u671F` }),
                span({ cls: stale ? "is-warn" : "", text: `${stale} \u6761\u505C\u6EDE` }),
                span({ text: `${model.openTasks.length} \u6761\u5F85\u529E` }),
                model.hiddenCount ? span({ cls: "is-muted", text: `\u5DF2\u6EE4 ${model.hiddenCount}` }) : null
              ])
            ])
          ]);
        }
        renderDock(ctx) {
          const actions = this.plugin.quickActions();
          if (!actions.length) return null;
          return el("section", { cls: "desk-dock" }, [
            div({ cls: "desk-dock-head" }, [
              div({}, [span({ text: "QUICK ACTIONS" }), el("h2", { text: "\u4ECE\u8FD9\u91CC\u7EE7\u7EED\u4ECA\u5929\u7684\u5DE5\u4F5C" })])
            ]),
            div({ cls: "desk-dock-grid" }, actions.map((item, index) => button({
              onClick: () => this.plugin.runQuickAction(item.id)
            }, [
              el("i", { text: String(index + 1).padStart(2, "0") }),
              span({}, [
                el("strong", { text: item.label }),
                el("small", { text: item.desc })
              ]),
              el("b", { text: "\u2192" })
            ])))
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
          return div({ cls: "desk-preview", onClick: (event) => {
            if (event.target && event.target.classList.contains("desk-preview")) this.closeText();
          } }, [
            div({ cls: "desk-preview-panel" }, [
              div({ cls: "desk-preview-head" }, [
                div({}, [
                  span({ text: "READ ONLY" }),
                  el("strong", { text: title.split("/").slice(-2).join("/") })
                ]),
                button({ cls: "desk-head-btn", text: "\u5173\u95ED", onClick: () => this.closeText() })
              ]),
              el("pre", { cls: "desk-preview-body" }, [el("code", { text: content })])
            ])
          ]);
        }
        renderFooter(ctx) {
          const { model } = ctx;
          const bits = [
            `${model.openTasks.length} \u5F85\u529E`,
            model.active ? `${model.active.length} \u6761\u5728\u98DE` : null,
            model.code ? `${model.code.blocks} \u4E2A\u4EE3\u7801\u5757` : null,
            model.scanMs ? `\u626B\u63CF ${model.scanMs}ms` : null
          ].filter(Boolean);
          return el("footer", { cls: "desk-footer" }, [
            span({ text: "DESK \xB7 LOCAL ONLY" }),
            span({ text: bits.join(" \xB7 ") })
          ]);
        }
      };
    }
    module2.exports = { makeView, VIEW_TYPE };
  }
});

// src/settingtab.js
var require_settingtab = __commonJS({
  "src/settingtab.js"(exports2, module2) {
    "use strict";
    var registry = require_registry();
    var { registerAll } = require_cards();
    var { parseList } = require_util();
    var { detectLayout } = require_settings();
    var TEXT_FIELDS = [
      ["displayName", "\u9996\u9875\u79F0\u547C", "\u95EE\u5019\u8BED\u91CC\u663E\u793A\u7684\u540D\u5B57\uFF0C\u7559\u7A7A\u53EA\u663E\u793A\u95EE\u5019"],
      ["dailyMessage", "\u6BCF\u65E5\u5BC4\u8BED", "\u7559\u7A7A\u5219\u4E0D\u663E\u793A"],
      ["workRoot", "\u626B\u63CF\u6839\u76EE\u5F55", "\u53EA\u626B\u8FD9\u4E2A\u76EE\u5F55\u4E0B\u7684\u7B14\u8BB0\uFF0C\u7559\u7A7A\u626B\u5168\u5E93"],
      ["activeFolder", "\u8FDB\u884C\u4E2D\u76EE\u5F55", "\u8DE8\u5929\u672A\u95ED\u73AF\u7684\u5DE5\u4F5C\u7EBF\uFF0C\u4F8B\u5982 11-Active"],
      ["dailyFolder", "\u65E5\u62A5\u76EE\u5F55", "\u4F8B\u5982 01-Daily"],
      ["projectFolder", "\u9879\u76EE\u76EE\u5F55", "\u4F8B\u5982 02-Projects"],
      ["researchFolder", "\u7814\u7A76\u76EE\u5F55", "\u4F8B\u5982 06-Research"],
      ["blockerFolder", "\u963B\u585E\u76EE\u5F55", "\u4F8B\u5982 04-Blockers"],
      ["inboxFolder", "\u6536\u4EF6\u7BB1\u76EE\u5F55", "\u4F8B\u5982 00-Inbox"],
      ["conceptFolder", "\u6982\u5FF5\u7B14\u8BB0\u76EE\u5F55", "\u5B66\u4E60\u6A21\u677F\u7528\uFF1A\u70B9\u300C\u6982\u5FF5\u503A\u300D\u65B0\u5EFA\u7B14\u8BB0\u65F6\u653E\u54EA"],
      ["pinnedPath", "\u9489\u4F4F\u7684\u7B14\u8BB0", "\u300C\u9489\u4F4F\u7684\u7B14\u8BB0\u300D\u5361\u7247\u76F4\u63A5\u7F16\u8F91\u8FD9\u4E2A\u6587\u4EF6\uFF1B\u7559\u7A7A\u5219\u5361\u7247\u91CC\u53EF\u4EE5\u65B0\u5EFA"],
      ["heroImage", "\u9876\u90E8\u80CC\u666F\u56FE", "Vault \u91CC\u7684\u56FE\u7247\u8DEF\u5F84\uFF0C\u4F8B\u5982 assets/desk-bg.jpg\u3002\u7559\u7A7A\u5219\u7528\u7EAF\u8272\u3002\u63D2\u4EF6\u4E0D\u81EA\u5E26\u56FE\u7247\u4E5F\u4E0D\u8054\u7F51\u53D6\u56FE"],
      ["galleryFolder", "\u753B\u9762\u5899\u76EE\u5F55", "\u300C\u753B\u9762\u5899\u300D\u5361\u7247\u663E\u793A\u8FD9\u4E2A\u76EE\u5F55\u91CC\u7684\u56FE\u7247\uFF0C\u4F8B\u5982 02-Projects/\u8BBE\u8BA1\u7A3F\u3002\u7559\u7A7A\u5219\u5361\u7247\u4F1A\u63D0\u793A\u4F60\u9009\u4E00\u4E2A"],
      ["skillFolders", "\u80FD\u529B\u76EE\u5F55", "\u6B66\u5668\u5E93\u7528\uFF1A\u5B58\u653E skill \u7684\u76EE\u5F55\uFF0C\u9017\u53F7\u5206\u9694\u3002\u6BCF\u4E2A skill \u662F\u4E00\u4E2A\u542B SKILL.md \u7684\u5B50\u6587\u4EF6\u5939"],
      ["templateFolder", "\u6A21\u677F\u76EE\u5F55", "\u6B66\u5668\u5E93\u7528\uFF1A\u53EF\u590D\u7528\u6587\u6863\u6A21\u677F\u6240\u5728\u76EE\u5F55"]
    ];
    var NUMBER_FIELDS = [
      ["staleDays", "\u505C\u6EDE\u9608\u503C\uFF08\u5929\uFF09", "\u8FDB\u884C\u4E2D\u7684\u7EBF\u8D85\u8FC7\u8FD9\u4E2A\u5929\u6570\u6CA1\u52A8\u5C31\u6807\u7EA2"],
      ["taskLimit", "\u5F85\u529E\u663E\u793A\u6761\u6570", "\u5F85\u529E\u5361\u7247\u6700\u591A\u663E\u793A\u591A\u5C11\u6761"],
      ["heatWeeks", "\u70ED\u529B\u56FE\u5468\u6570", "\u4EA7\u51FA\u70ED\u529B\u56FE\u7EDF\u8BA1\u591A\u5C11\u5468"],
      ["taskMaxAgeDays", "\u5F85\u529E\u6700\u5927\u5929\u6570", "\u6240\u5728\u6587\u4EF6\u8D85\u8FC7\u8FD9\u4E2A\u5929\u6570\u6CA1\u6539\u52A8\u5C31\u4E0D\u5F53\u5F85\u529E\uFF1B\u5E26\u5230\u671F\u65E5\u7684\u9664\u5916\u3002\u8BBE 0 \u5173\u95ED"],
      ["taskMinLength", "\u5F85\u529E\u6700\u77ED\u5B57\u6570", "\u77ED\u4E8E\u8FD9\u4E2A\u957F\u5EA6\u7684\u590D\u9009\u6846\u6587\u672C\u5FFD\u7565"],
      ["taskPerSource", "\u540C\u4E00\u7B14\u8BB0\u6700\u591A\u51E0\u6761", "\u9632\u6B62\u4E00\u4E2A\u5927\u8BA1\u5212\u7B14\u8BB0\u6324\u6389\u5176\u5B83\u9879\u76EE\uFF1B\u5E26\u5230\u671F\u65E5\u7684\u4E0D\u53D7\u9650\u3002\u8BBE 0 \u5173\u95ED"],
      ["reviewMinDays", "\u590D\u4E60\u95F4\u9694\uFF08\u5929\uFF09", "\u5B66\u4E60\u6A21\u677F\u7528\uFF1A\u8D85\u8FC7\u8FD9\u4E2A\u5929\u6570\u6CA1\u6253\u5F00\u7684\u7B14\u8BB0\u8FDB\u590D\u4E60\u961F\u5217"]
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
          containerEl.createEl("h3", { text: "\u6A21\u677F" });
          const current = this.plugin.settings.template || "general";
          const active = registry.TEMPLATES.find((item) => item.id === current);
          new Setting(containerEl).setName("\u5F53\u524D\u6A21\u677F").setDesc(active ? active.desc : "\u9009\u4E00\u5957\u9884\u8BBE\uFF0C\u518D\u6309\u9700\u5F00\u5173\u5355\u5F20\u5361\u7247").addDropdown((dropdown) => {
            registry.TEMPLATES.forEach((item) => dropdown.addOption(item.id, item.label));
            dropdown.setValue(current);
            dropdown.onChange(async (value) => {
              this.plugin.settings.template = value;
              this.plugin.settings.cards = registry.templateCards(value).join(", ");
              await this.save();
              this.display();
            });
          });
          new Setting(containerEl).setName("\u6062\u590D\u8FD9\u5957\u6A21\u677F\u7684\u9ED8\u8BA4\u5361\u7247").setDesc("\u5982\u679C\u4F60\u5173\u6389\u4E86\u592A\u591A\u5361\u7247\uFF0C\u7528\u8FD9\u4E2A\u56DE\u5230\u6A21\u677F\u9ED8\u8BA4\u7EC4\u5408").addButton((btn) => btn.setButtonText("\u6062\u590D").onClick(async () => {
            this.plugin.settings.cards = registry.templateCards(current).join(", ");
            await this.save();
            this.display();
          })).addButton((btn) => btn.setButtonText("\u5168\u90E8\u6253\u5F00").onClick(async () => {
            this.plugin.settings.cards = registry.allCards().map((card) => card.id).join(", ");
            await this.save();
            this.display();
          }));
          new Setting(containerEl).setName("\u56DE\u6536\u7AD9\u81EA\u52A8\u5F52\u6863").setDesc("\u5173\u95ED\u9879\u76EE\u5728\u4E0B\u6B21\u6253\u5F00\u6216\u5237\u65B0 Desk \u65F6\uFF0C\u8D85\u8FC7\u671F\u9650\u81EA\u52A8\u79FB\u5165\u5F52\u6863\uFF1B\u4E0D\u4F1A\u5220\u9664\u6E90\u6587\u4EF6\u3002").addDropdown((dropdown) => {
            var _a;
            dropdown.addOption("7", "7 \u5929");
            dropdown.addOption("30", "30 \u5929");
            dropdown.addOption("90", "90 \u5929");
            dropdown.addOption("0", "\u6C38\u4E0D\u81EA\u52A8\u5F52\u6863");
            dropdown.setValue(String((_a = this.plugin.settings.trashArchiveDays) != null ? _a : 30));
            dropdown.onChange(async (value) => {
              this.plugin.settings.trashArchiveDays = Number(value);
              await this.save();
            });
          });
          new Setting(containerEl).setName("\u542F\u52A8\u65F6\u81EA\u52A8\u6253\u5F00").addToggle((toggle) => toggle.setValue(Boolean(this.plugin.settings.autoOpen)).onChange(async (value) => {
            this.plugin.settings.autoOpen = value;
            await this.save();
          }));
          containerEl.createEl("h3", { text: "\u5E03\u5C40" });
          new Setting(containerEl).setName("\u5217\u6570").setDesc("\u5BBD\u5C4F\u7528 3 \u5217\uFF0C\u4FA7\u8FB9\u680F\u7528 1 \u5217\u3002\u4EFB\u4F55\u5217\u6570\u4E0B\u5361\u7247\u90FD\u4E0D\u4F1A\u7559\u7A7A\u4F4D\u3002").addDropdown((dropdown) => {
            dropdown.addOption("1", "1 \u5217");
            dropdown.addOption("2", "2 \u5217");
            dropdown.addOption("3", "3 \u5217");
            dropdown.setValue(String(this.plugin.settings.columns || 2));
            dropdown.onChange(async (value) => {
              this.plugin.settings.columns = Number(value);
              await this.save();
            });
          });
          new Setting(containerEl).setName("\u5361\u7247\u6700\u5927\u9AD8\u5EA6").setDesc("\u5360\u9762\u677F\u9AD8\u5EA6\u7684\u767E\u5206\u6BD4\u3002\u9762\u677F\u62C9\u9AD8\u65F6\u5361\u7247\u4F1A\u8DDF\u7740\u957F\uFF0C\u591A\u51FA\u6765\u7684\u9AD8\u5EA6\u7528\u6765\u663E\u793A\u66F4\u591A\u5185\u5BB9\u3002").addSlider((slider) => slider.setLimits(40, 120, 4).setValue(Number(this.plugin.settings.cardMaxVh) || 72).setDynamicTooltip().onChange(async (value) => {
            this.plugin.settings.cardMaxVh = value;
            await this.save();
          }));
          containerEl.createEl("h3", { text: "\u753B\u9762\u5899" });
          new Setting(containerEl).setName("\u753B\u5E45\u6BD4\u4F8B").setDesc("\u7AD6\u5E45\u9002\u5408\u63D2\u753B\u548C\u6D77\u62A5\uFF0C\u6A2A\u5E45\u9002\u5408\u622A\u56FE\u548C\u7F51\u9875\u7A3F\uFF0C\u65B9\u5F62\u9002\u5408\u6DF7\u653E\u3002").addDropdown((dropdown) => {
            dropdown.addOption("portrait", "\u7AD6\u5E45 3:4");
            dropdown.addOption("square", "\u65B9\u5F62 1:1");
            dropdown.addOption("landscape", "\u6A2A\u5E45 4:3");
            dropdown.setValue(this.plugin.settings.galleryRatio || "square");
            dropdown.onChange(async (value) => {
              this.plugin.settings.galleryRatio = value;
              await this.save();
            });
          });
          new Setting(containerEl).setName("\u663E\u793A\u5F20\u6570").setDesc("\u4E00\u5C4F\u653E\u51E0\u5F20\u3002\u5F20\u6570\u8D8A\u5C11\u6BCF\u5F20\u8D8A\u5927\u3002").addSlider((slider) => slider.setLimits(3, 12, 1).setValue(Number(this.plugin.settings.galleryCount) || 6).setDynamicTooltip().onChange(async (value) => {
            this.plugin.settings.galleryCount = value;
            await this.save();
          }));
          new Setting(containerEl).setName("\u81EA\u52A8\u8F6E\u64AD").setDesc("\u56FE\u7247\u8D85\u8FC7\u4E00\u5C4F\u65F6\u81EA\u52A8\u5207\u6362\u5230\u4E0B\u4E00\u7EC4\uFF0C\u4ECD\u53EF\u5728\u5361\u7247\u91CC\u6682\u505C\u6216\u624B\u52A8\u7FFB\u7EC4\u3002").addToggle((toggle) => toggle.setValue(this.plugin.settings.galleryAutoRotate !== false).onChange(async (value) => {
            this.plugin.settings.galleryAutoRotate = value;
            await this.save();
          }));
          new Setting(containerEl).setName("\u8F6E\u64AD\u95F4\u9694").setDesc("\u6BCF\u7EC4\u505C\u7559\u591A\u5C11\u79D2\uFF0C\u8303\u56F4 3\u201330 \u79D2\u3002").addSlider((slider) => slider.setLimits(3, 30, 1).setValue(Math.max(3, Math.min(30, Number(this.plugin.settings.galleryRotateSeconds) || 8))).setDynamicTooltip().onChange(async (value) => {
            this.plugin.settings.galleryRotateSeconds = value;
            await this.save();
          }));
        }
        renderCardToggles(containerEl) {
          const enabled = parseList(this.plugin.settings.cards);
          containerEl.createEl("h3", { text: `\u5361\u7247\uFF08\u5DF2\u5F00 ${enabled.length} \u5F20\uFF09` });
          containerEl.createEl("p", {
            cls: "setting-item-description",
            text: "\u6BCF\u5F20\u5361\u90FD\u80FD\u5355\u72EC\u5F00\u5173\uFF0C\u987A\u5E8F\u7528\u53F3\u8FB9\u7684\u7BAD\u5934\u8C03\u6574\u3002\u5173\u6389\u4EFB\u4F55\u7EC4\u5408\u90FD\u4E0D\u4F1A\u8BA9\u6392\u7248\u7559\u7A7A \u2014\u2014 \u5E03\u5C40\u4F1A\u81EA\u52A8\u8865\u4F4D\u3002"
          });
          const belongs = (card) => card.templates.includes(this.plugin.settings.template || "general");
          const ordered = [
            ...registry.allCards().filter(belongs),
            ...registry.allCards().filter((card) => !belongs(card))
          ];
          ordered.forEach((card) => {
            const on = enabled.includes(card.id);
            const position = enabled.indexOf(card.id);
            const setting = new Setting(containerEl).setName(`${card.label}${belongs(card) ? "" : "\u3000\xB7\u3000\u5176\u5B83\u6A21\u677F"}`).setDesc(`${card.desc}\u3000|\u3000${card.span === "full" ? "\u6574\u884C" : "\u534A\u884C"}`);
            if (on) {
              setting.addExtraButton((btn) => btn.setIcon("arrow-up").setTooltip("\u4E0A\u79FB").setDisabled(position <= 0).onClick(async () => {
                await this.move(card.id, -1);
              }));
              setting.addExtraButton((btn) => btn.setIcon("arrow-down").setTooltip("\u4E0B\u79FB").setDisabled(position < 0 || position >= enabled.length - 1).onClick(async () => {
                await this.move(card.id, 1);
              }));
            }
            setting.addToggle((toggle) => toggle.setValue(on).onChange(async (value) => {
              const current = parseList(this.plugin.settings.cards);
              let next;
              if (value) {
                const wanted = /* @__PURE__ */ new Set([...current, card.id]);
                next = registry.allCards().filter((item) => wanted.has(item.id)).map((item) => item.id);
              } else {
                next = current.filter((id) => id !== card.id);
              }
              this.plugin.settings.cards = next.join(", ");
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
          this.plugin.settings.cards = list.join(", ");
          await this.save();
          this.display();
        }
        renderDetect(containerEl) {
          containerEl.createEl("h3", { text: "\u76EE\u5F55" });
          new Setting(containerEl).setName("\u81EA\u52A8\u8BC6\u522B\u672C\u5E93\u7ED3\u6784").setDesc("\u626B\u4E00\u904D\u6587\u4EF6\u5939\u540D\uFF0C\u731C\u51FA\u65E5\u62A5/\u9879\u76EE/\u6536\u4EF6\u7BB1\u7B49\u76EE\u5F55\u3002\u4F1A\u8986\u76D6\u4E0B\u9762\u7684\u76EE\u5F55\u8BBE\u7F6E\u3002").addButton((btn) => btn.setButtonText("\u8BC6\u522B").onClick(async () => {
            const folders = this.app.vault.getAllLoadedFiles().filter((file) => file.children).map((file) => file.path).filter((path) => path && path !== "/");
            const counts = {};
            this.app.vault.getMarkdownFiles().forEach((file) => {
              let dir = file.path.split("/").slice(0, -1).join("/");
              while (dir) {
                counts[dir] = (counts[dir] || 0) + 1;
                dir = dir.split("/").slice(0, -1).join("/");
              }
            });
            const detected = detectLayout(folders, counts);
            const applied = Object.entries(detected).filter(([, value]) => value);
            applied.forEach(([key, value]) => {
              this.plugin.settings[key] = value;
            });
            await this.save();
            this.display();
            new Notice(applied.length ? `\u8BC6\u522B\u5230 ${applied.length} \u4E2A\u76EE\u5F55\uFF1A
${applied.map(([key, value]) => `\xB7 ${value}`).join("\n")}` : "\u6CA1\u6709\u8BC6\u522B\u5230\u5E38\u89C1\u76EE\u5F55\u7ED3\u6784\uFF0C\u53EF\u4EE5\u624B\u586B\u3002", 8e3);
          }));
        }
        renderFields(containerEl) {
          TEXT_FIELDS.forEach(([key, name, desc]) => {
            new Setting(containerEl).setName(name).setDesc(desc).addText((text) => {
              var _a;
              return text.setValue(String((_a = this.plugin.settings[key]) != null ? _a : "")).onChange(async (value) => {
                this.plugin.settings[key] = value.trim();
                await this.save();
              });
            });
          });
          containerEl.createEl("h3", { text: "\u9608\u503C" });
          NUMBER_FIELDS.forEach(([key, name, desc]) => {
            new Setting(containerEl).setName(name).setDesc(desc).addText((text) => {
              var _a;
              return text.setValue(String((_a = this.plugin.settings[key]) != null ? _a : "")).onChange(async (value) => {
                const parsed = Number(value);
                if (Number.isFinite(parsed) && parsed >= 0) {
                  this.plugin.settings[key] = parsed;
                  await this.save();
                }
              });
            });
          });
          containerEl.createEl("h3", { text: "\u5F85\u529E\u8FC7\u6EE4" });
          [
            ["taskExcludes", "\u5F85\u529E\u6392\u9664\u8BCD", "\u9017\u53F7\u5206\u9694\u3002\u8DEF\u5F84\u542B\u4EFB\u4E00\u7247\u6BB5\u7684\u6587\u4EF6\u4E0D\u5F53\u5F85\u529E\u6765\u6E90"],
            ["noteExcludes", "\u7B14\u8BB0\u6392\u9664\u8BCD", "\u9017\u53F7\u5206\u9694\u3002\u673A\u5668\u751F\u6210\u7684\u8BB0\u8D26\u6587\u4EF6\u4E0D\u7B97\u300C\u6211\u5728\u505A\u7684\u4E8B\u300D"],
            ["myNames", "\u6211\u7684\u79F0\u547C", "\u9017\u53F7\u5206\u9694\u3002\u300C\u59D3\u540D\uFF1A\u300D\u524D\u7F00\u547D\u4E2D\u8FD9\u4E9B\u540D\u5B57\u7684\u7B97\u6211\u7684\u5F85\u529E"],
            ["teamNames", "\u4ED6\u4EBA\u79F0\u547C", "\u9017\u53F7\u5206\u9694\u3002\u5E26\u8FD9\u4E9B\u540D\u5B57\u4E14\u662F\u300C\u7B49 X \u786E\u8BA4\u300D\u7C7B\u53E5\u5F0F\u7684\u5F52\u5230\u300C\u7B49\u4EBA\u300D"]
          ].forEach(([key, name, desc]) => {
            new Setting(containerEl).setName(name).setDesc(desc).addTextArea((area) => {
              var _a;
              area.setValue(String((_a = this.plugin.settings[key]) != null ? _a : ""));
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
    module2.exports = { makeSettingTab, TEXT_FIELDS, NUMBER_FIELDS };
  }
});

// src/plugin.js
var require_plugin = __commonJS({
  "src/plugin.js"(exports2, module2) {
    "use strict";
    var { DEFAULTS } = require_settings();
    var { detectLayout } = require_settings();
    var { makeView, VIEW_TYPE } = require_view();
    var { makeSettingTab } = require_settingtab();
    var { registerAll } = require_cards();
    var registry = require_registry();
    var { dateKey, parseList } = require_util();
    function makePlugin2(obsidian2) {
      const { Plugin, Notice, normalizePath } = obsidian2;
      const DeskHomeView = makeView(obsidian2);
      const DeskSettingTab = makeSettingTab(obsidian2);
      registerAll();
      return class DeskPlugin extends Plugin {
        async onload() {
          await this.loadSettings();
          this.registerView(VIEW_TYPE, (leaf) => new DeskHomeView(leaf, this));
          this.addRibbonIcon("layout-dashboard", "Desk", () => this.openDesk());
          this.addCommand({ id: "open", name: "\u6253\u5F00 Desk \u5DE5\u4F5C\u53F0", callback: () => this.openDesk() });
          this.addCommand({ id: "refresh", name: "\u5237\u65B0 Desk \u6570\u636E", callback: () => this.refreshViews() });
          registry.TEMPLATES.forEach((template) => {
            this.addCommand({
              id: `template-${template.id}`,
              name: `\u5207\u6362\u5230\u300C${template.label}\u300D\u6A21\u677F`,
              callback: () => this.applyTemplate(template.id)
            });
          });
          this.addSettingTab(new DeskSettingTab(this.app, this));
          ["modify", "create", "delete", "rename"].forEach((event) => {
            this.registerEvent(this.app.vault.on(event, () => this.scheduleRefresh()));
          });
          this.app.workspace.onLayoutReady(() => {
            if (this.settings.firstRun) this.runFirstRunDetection();
            if (this.settings.autoOpen && !this.app.workspace.getLeavesOfType(VIEW_TYPE).length) {
              this.openDesk(false);
            }
          });
        }
        async loadSettings() {
          const saved = await this.loadData() || {};
          Object.keys(saved).forEach((key) => {
            if (saved[key] === null || saved[key] === void 0) delete saved[key];
          });
          const isFresh = Object.keys(saved).length === 0;
          this.settings = Object.assign({}, DEFAULTS, saved);
          this.settings.firstRun = isFresh;
          if (isFresh) {
            this.settings.cards = registry.templateCards(this.settings.template).join(", ");
          } else {
            const kept = registry.enabledIds(this.settings.cards);
            const dropped = parseList(this.settings.cards).length - kept.length;
            if (dropped > 0) this.settings.cards = kept.join(", ");
            if (!kept.length) {
              this.settings.cards = registry.templateCards(this.settings.template || "general").join(", ");
            }
          }
          if (isFresh || Object.keys(DEFAULTS).some((key) => !(key in saved))) {
            await this.saveData(this.settings);
          }
        }
        /**
         * On a brand-new install, guess this vault's layout so the first render shows
         * real data instead of six "configure me" boxes.
         */
        async runFirstRunDetection() {
          const folders = this.app.vault.getAllLoadedFiles().filter((file) => file.children).map((file) => file.path).filter((path) => path && path !== "/");
          const counts = {};
          this.app.vault.getMarkdownFiles().forEach((file) => {
            let dir = file.path.split("/").slice(0, -1).join("/");
            while (dir) {
              counts[dir] = (counts[dir] || 0) + 1;
              dir = dir.split("/").slice(0, -1).join("/");
            }
          });
          const detected = detectLayout(folders, counts);
          const applied = Object.entries(detected).filter(([, value]) => value);
          applied.forEach(([key, value]) => {
            this.settings[key] = value;
          });
          this.settings.firstRun = false;
          await this.saveData(this.settings);
          if (applied.length) {
            new Notice(`Desk\uFF1A\u8BC6\u522B\u5230 ${applied.length} \u4E2A\u76EE\u5F55\uFF0C\u5DF2\u81EA\u52A8\u914D\u7F6E\u3002\u8BBE\u7F6E\u91CC\u53EF\u4EE5\u6539\u3002`, 8e3);
          }
          await this.refreshViews();
        }
        async applyTemplate(id) {
          this.settings.template = id;
          this.settings.cards = registry.templateCards(id).join(", ");
          await this.saveSettings();
          const template = registry.TEMPLATES.find((item) => item.id === id);
          new Notice(`Desk\uFF1A\u5DF2\u5207\u6362\u5230\u300C${template ? template.label : id}\u300D`);
          await this.openDesk();
        }
        onunload() {
          window.clearTimeout(this.refreshTimer);
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
            actions.push({ id: "daily-report", label: "\u5199\u4ECA\u5929\u7684\u65E5\u62A5", desc: "\u6253\u5F00\u6216\u65B0\u5EFA\u5F53\u5929\u65E5\u62A5" });
            actions.push({ id: "daily-draft", label: "\u4ECA\u5929\u7684\u8349\u7A3F\u7BB1", desc: "\u5B9A\u4F4D\u5F53\u5929 drafts \u76EE\u5F55" });
          }
          if (this.settings.activeFolder) {
            actions.push({ id: "open-active", label: "\u8FDB\u884C\u4E2D\u7684\u7EBF", desc: "\u8DE8\u5929\u672A\u95ED\u73AF\u7684\u5DE5\u4F5C" });
          }
          if (this.settings.inboxFolder) {
            actions.push({ id: "open-inbox", label: "\u6536\u4EF6\u7BB1", desc: "\u5F85\u5F52\u7C7B\u7684\u6750\u6599" });
          }
          actions.push({ id: "git-sync", label: "Git \u540C\u6B65", desc: "\u8C03\u7528 obsidian-git \u63D0\u4EA4\u5E76\u63A8\u9001" });
          actions.push({ id: "terminal", label: "\u6253\u5F00\u7EC8\u7AEF", desc: "\u8C03\u7528 terminal \u63D2\u4EF6" });
          return actions;
        }
        /** Path of the day folder: <daily>/YYYY-MM/YYYY-MM-DD */
        dayFolder(key) {
          return normalizePath(`${this.settings.dailyFolder}/${key.slice(0, 7)}/${key}`);
        }
        async ensureFolder(path) {
          const parts = normalizePath(path).split("/");
          let current = "";
          for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            if (!this.app.vault.getAbstractFileByPath(current)) {
              try {
                await this.app.vault.createFolder(current);
              } catch (e) {
              }
            }
          }
        }
        async revealDay(key) {
          if (!key || !this.settings.dailyFolder) return;
          const folder = this.dayFolder(key);
          if (!this.app.vault.getAbstractFileByPath(folder)) {
            new Notice(`\u8FD8\u6CA1\u6709 ${key} \u7684\u76EE\u5F55`);
            return;
          }
          this.revealFolder(folder);
        }
        /** Focus a folder in the file explorer. */
        revealFolder(path) {
          if (!path) {
            new Notice("\u8FD9\u4E2A\u5E93\u6CA1\u6709\u914D\u7F6E\u5BF9\u5E94\u76EE\u5F55");
            return;
          }
          const target = this.app.vault.getAbstractFileByPath(normalizePath(path));
          if (!target) {
            new Notice(`\u627E\u4E0D\u5230\u76EE\u5F55\uFF1A${path}`);
            return;
          }
          const explorer = this.app.workspace.getLeavesOfType("file-explorer")[0];
          if (!explorer) {
            new Notice(normalizePath(path));
            return;
          }
          this.app.workspace.revealLeaf(explorer);
          if (explorer.view && explorer.view.revealInFolder) explorer.view.revealInFolder(target);
        }
        async runQuickAction(id) {
          const today = dateKey(/* @__PURE__ */ new Date());
          if (id === "daily-report") return this.openDailyReport(today);
          if (id === "daily-draft") {
            const folder = normalizePath(`${this.dayFolder(today)}/${today}-drafts`);
            await this.ensureFolder(folder);
            this.revealFolder(folder);
            return void 0;
          }
          if (id === "open-active") {
            this.revealFolder(this.settings.activeFolder);
            return void 0;
          }
          if (id === "open-inbox") {
            this.revealFolder(this.settings.inboxFolder);
            return void 0;
          }
          if (id === "git-sync") {
            this.invokeCommand(/^obsidian-git:.*(sync|Sync)/, "obsidian-git \u672A\u542F\u7528");
            return void 0;
          }
          if (id === "terminal") {
            this.invokeCommand(/^terminal:.*(integrated|current)/, "terminal \u63D2\u4EF6\u672A\u542F\u7528");
            return void 0;
          }
          return void 0;
        }
        async openDailyReport(today) {
          const folder = this.dayFolder(today);
          const path = normalizePath(`${folder}/${today}_\u65E5\u62A5.md`);
          let file = this.app.vault.getAbstractFileByPath(path);
          if (!file) {
            await this.ensureFolder(folder);
            const body = [
              "---",
              `date: ${today}`,
              "type: daily-report",
              "status: draft",
              "---",
              "",
              `# ${today} \u65E5\u62A5`,
              "",
              "## \u4ECA\u5929\u505A\u4E86\u4EC0\u4E48",
              "",
              "## \u4EA7\u51FA\u4E0E\u4F4D\u7F6E",
              "",
              "## \u963B\u585E\u4E0E\u98CE\u9669",
              "",
              "## \u4ECA\u5929\u60F3\u6E05\u695A\u7684",
              "",
              "## \u9700\u8981\u786E\u8BA4\u7684\u95EE\u9898",
              ""
            ].join("\n");
            file = await this.app.vault.create(path, body);
          }
          await this.app.workspace.getLeaf("tab").openFile(file);
          return file;
        }
        /** Run another plugin's command by id pattern, without hard-depending on it. */
        invokeCommand(pattern, fallbackMessage) {
          const commands = this.app.commands.listCommands();
          const hit = commands.find((command) => pattern.test(command.id));
          if (!hit) {
            new Notice(fallbackMessage);
            return;
          }
          this.app.commands.executeCommandById(hit.id);
        }
      };
    }
    module2.exports = { makePlugin: makePlugin2, VIEW_TYPE };
  }
});

// src/main.js
var obsidian = require("obsidian");
var { makePlugin } = require_plugin();
var { setDocument } = require_dom();
if (typeof document !== "undefined") setDocument(document);
module.exports = makePlugin(obsidian);

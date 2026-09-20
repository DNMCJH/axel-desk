'use strict';

/**
 * Test harness: a fake Obsidian `app` backed by a real directory tree, plus a
 * loader that requires the built bundle with `obsidian` redirected to the stub.
 *
 * Fidelity notes learned the hard way:
 *  - getFileCache must be memoised. Real Obsidian answers from memory; a harness
 *    that reads the file on every call turns a 700-file scan into thousands of
 *    synchronous reads and produces bogus performance numbers.
 *  - The cache must include `sections`, or the scanner's code-fence pre-filter
 *    silently skips files and language counts come out wrong.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const HERE = __dirname;
const STUB = path.join(HERE, 'obsidian_stub.js');

/** Require a module with `obsidian` resolved to the stub. */
function requireWithStub(target) {
  const original = Module._resolveFilename;
  Module._resolveFilename = function patched(request, ...rest) {
    if (request === 'obsidian') return STUB;
    return original.call(this, request, ...rest);
  };
  try {
    delete require.cache[require.resolve(target)];
    return require(target);
  } finally {
    Module._resolveFilename = original;
  }
}

function makeFile(absPath, vaultRoot) {
  const stat = fs.statSync(absPath);
  const rel = path.relative(vaultRoot, absPath).split(path.sep).join('/');
  const name = path.basename(rel);
  const extension = path.extname(name).slice(1);
  return {
    path: rel,
    name,
    basename: name.replace(/\.[^.]+$/, ''),
    extension,
    stat: { mtime: stat.mtimeMs, ctime: stat.ctimeMs, size: stat.size },
    _abs: absPath,
  };
}

/**
 * Build the vault index from a real directory.
 * `limitTo` optionally restricts the walk to a subfolder for faster tests.
 */
function buildVault(vaultRoot, { limitTo = '', maxDepth = 12 } = {}) {
  const files = [];
  const folders = new Map();

  function ensureFolder(rel) {
    if (folders.has(rel)) return folders.get(rel);
    const node = { path: rel, name: rel.split('/').pop() || '/', children: [] };
    folders.set(rel, node);
    return node;
  }
  ensureFolder('');

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(vaultRoot, abs).split(path.sep).join('/');
      const parentRel = rel.split('/').slice(0, -1).join('/');
      if (entry.isDirectory()) {
        const node = ensureFolder(rel);
        ensureFolder(parentRel).children.push(node);
        walk(abs, depth + 1);
      } else {
        const file = makeFile(abs, vaultRoot);
        files.push(file);
        ensureFolder(parentRel).children.push(file);
      }
    }
  }

  const start = limitTo ? path.join(vaultRoot, limitTo) : vaultRoot;
  walk(start, 0);
  return { files, folders };
}

/** Parse just enough of a note to answer metadataCache questions. */
function buildCache(content) {
  const lines = content.split(/\r?\n/);
  const listItems = [];
  const sections = [];
  const links = [];
  let frontmatter = null;

  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      frontmatter = {};
      for (let i = 1; i < end; i += 1) {
        const hit = lines[i].match(/^([A-Za-z0-9_一-龥-]+):\s*(.*)$/);
        if (hit) frontmatter[hit[1]] = hit[2].replace(/^["']|["']$/g, '');
      }
    }
  }

  let inFence = false;
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      if (!inFence) sections.push({ type: 'code', position: { start: { line: index } } });
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const task = line.match(/^\s*[-*+]\s+\[( |x|X|\/|-)\]/);
    if (task) {
      listItems.push({ task: task[1], position: { start: { line: index } } });
    } else if (/^\s*[-*+]\s+/.test(line)) {
      listItems.push({ position: { start: { line: index } } });
    }
    for (const match of line.matchAll(/\[\[([^\]|#^]+)/g)) {
      links.push({ link: match[1].trim() });
    }
  });

  return { frontmatter, listItems, sections, links };
}

/** Fake `app` object with the surface the plugin actually uses. */
function makeApp(vaultRoot, options = {}) {
  const { files, folders } = buildVault(vaultRoot, options);
  const byPath = new Map();
  files.forEach((file) => byPath.set(file.path, file));
  folders.forEach((folder, rel) => { if (rel) byPath.set(rel, folder); });

  const cacheStore = new Map();
  const reads = { count: 0 };

  function readSync(file) {
    reads.count += 1;
    try { return fs.readFileSync(file._abs, 'utf8'); } catch { return ''; }
  }

  const app = {
    vault: {
      getMarkdownFiles: () => files.filter((file) => file.extension === 'md'),
      getFiles: () => files,
      getAllLoadedFiles: () => [...files, ...folders.values()].filter((node) => node.path !== undefined),
      getAbstractFileByPath: (target) => byPath.get(target) || null,
      cachedRead: async (file) => readSync(file),
      read: async (file) => readSync(file),
      /**
       * Writes AND refreshes the file's stat, because Obsidian does.
       *
       * Without the stat bump this fake was unfaithful in a way that hid real
       * behaviour: `getFileCache` is memoised on `path::mtime`, so a modified note
       * kept serving its pre-write frontmatter forever and any test of a
       * write-then-reread path failed against correct code.
       */
      async modify(file, content) {
        fs.writeFileSync(file._abs, content, 'utf8');
        const st = fs.statSync(file._abs);
        // Coarse filesystem timestamps can round to the same millisecond as the
        // previous write, which would silently restore the staleness above.
        file.stat.mtime = Math.max(st.mtimeMs, file.stat.mtime + 1);
        file.stat.size = st.size;
      },
      async create(target, content) {
        const abs = path.join(vaultRoot, target);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, 'utf8');
        const file = makeFile(abs, vaultRoot);
        files.push(file);
        byPath.set(file.path, file);
        return file;
      },
      async createFolder(target) {
        fs.mkdirSync(path.join(vaultRoot, target), { recursive: true });
        const node = { path: target, name: target.split('/').pop(), children: [] };
        folders.set(target, node);
        byPath.set(target, node);
        return node;
      },
      on: () => ({ id: 'evt' }),
      /**
       * The low-level adapter, which unlike the file index DOES see dot-folders.
       * Needed because packaged skills live in `.claude/skills/…` and Obsidian
       * deliberately excludes those from `getMarkdownFiles`/`getAbstractFileByPath`.
       */
      adapter: {
        async list(target) {
          const abs = path.join(vaultRoot, target);
          let entries;
          try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch {
            throw new Error(`ENOENT: ${target}`);
          }
          const out = { files: [], folders: [] };
          entries.forEach((entry) => {
            const rel = target ? `${target}/${entry.name}` : entry.name;
            if (entry.isDirectory()) out.folders.push(rel);
            else out.files.push(rel);
          });
          return out;
        },
        async read(target) {
          reads.count += 1;
          return fs.readFileSync(path.join(vaultRoot, target), 'utf8');
        },
        async stat(target) {
          const st = fs.statSync(path.join(vaultRoot, target));
          return { type: st.isDirectory() ? 'folder' : 'file', mtime: st.mtimeMs, size: st.size };
        },
        async exists(target) {
          return fs.existsSync(path.join(vaultRoot, target));
        },
        /**
         * Obsidian returns an `app://` URL with a cache-busting token. The shape
         * matters more than the scheme here: the test only needs to confirm the
         * plugin asks the adapter rather than building a path itself.
         */
        getResourcePath(target) {
          return `app://local/${target.split('/').map(encodeURIComponent).join('/')}?1`;
        },
      },
    },
    metadataCache: {
      // Memoised by path+mtime, mirroring Obsidian's in-memory cache.
      getFileCache(file) {
        if (!file || file.extension !== 'md') return null;
        const key = `${file.path}::${file.stat.mtime}`;
        if (cacheStore.has(key)) return cacheStore.get(key);
        const parsed = buildCache(readSync(file));
        cacheStore.set(key, parsed);
        return parsed;
      },
      on: () => ({ id: 'evt' }),
    },
    workspace: {
      _leaves: [],
      getLeavesOfType: () => [],
      getLeaf: () => ({ openFile: async () => {}, setViewState: async () => {}, view: null }),
      revealLeaf: () => {},
      onLayoutReady: (cb) => cb(),
      on: () => ({ id: 'evt' }),
    },
    commands: {
      listCommands: () => [{ id: 'obsidian-git:sync' }, { id: 'terminal:open-integrated' }],
      executeCommandById: () => true,
    },
    plugins: {
      manifests: { desk: { name: 'Desk' }, dataview: { name: 'Dataview' }, 'obsidian-git': { name: 'Git' } },
      enabledPlugins: new Set(['desk', 'dataview', 'obsidian-git']),
    },
  };

  return { app, files, folders, reads, cacheStore };
}

module.exports = { requireWithStub, makeApp, buildVault, buildCache, STUB };

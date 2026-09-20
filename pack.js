'use strict';

/**
 * Build a distributable zip.
 *
 * Output contains exactly the three files Obsidian needs (main.js, manifest.json,
 * styles.css) inside an `axel-desk/` folder, so a recipient can drop it straight into
 * their vault's plugins directory. Source, tests and node_modules are excluded:
 * a plugin package should not carry the toolchain that made it.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HERE = __dirname;
const SHIP = ['main.js', 'manifest.json', 'styles.css'];
const EXTRA = ['README.md', 'AGENT.md', 'LICENSE'];
const PLUGIN_ID = 'axel-desk';

function fail(message) {
  console.error(`[pack] ${message}`);
  process.exit(1);
}

// 1. rebuild so the bundle can never lag behind src/
const build = spawnSync(process.execPath, [path.join(HERE, 'esbuild.config.js')], { stdio: 'inherit' });
if (build.status !== 0) fail('build failed');

// 2. verify the shipping set
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
if (manifest.id !== PLUGIN_ID) fail(`manifest id must be ${PLUGIN_ID}, got ${manifest.id}`);
SHIP.forEach((name) => {
  if (!fs.existsSync(path.join(HERE, name))) fail(`missing required file: ${name}`);
});

// The bundle must not contain a relative require: that would mean esbuild failed
// to inline a module and the plugin would break at load time in Obsidian.
const bundle = fs.readFileSync(path.join(HERE, 'main.js'), 'utf8');
if (/require\(['"]\.\.?\//.test(bundle)) fail('bundle still contains a relative require');
if (!/require\(['"]obsidian['"]\)/.test(bundle)) fail('bundle does not require obsidian');
// Review rule: no innerHTML/outerHTML assignment anywhere in shipped code.
const htmlWrite = bundle.match(/\.(inner|outer)HTML\s*=/g);
if (htmlWrite) fail(`bundle assigns ${htmlWrite[0]} — build DOM nodes instead`);

// 3. stage and zip
const version = manifest.version;
const outDir = path.join(HERE, 'dist');
const stage = path.join(outDir, PLUGIN_ID);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
[...SHIP, ...EXTRA].forEach((name) => {
  const from = path.join(HERE, name);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(stage, name));
});

const zipName = `${PLUGIN_ID}-${version}.zip`;
const zipPath = path.join(outDir, zipName);
/**
 * Write the archive ourselves rather than shelling out to Compress-Archive.
 *
 * Windows PowerShell 5.1's Compress-Archive stores entry names with BACKSLASH
 * separators, which violates the zip spec (APPNOTE 4.4.17.1: "all slashes MUST
 * be forward slashes"). Windows tools tolerate it; `unzip` on macOS and Linux
 * does not — it produces five files literally named `desk\main.js` instead of a
 * `axel-desk/` folder, so Obsidian never sees the plugin. That makes the archive
 * broken for exactly the recipients it is meant for.
 *
 * Deflate via zlib, no external binary, separators under our control.
 */
writeZip(zipPath, [...SHIP, ...EXTRA]
  .filter((name) => fs.existsSync(path.join(stage, name)))
  .map((name) => ({ entry: `${PLUGIN_ID}/${name}`, file: path.join(stage, name) })));

function writeZip(target, items) {
  const zlib = require('zlib');
  const locals = [];
  const central = [];
  let offset = 0;

  for (const { entry, file } of items) {
    const raw = fs.readFileSync(file);
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    // Only store the deflated form if it actually helps.
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    const nameBuf = Buffer.from(entry, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // local file header signature
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0x0800, 6);       // flag: UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);           // time (fixed: reproducible output)
    local.writeUInt16LE(0x21, 12);        // date (fixed)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // no extra field
    locals.push(local, nameBuf, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);     // central directory signature
    dir.writeUInt16LE(20, 4);             // version made by
    dir.writeUInt16LE(20, 6);             // version needed
    dir.writeUInt16LE(0x0800, 8);         // flag: UTF-8 names
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0x21, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt16LE(0, 30);             // extra length
    dir.writeUInt16LE(0, 32);             // comment length
    dir.writeUInt16LE(0, 34);             // disk number
    dir.writeUInt16LE(0, 36);             // internal attrs
    // Unix mode 0644 in the high 16 bits. `<< 16` overflows into a negative
    // int32, so coerce to unsigned before writing.
    dir.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    dir.writeUInt32LE(offset, 42);        // offset of local header
    central.push(dir, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(items.length, 8);
  end.writeUInt16LE(items.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  fs.writeFileSync(target, Buffer.concat([...locals, centralBuf, end]));
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

// 4. optionally install straight into a vault. The dev tree deliberately lives
// outside any vault so node_modules is never cloud-synced, which means the built
// files have to be copied in. `npm run install-to -- <vault>`, DESK_VAULT, or the
// same .test/vault-path.local the test suites already resolve from.
//
// Resolving from that file matters: when --install could only read DESK_VAULT, an
// unset variable made `npm run install-to` print a success-looking log and copy
// nothing, so a verified fix stayed invisible in the running app. A requested
// install that finds no vault must fail loudly, never silently succeed.
const explicitTarget = process.env.DESK_INSTALL_VAULT || argVault();
const wantsInstall = explicitTarget || process.argv.includes('--install');

function argVault() {
  const flag = process.argv.indexOf('--vault');
  if (flag !== -1 && process.argv[flag + 1]) return process.argv[flag + 1];
  // trailing positional path, e.g. `npm run install-to -- B:\Obsidian`
  const positional = process.argv.slice(2).find((arg) => !arg.startsWith('-'));
  return positional || null;
}

if (wantsInstall) {
  let installTarget = explicitTarget;
  if (!installTarget) {
    const { resolveVault } = require(path.join(HERE, '.test', 'vault-path'));
    installTarget = resolveVault();
  }
  if (!fs.existsSync(path.join(installTarget, '.obsidian'))) {
    fail(`not a vault (no .obsidian): ${installTarget}`);
  }
  const pluginDir = path.join(installTarget, '.obsidian', 'plugins', PLUGIN_ID);
  fs.mkdirSync(pluginDir, { recursive: true });
  SHIP.forEach((name) => fs.copyFileSync(path.join(HERE, name), path.join(pluginDir, name)));
  // Report the bytes actually landed, so a stale copy cannot hide behind a
  // success message.
  const stamps = SHIP.map((name) => {
    const st = fs.statSync(path.join(pluginDir, name));
    return `${name} ${(st.size / 1024).toFixed(1)}KB`;
  }).join(' · ');
  console.log(`\n[pack] installed to ${pluginDir}`);
  console.log(`[pack] ${stamps}`);
  console.log('[pack] reload Obsidian to pick it up');
}

const size = fs.statSync(zipPath).size;
console.log(`\n[pack] ${zipName} — ${(size / 1024).toFixed(1)} KB`);
console.log('[pack] contents:');
[...SHIP, ...EXTRA]
  .filter((name) => fs.existsSync(path.join(stage, name)))
  .forEach((name) => {
    const bytes = fs.statSync(path.join(stage, name)).size;
    console.log(`         ${PLUGIN_ID}/${name.padEnd(14)} ${(bytes / 1024).toFixed(1)} KB`);
  });
console.log('\n[pack] install: unzip into <vault>/.obsidian/plugins/ then enable in Settings › Community plugins');

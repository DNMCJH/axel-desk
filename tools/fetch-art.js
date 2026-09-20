'use strict';

/**
 * Download public-domain artwork into a vault folder, for the gallery card.
 *
 * WHY THIS IS A SEPARATE SCRIPT AND NOT PART OF THE PLUGIN
 * The plugin promises "local only, never connects", which is also a community-store
 * review line. Fetching images at runtime would break both. So the network step
 * happens here, once, on the developer's machine: the result is ordinary files in
 * the user's vault, and the plugin keeps reading nothing but local files.
 *
 * SOURCE AND LICENCE
 * Art Institute of Chicago public API. Only records with `is_public_domain: true`
 * are downloaded — no rights-reserved images, ever. Their metadata is CC0. A
 * CREDITS.md is written next to the images recording artist, title, date and source
 * id, because attribution should survive even when it is not legally required.
 *
 * Usage:
 *   node tools/fetch-art.js "<vault>/path/to/folder"            # curated set
 *   node tools/fetch-art.js "<vault>/folder" --query "Hiroshige" --limit 8
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * The Metropolitan Museum of Art Open Access API.
 *
 * Not the Art Institute of Chicago, which was the first choice: its metadata API is
 * open but its IIIF image endpoint returns 403 to any server-side request (verified
 * on plain curl, a browser UA, and info.json alike). An API whose images cannot be
 * downloaded is no use here. The Met serves images without blocking and marks Open
 * Access works `isPublicDomain: true`, which is the field this script gates on.
 */
const API = 'https://collectionapi.metmuseum.org/public/collection/v1';
// `primaryImageSmall` is ~600px and too soft for a large tile; `primaryImage` is the
// full scan, usually 1500–3000px — good detail without the 8000px archival files.
const PREFER_FULL = true;

/**
 * A deliberately calm, mixed-origin default set.
 *
 * Chosen to sit behind working text rather than compete with it: ukiyo-e
 * landscapes, impressionist water, a few quiet interiors. No portraits staring at
 * the reader, no high-contrast abstraction.
 */
const CURATED = [
  // Ukiyo-e woodblock prints — closest to an illustration/graphic style, and the
  // flat colour holds up at tile size better than oil painting detail.
  45434,  // Hokusai — Under the Wave off Kanagawa (The Great Wave)
  36534,  // Hiroshige — Sailing Boats Returning to Yabase, Lake Biwa
  53449,  // Hiroshige — Six Jewel Rivers from Various Provinces
  54344,  // Yashima Gakutei — surimono print, ca. 1830
  55614,  // Utagawa Sadahide — woodblock print, 1861
  58212,  // Utagawa Kunisada — woodblock print
  // East Asian ink painting — quiet, lots of empty space, sits behind text well.
  40057,  // Li Jie — Fisherman's Lodge at Mount Xisai, ca. 1170
  39901,  // Han Gan — Night-Shining White, ca. 750
  44759,  // Chen Hongshou — Landscapes, Figures, and Flowers
  // European landscape — for contrast in colour and mood.
  436535, // Van Gogh — Wheat Field with Cypresses
  437980, // Van Gogh — Cypresses
  435809, // Bruegel the Elder — The Harvesters
  437853, // Turner — Venice, from the Porch of Madonna della Salute
  438816, // Théodore Rousseau — The Forest in Winter at Sunset
  437526, // Rubens — A Forest at Dawn with a Deer Hunt
  437430, // Renoir — By the Seashore
];

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'desk-plugin-art-fetch/1.0' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'desk-plugin-art-fetch/1.0' } }, (res) => {
      // IIIF redirects; follow one hop rather than failing.
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume();
        file.close();
        fs.unlinkSync(dest);
        download(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(fs.statSync(dest).size)));
    }).on('error', (error) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(error);
    });
  });
}

/** Titles that carry no information and must not become a caption. */
const PLACEHOLDER_TITLE = /^(print|untitled|drawing|fragment|sheet|page|album leaf|study)$/i;

/** Filesystem-safe, human-readable, and stable across runs. */
function safeName(item) {
  const clean = (value) => String(value || '')
    // Windows-illegal characters only. Spaces and hyphens are legal in filenames;
    // stripping them produced run-together names like "VincentvanGogh".
    .replace(/[<>:"/\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 52);
  const artist = clean(item.artistDisplayName) || 'Unknown';
  let title = clean(item.title);
  // Thousands of Met print records are titled literally "Print". The gallery card
  // shows the filename as its caption, so that caption has to say something:
  // fall back to medium + date, which does.
  if (!title || PLACEHOLDER_TITLE.test(title)) {
    const medium = clean(String(item.medium || '').split(/[;,(]/)[0]);
    const era = clean(item.objectDate);
    title = [medium || 'Work', era].filter(Boolean).join(', ');
  }
  return `${artist} - ${title} (${item.objectID}).jpg`;
}

async function main() {
  const [, , target, ...rest] = process.argv;
  if (!target) {
    console.error('usage: node tools/fetch-art.js "<vault>/folder" [--query "…"] [--limit N]');
    process.exit(1);
  }
  const queryIndex = rest.indexOf('--query');
  const limitIndex = rest.indexOf('--limit');
  const query = queryIndex !== -1 ? rest[queryIndex + 1] : '';
  const limit = limitIndex !== -1 ? Math.max(1, Number(rest[limitIndex + 1]) || 8) : 8;

  let ids = CURATED;
  if (query) {
    const search = await getJson(`${API}/search?q=${encodeURIComponent(query)}`
      + '&hasImages=true&isPublicDomain=true');
    ids = (search.objectIDs || []).slice(0, limit);
    if (!ids.length) {
      console.error(`no public-domain results for "${query}"`);
      process.exit(1);
    }
  }

  // One request per object: the Met has no batch endpoint. Sequential rather than
  // parallel to stay polite to a free public API.
  const records = [];
  for (const id of ids) {
    try {
      records.push(await getJson(`${API}/objects/${id}`));
    } catch (error) {
      console.error(`  metadata failed for ${id}: ${error.message}`);
    }
  }

  // Hard gate: never download a rights-reserved image, whatever the search said.
  const usable = records.filter((item) => item.isPublicDomain
    && (PREFER_FULL ? (item.primaryImage || item.primaryImageSmall) : item.primaryImageSmall));
  const skipped = records.length - usable.length;

  fs.mkdirSync(target, { recursive: true });
  const existing = fs.readdirSync(target).filter((name) => /\.jpe?g$/i.test(name));
  const credits = [];
  let bytes = 0;
  for (const item of usable) {
    const name = safeName(item);
    const dest = path.join(target, name);
    /**
     * Dedupe on the object id, not the filename.
     *
     * The filename embeds a truncated title, so improving the naming rule between
     * runs changed it — and `existsSync(dest)` then missed the file already on disk
     * and downloaded The Great Wave a second time under a slightly different name.
     * The id in `(45434)` is the stable identity; match on that.
     */
    const already = existing.find((file) => file.includes(`(${item.objectID})`));
    if (already) {
      console.log(`  skip (exists)  ${already}`);
      credits.push(item);
      continue;
    }
    const url = (PREFER_FULL && item.primaryImage) ? item.primaryImage : item.primaryImageSmall;
    try {
      const size = await download(url, dest);
      bytes += size;
      console.log(`  ${(size / 1024).toFixed(0).padStart(5)} KB  ${name}`);
      credits.push(item);
    } catch (error) {
      console.error(`  FAILED         ${name}: ${error.message}`);
    }
  }

  const lines = [
    '# 图片来源与版权',
    '',
    '这些图片由 `tools/fetch-art.js` 从 **大都会艺术博物馆（The Met）Open Access**',
    'API 下载，**全部为公有领域（public domain）作品**，可自由使用（含商用）。',
    '',
    '插件本身不联网、不内置图片。这些是下载到 Vault 里的普通文件，',
    '「画面墙」卡片只是读取本地目录。',
    '',
    '| 作者 | 作品 | 年代 | 来源 |',
    '| --- | --- | --- | --- |',
    ...credits.map((item) => `| ${item.artistDisplayName || '—'} | ${item.title} | ${item.objectDate || '—'} `
      + `| [metmuseum.org/art/collection/search/${item.objectID}](${item.objectURL}) |`),
    '',
    `元数据许可：CC0。下载时间：${new Date().toISOString().slice(0, 10)}。`,
    '',
  ];
  fs.writeFileSync(path.join(target, 'CREDITS.md'), lines.join('\n'), 'utf8');

  console.log(`\n${credits.length} images in ${target}`);
  console.log(`total ${(bytes / 1024 / 1024).toFixed(1)} MB${skipped ? ` · ${skipped} skipped (not public domain)` : ''}`);
  console.log('CREDITS.md written');
}

main().catch((error) => { console.error(error.message || error); process.exit(1); });

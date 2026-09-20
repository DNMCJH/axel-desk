'use strict';

/**
 * Downscale images in place, using the Chromium that playwright already provides.
 *
 * Why this exists: the art fetch pulled 36.6 MB for ten pictures (one 8 MB) into a
 * OneDrive-synced vault. Museum scans are archival; a dashboard tile is ~400px. That
 * is 30+ MB of cloud sync and disk for detail nobody can see — the same class of
 * mistake as installing node_modules inside the vault.
 *
 * Chromium rather than sharp: sharp means a native dependency in a project whose
 * whole point is shipping three files, and playwright is already a dev dependency
 * for the geometry tests. No new install.
 *
 * Usage: node tools/shrink-images.js "<folder>" [maxEdge] [quality]
 */

const fs = require('fs');
const path = require('path');

const MAX_EDGE = 1600;
const QUALITY = 0.82;

async function main() {
  const [, , target, edgeArg, qualityArg] = process.argv;
  if (!target) {
    console.error('usage: node tools/shrink-images.js "<folder>" [maxEdge] [quality]');
    process.exit(1);
  }
  const maxEdge = Math.max(200, Number(edgeArg) || MAX_EDGE);
  const quality = Math.min(0.98, Math.max(0.4, Number(qualityArg) || QUALITY));

  const files = fs.readdirSync(target)
    .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
    .map((name) => path.join(target, name));
  if (!files.length) {
    console.log('no images found');
    return;
  }

  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  let before = 0;
  let after = 0;
  try {
    const page = await browser.newPage();
    for (const file of files) {
      const original = fs.statSync(file).size;
      before += original;
      const data = fs.readFileSync(file).toString('base64');
      const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
      const encoded = await page.evaluate(async ({ src, edge, q }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const scale = Math.min(1, edge / Math.max(img.width, img.height));
        // Already small enough: report so the caller can leave it untouched rather
        // than re-encoding (which would lose quality for no size win).
        if (scale >= 1) return null;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return {
          data: canvas.toDataURL('image/jpeg', q).split(',')[1],
          w: canvas.width,
          h: canvas.height,
        };
      }, { src: `data:${mime};base64,${data}`, edge: maxEdge, q: quality });

      if (!encoded) {
        after += original;
        console.log(`  keep    ${(original / 1024).toFixed(0).padStart(5)} KB  ${path.basename(file)}`);
        continue;
      }
      // Write as .jpg: a downscaled photo has no reason to stay PNG, and PNG would
      // often come out larger than the source.
      const out = file.replace(/\.(png|jpe?g|webp)$/i, '.jpg');
      fs.writeFileSync(out, Buffer.from(encoded.data, 'base64'));
      if (out !== file) fs.unlinkSync(file);
      const size = fs.statSync(out).size;
      after += size;
      console.log(`  ${(original / 1024).toFixed(0).padStart(5)} → ${(size / 1024).toFixed(0).padStart(5)} KB  `
        + `${encoded.w}×${encoded.h}  ${path.basename(out)}`);
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${(before / 1024 / 1024).toFixed(1)} MB → ${(after / 1024 / 1024).toFixed(1)} MB`
    + ` (${Math.round((1 - after / before) * 100)}% smaller)`);
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });

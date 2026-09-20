'use strict';

/**
 * Bundle src/ into a single main.js.
 *
 * Obsidian loads main.js as one CommonJS module and does not resolve relative
 * requires inside a plugin folder, so the source tree must be bundled. `obsidian`
 * and electron/node builtins are external: the host supplies them at runtime.
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');
const HERE = __dirname;

const banner = `/*
 * Desk — local workspace dashboard for Obsidian
 * Generated from src/. Do not edit main.js directly; edit src/ and run: npm run build
 */`;

const options = {
  entryPoints: [path.join(HERE, 'src', 'main.js')],
  outfile: path.join(HERE, 'main.js'),
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: false,
  // Keep the output readable: reviewers and users do read plugin bundles, and a
  // minified file makes debugging a card error report impossible.
  minify: false,
  treeShaking: true,
  banner: { js: banner },
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    'node:fs',
    'node:path',
  ],
};

async function run() {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('[desk] watching src/…');
    return;
  }
  const result = await esbuild.build(options);
  const size = fs.statSync(options.outfile).size;
  console.log(`[desk] built main.js — ${(size / 1024).toFixed(1)} KB`);
  if (result.warnings.length) console.log(`[desk] ${result.warnings.length} warning(s)`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

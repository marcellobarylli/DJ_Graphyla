/// <reference types="vitest/config" />
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig, runnerImport, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };
import type { ShopEntry, ShopIndex } from './src/domain/recordShop.ts';

type ShopModule = typeof import('./src/domain/recordShop.ts');
const SHOP_DIR = 'record-shop';

/** Unique per build; the running app compares it with the deployed version.json. */
const BUILD_ID = `${pkg.version}+${Date.now().toString(36)}`;

/** Writes version.json next to index.html so an open app can tell a newer deploy exists. */
function versionFile(): Plugin {
  return {
    name: 'dj-graphyla-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version, build: BUILD_ID }) });
    },
  };
}

/**
 * Reads the record shop (record-shop/<login>/<crate>.json in the repo), using
 * the app's own parser (loaded through Vite, so the config needs no TS imports).
 * Files that aren't valid crates are skipped with a warning, so one broken
 * upload never stops a deploy.
 */
async function collectShop(root: string, warn: (msg: string) => void): Promise<{ index: ShopIndex; files: Map<string, string> }> {
  const { module: shop } = await runnerImport<ShopModule>(join(root, 'src/domain/recordShop.ts'), { configFile: false, logLevel: 'error' });
  const { MAX_SHOP_FILE_BYTES, dedupeShopEntries, summarizeShopFile } = shop;
  const dir = join(root, SHOP_DIR);
  const files = new Map<string, string>();
  const entries: ShopEntry[] = [];
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const full = join(folder, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.json')) {
        const path = relative(dir, full).split(sep).join('/');
        if (statSync(full).size > MAX_SHOP_FILE_BYTES) {
          warn(`record shop: skipped ${path} (larger than ${MAX_SHOP_FILE_BYTES / 1024 / 1024} MB)`);
          continue;
        }
        const text = readFileSync(full, 'utf8');
        try {
          entries.push(summarizeShopFile(path, text));
          files.set(path, text);
        } catch (err) {
          warn(`record shop: skipped ${path}: ${(err as Error).message}`);
        }
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  // One entry per crate (sharing a crate again syncs its file); list the newest copy of any duplicate.
  const unique = dedupeShopEntries(entries);
  for (const h of unique.hidden) warn(`record shop: ${h.path} is another copy of crate “${h.name}”; listing the newest copy only`);
  return { index: { generatedAt: new Date().toISOString(), entries: unique.entries }, files };
}

/** Publishes the record shop with the site: record-shop/index.json plus every crate file. */
function recordShop(): Plugin {
  let root = process.cwd();
  return {
    name: 'dj-graphyla-record-shop',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use(`/${SHOP_DIR}/`, (req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0]!.replace(/^\//, ''));
        collectShop(root, (m) => server.config.logger.warn(m)).then(({ index, files }) => {
          const body = path === 'index.json' ? JSON.stringify(index) : files.get(path);
          if (body === undefined) return next();
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(body);
        }, next);
      });
    },
    async generateBundle() {
      const { index, files } = await collectShop(root, (m) => this.warn(m));
      this.emitFile({ type: 'asset', fileName: `${SHOP_DIR}/index.json`, source: JSON.stringify(index) });
      for (const [path, text] of files) this.emitFile({ type: 'asset', fileName: `${SHOP_DIR}/${path}`, source: text });
    },
  };
}

export default defineConfig({
  // Relative base so the build works on GitHub Pages (/DJ_Graphyla/) and any other host.
  base: './',
  plugins: [react(), versionFile(), recordShop()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});

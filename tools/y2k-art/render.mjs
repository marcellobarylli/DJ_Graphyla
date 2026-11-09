/**
 * Renders the Y2K Futurism pictures (tools/y2k-art/render.js) in headless
 * Chromium and writes them to src/assets/y2k/ as WebP.
 *
 *   npm run art:y2k            (all of them)
 *   npm run art:y2k -- man     (only the named scenes)
 *
 * Needs Playwright with Chromium on the machine (it is not a project
 * dependency): `npm i -g playwright && npx playwright install chromium`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'src', 'assets', 'y2k');
const ALL = ['orb-portrait', 'orb-landscape', 'torus', 'blob', 'man', 'woman'];
// `npm run art:y2k -- man woman` renders only the named scenes.
const SCENES = process.argv.length > 2 ? process.argv.slice(2) : ALL;

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const from of [root, process.cwd()]) {
    try {
      return require(require.resolve('playwright', { paths: [from] }));
    } catch {
      /* try the next place */
    }
  }
  try {
    return require('playwright');
  } catch {
    throw new Error('Playwright not found. Install it with: npm i -g playwright && npx playwright install chromium');
  }
}

const { chromium } = loadPlaywright();
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { port: 0 },
  // Pre-bundle three up front so the page doesn't reload mid-render.
  optimizeDeps: { entries: ['tools/y2k-art/index.html'] },
});
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
try {
  await mkdir(outDir, { recursive: true });
  for (const scene of SCENES) {
    const page = await browser.newPage();
    page.on('console', (m) => m.type() === 'error' && console.error(`  [${scene}] ${m.text()}`));
    page.on('pageerror', (e) => console.error(`  [${scene}] ${e}`));
    await page.goto(`${base}tools/y2k-art/?scene=${scene}`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__art, null, { timeout: 120_000 });
    const art = await page.evaluate(() => window.__art);
    if (art.error) throw new Error(`${scene}: ${art.error}`);
    if (!art.dataUrl.startsWith('data:image/webp')) throw new Error(`${scene}: the browser did not encode WebP`);
    const bytes = Buffer.from(art.dataUrl.split(',')[1], 'base64');
    await writeFile(join(outDir, `${scene}.webp`), bytes);
    console.log(`${scene}.webp  ${(bytes.length / 1024).toFixed(1)} KB`);
    if (art.anchors) {
      // Points on the figures (in picture pixels) for the page's lightning.
      const file = join(outDir, 'figures.json');
      const all = JSON.parse(await readFile(file, 'utf8').catch(() => '{}'));
      all[scene] = { width: art.width, height: art.height, ...art.anchors };
      await writeFile(file, JSON.stringify(all, null, 2) + '\n');
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

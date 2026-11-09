/**
 * The app icon: an abstract, alien lowercase “g” in the spirit of Paul
 * Nicholson's Xylem lettering, which is built from circles on a circular
 * grid (an original drawing, not the Xylem font). Two crescents, each a
 * circle with an offset circle cut out of it, make the bowl and the hook;
 * a hairline stem joins them and ends in a single node. One colour on
 * black, with a faint glow.
 *
 *   npm run icons     writes public/graphyla-g*.{svg,png}
 *
 * Needs Playwright with Chromium (like npm run art:y2k).
 */
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = (name) => join(root, 'public', name);

/** @param {{ rounded: boolean; scale?: number; ink?: string; glow?: string }} o */
export function iconSvg({ rounded, scale = 1, ink = '#e9eef8', glow = '#8fd8ff' }) {
  // Construction on the 512 grid: each crescent = outer circle minus an offset inner circle.
  const bowl = { outer: [250, 206, 96], inner: [274, 199, 88] };
  const hook = { outer: [250, 326, 104], inner: [247, 299, 98] };
  const stem = { x: 340.5, top: 150, bottom: 352, width: 6 };
  const node = { x: 340.5, y: 128, r: 10 };
  // Centre the glyph (bounds measured from the shapes above).
  const dx = 256 - 250;
  const dy = 256 - (node.y - node.r + hook.outer[1] + hook.outer[2]) / 2;
  const c = ([x, y, r]) => `cx="${x}" cy="${y}" r="${r}"`;
  const glyph = `
      <circle ${c(bowl.outer)} mask="url(#cut-bowl)"/>
      <circle ${c(hook.outer)} mask="url(#cut-hook)"/>
      <rect x="${stem.x - stem.width / 2}" y="${stem.top}" width="${stem.width}" height="${stem.bottom - stem.top}" rx="${stem.width / 2}"/>
      <circle cx="${node.x}" cy="${node.y}" r="${node.r}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="0.45" cy="0.35" r="0.9">
      <stop offset="0" stop-color="#0d1020"/><stop offset="1" stop-color="#040508"/>
    </radialGradient>
    <mask id="cut-bowl" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <rect width="512" height="512" fill="#fff"/><circle ${c(bowl.inner)} fill="#000"/>
    </mask>
    <mask id="cut-hook" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <rect width="512" height="512" fill="#fff"/><circle ${c(hook.inner)} fill="#000"/>
    </mask>
    <filter id="haze" filterUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
  </defs>
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${scale}) translate(${dx - 256} ${dy - 256})">
    <g fill="${glow}" opacity="0.45" filter="url(#haze)">${glyph}
    </g>
    <g fill="${ink}">${glyph}
    </g>
  </g>
</svg>
`;
}

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const from of [root, process.cwd()]) {
    try {
      return require(require.resolve('playwright', { paths: [from] }));
    } catch {
      /* next */
    }
  }
  return require('playwright');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const any = iconSvg({ rounded: true });
  const square = iconSvg({ rounded: false });
  // Maskable icons are cropped to a circle of 80% (and more): keep the glyph well inside.
  const maskable = iconSvg({ rounded: false, scale: 0.78 });
  await writeFile(out('graphyla-g.svg'), any);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const png = async (svg, size, name, transparent) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: out(name), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
    console.log(name);
  };
  await png(any, 192, 'graphyla-g-192.png', true);
  await png(any, 512, 'graphyla-g-512.png', true);
  await png(maskable, 512, 'graphyla-g-maskable-512.png', false);
  // iOS rounds the corners itself and shows transparent corners as black: full-bleed square.
  await png(square, 180, 'graphyla-g-apple-touch.png', false);
  await browser.close();
}

/**
 * The app icon: a lowercase “g” built the way Paul Nicholson drew his
 * Xylem lettering, with circle templates and a ruler (an original drawing,
 * not the Xylem font or the Aphex Twin logo). The bowl is a circle; the
 * stem is a straight line tangent to it; the hook is an arc of an equal
 * circle. One even stroke with rounded ends and no points, in one silver
 * tone on black with a faint glow.
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
  // Construction on the 512 grid: two circles of radius R, one stroke width W.
  const R = 78;
  const W = 32;
  const bowl = [0, 0]; // centre of the bowl circle (origin of the drawing)
  const drop = 120; // distance from the bowl centre down to the hook circle's centre
  const stemX = bowl[0] + R; // the stem is tangent to the bowl on the right
  const hookEnd = 150; // degrees along the hook circle, clockwise from 3 o'clock
  const rad = (d) => (d * Math.PI) / 180;
  const end = [bowl[0] + R * Math.cos(rad(hookEnd)), drop + R * Math.sin(rad(hookEnd))];
  const f = (n) => Math.round(n * 10) / 10;
  // Centre the glyph, strokes included.
  const x0 = bowl[0] - R - W / 2;
  const x1 = stemX + W / 2;
  const y0 = bowl[1] - R - W / 2;
  const y1 = drop + R + W / 2;
  const tx = 256 - (x0 + x1) / 2;
  const ty = 256 - (y0 + y1) / 2;
  const glyph = `
      <circle cx="${bowl[0]}" cy="${bowl[1]}" r="${R}"/>
      <path d="M${stemX} ${bowl[1] - R}V${drop}A${R} ${R} 0 0 1 ${f(end[0])} ${f(end[1])}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="0.45" cy="0.35" r="0.9">
      <stop offset="0" stop-color="#0d1020"/><stop offset="1" stop-color="#040508"/>
    </radialGradient>
    <filter id="haze" filterUnits="userSpaceOnUse" x="-512" y="-512" width="1536" height="1536">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
  </defs>
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${scale}) translate(${f(tx - 256)} ${f(ty - 256)})" fill="none" stroke-width="${W}" stroke-linecap="round">
    <g stroke="${glow}" stroke-opacity="0.45" filter="url(#haze)">${glyph}
    </g>
    <g stroke="${ink}">${glyph}
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

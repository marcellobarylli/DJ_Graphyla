/**
 * The app icon: a small graph drawn as an acid-house smiley. The yellow
 * smiley became the emblem of acid house in 1988; here its face is a graph,
 * the app's own idea: the eyes are two nodes and the smile is a path of
 * nodes joined by edges (a walk, like a DJ set). Acid yellow on black.
 *
 *   npm run icons     writes public/graphyla-icon*.{svg,png}
 *
 * Needs Playwright with Chromium (like npm run art:y2k).
 */
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = (name) => join(root, 'public', name);

export const ACID = '#ffe600';
export const INK = '#0a0a0a';

/** @param {{ rounded: boolean; scale?: number }} o */
export function iconSvg({ rounded, scale = 1 }) {
  const f = (n) => Math.round(n * 10) / 10;
  // The face: a disc; the smile: 5 nodes on an arc, joined by straight edges.
  const disc = 200;
  const centre = [256, 236];
  const R = 112;
  const smile = [24, 57, 90, 123, 156].map((a) => [centre[0] + R * Math.cos((a * Math.PI) / 180), centre[1] + R * Math.sin((a * Math.PI) / 180)]);
  const eyes = [
    [200, 200],
    [312, 200],
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="${INK}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <circle cx="256" cy="256" r="${disc}" fill="${ACID}"/>
    <polyline points="${smile.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="13" stroke-linejoin="round" stroke-linecap="round"/>
    ${smile.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="17" fill="${INK}"/>`).join('\n    ')}
    ${eyes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="27" fill="${INK}"/>`).join('\n    ')}
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
  const maskable = iconSvg({ rounded: false, scale: 0.9 });
  await writeFile(out('graphyla-icon.svg'), any);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const png = async (svg, size, name, transparent) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: out(name), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
    console.log(name);
  };
  await png(any, 192, 'graphyla-icon-192.png', true);
  await png(any, 512, 'graphyla-icon-512.png', true);
  await png(maskable, 512, 'graphyla-icon-maskable-512.png', false);
  // iOS rounds the corners itself and shows transparent corners as black: full-bleed square.
  await png(square, 180, 'graphyla-icon-apple-touch.png', false);
  await browser.close();
}

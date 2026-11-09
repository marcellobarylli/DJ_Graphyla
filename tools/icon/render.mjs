/**
 * The app icon: a lowercase “g” drawn the way Paul Nicholson built his
 * Xylem lettering, from circles and straight lines on a circular grid
 * (an original drawing, not the Xylem font): a circular bowl, a stem
 * tangent to it, and a hook that is an arc of the same circle. Its ends are
 * graph nodes, so the letter is also a little walk through the graph. The
 * construction circles stay faintly visible behind it.
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

/** @param {{ rounded: boolean; scale?: number }} o */
export function iconSvg({ rounded, scale = 1 }) {
  // Construction (512 grid): bowl circle C1 and hook circle C2 share radius R.
  const R = 90;
  const W = 46; // stroke
  const c1 = [240, 212];
  const c2 = [240, 330];
  const stemX = c1[0] + R;
  const top = c1[1] - R;
  const hookEnd = 158; // degrees along C2, clockwise from 3 o'clock
  const rad = (d) => (d * Math.PI) / 180;
  const end = [c2[0] + R * Math.cos(rad(hookEnd)), c2[1] + R * Math.sin(rad(hookEnd))];
  const node = 30;
  // Centre the glyph (with its nodes) on the canvas.
  const box = { x0: Math.min(c1[0] - R - W / 2, end[0] - node), x1: stemX + node, y0: top - node, y1: c2[1] + R + W / 2 };
  const dx = 256 - (box.x0 + box.x1) / 2;
  const dy = 256 - (box.y0 + box.y1) / 2;
  const f = (n) => Math.round(n * 10) / 10;
  const glyph = `
    <g transform="translate(256 256) scale(${scale}) translate(${f(dx - 256)} ${f(dy - 256)})">
      <g fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="2">
        <circle cx="${c1[0]}" cy="${c1[1]}" r="${R}"/>
        <circle cx="${c2[0]}" cy="${c2[1]}" r="${R}"/>
        <circle cx="${c1[0]}" cy="${c1[1]}" r="${R + W / 2 + 26}" stroke-dasharray="4 10"/>
        <path d="M${c1[0] - R - 60} ${c1[1]}H${stemX + 60}M${c1[0] - R - 60} ${c2[1]}H${stemX + 60}M${stemX} ${top - 60}V${c2[1] + R + 50}M${c1[0]} ${top - 60}V${c2[1] + R + 50}"/>
      </g>
      <g fill="none" stroke="url(#ink)" stroke-width="${W}" stroke-linecap="round">
        <circle cx="${c1[0]}" cy="${c1[1]}" r="${R}"/>
        <path d="M${stemX} ${top}V${c2[1]}A${R} ${R} 0 0 1 ${f(end[0])} ${f(end[1])}"/>
      </g>
      <circle cx="${stemX}" cy="${top}" r="${node}" fill="#3dd6f5"/>
      <circle cx="${f(end[0])}" cy="${f(end[1])}" r="${node}" fill="#ff8a4c"/>
      <circle cx="${stemX}" cy="${top}" r="${node - 13}" fill="#0b0c14"/>
      <circle cx="${f(end[0])}" cy="${f(end[1])}" r="${node - 13}" fill="#0b0c14"/>
    </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="0.42" cy="0.32" r="0.85">
      <stop offset="0" stop-color="#1d1f38"/><stop offset="1" stop-color="#0b0c14"/>
    </radialGradient>
    <linearGradient id="ink" gradientUnits="userSpaceOnUse" x1="360" y1="110" x2="150" y2="440">
      <stop offset="0" stop-color="#3dd6f5"/><stop offset="0.5" stop-color="#8b6cff"/><stop offset="1" stop-color="#ff8a4c"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="url(#bg)"/>${glyph}
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

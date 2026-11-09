// Draws the soft digital camo of the SW4G 3R4 look (src/assets/camo-digital.svg).
// Pixel camo, as on 2000s military and streetwear prints, in pale greys, sage
// and lilac so it stays soft behind a light page. Fully procedural and seeded,
// so the pattern is the project's own and the file only changes when this
// script does. The tile repeats seamlessly (periodic noise).
//
//   npm run art:swag
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../src/assets/camo-digital.svg');
const N = 64; // cells per side
const CELL = 5; // px per cell: a 320px tile
const SEED = 2026;
// Lightest first: the base (most area), two sage-greys, then lilac patches.
const COLORS = ['#efefeb', '#e1e3db', '#d3d7ca', '#dad3de'];
const SHARE = [0.46, 0.3, 0.24]; // of the area outside the lilac patches
const LILAC = 0.15; // share of lilac

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const smooth = (t) => t * t * (3 - 2 * t);

/** Periodic value noise with `p` lattice cells across the tile. */
function octave(p) {
  const lattice = Array.from({ length: p }, () => Array.from({ length: p }, rand));
  return (x, y) => {
    const fx = (x / N) * p;
    const fy = (y / N) * p;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const v = (i, j) => lattice[((j % p) + p) % p][((i % p) + p) % p];
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx;
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
}

// Two layers of blobs each (big patches and the smaller "pixel" breakup around
// them): one field for the sage-greys, an independent one for the lilac
// patches, so the colours interleave instead of nesting.
const fieldOf = (big, mid) => {
  const f = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) f.push(0.62 * big(x, y) + 0.3 * mid(x, y) + 0.08 * rand());
  return f;
};
const field = fieldOf(octave(4), octave(16));
const lilac = fieldOf(octave(4), octave(16));
const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.floor(q * values.length)];
const lilacCut = quantile(lilac, 1 - LILAC);

// Thresholds at the quantiles that give each colour its share of the area.
const cuts = [quantile(field, SHARE[0]), quantile(field, SHARE[0] + SHARE[1])];
const tone = (v) => cuts.filter((c) => v >= c).length;
const grid = field.map((v, i) => (lilac[i] >= lilacCut ? 3 : tone(v)));

// One path per tone; each horizontal run of a tone becomes one rectangle.
const paths = COLORS.map(() => []);
for (let y = 0; y < N; y++) {
  let x = 0;
  while (x < N) {
    const t = grid[y * N + x];
    let end = x + 1;
    while (end < N && grid[y * N + end] === t) end++;
    if (t > 0) paths[t].push(`M${x} ${y}h${end - x}v1h${x - end}z`);
    x = end;
  }
}

const size = N * CELL;
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">` +
  `<rect width="${N}" height="${N}" fill="${COLORS[0]}"/>` +
  paths.map((d, i) => (i > 0 && d.length ? `<path fill="${COLORS[i]}" d="${d.join('')}"/>` : '')).join('') +
  `</svg>\n`;
writeFileSync(OUT, svg);
console.log(`wrote ${OUT} (${svg.length} bytes)`);

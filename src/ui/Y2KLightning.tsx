import { useEffect, useRef } from 'react';
import figures from '../assets/y2k/figures.json';
import { type FigureAnchors, type Rand, type StrikeKind, STRIKE_KINDS, seeded, strike } from './lightning';

type Figure = keyof typeof figures;

const FLASH_MS = 420;
/** Gap between strikes on one figure. With two flickers per strike this stays
 *  well under three flashes a second, the photosensitivity limit. */
const MIN_GAP_MS = 1400;
const MAX_GAP_MS = 4200;

/** Draws a strike into the bolt group: each path three times (glow, body, core). */
function draw(group: SVGGElement, f: FigureAnchors, kinds: StrikeKind[], rand: Rand) {
  const paths: string[] = [];
  for (const kind of kinds) {
    const s = strike(f, kind, rand);
    paths.push(
      `<path class="y2k-bolt-glow" d="${s.main}"/>`,
      ...s.branches.map((d) => `<path class="y2k-bolt-glow y2k-bolt-thin" d="${d}"/>`),
      `<path class="y2k-bolt-body" d="${s.main}"/>`,
      ...s.branches.map((d) => `<path class="y2k-bolt-body y2k-bolt-thin" d="${d}"/>`),
      `<path class="y2k-bolt-core" d="${s.main}"/>`,
      ...s.branches.map((d) => `<path class="y2k-bolt-core y2k-bolt-thin" d="${d}"/>`),
    );
  }
  group.innerHTML = paths.join('');
}

/** One or, now and then, two kinds of strike. */
function pickKinds(rand: Rand): StrikeKind[] {
  const pick = () => STRIKE_KINDS[Math.floor(rand() * STRIKE_KINDS.length)]!;
  const first = pick();
  if (rand() < 0.3) {
    const second = pick();
    if (second !== first) return [first, second];
  }
  return [first];
}

/**
 * Lightning around one chrome DJ picture (Y2K Futurism): every few seconds a
 * bolt strikes the headphones from above, crackles over the head, jumps from
 * a hand to the floor, runs between the feet or slants across the figure, and
 * the figure glows with it. Drawn over the picture in its own pixels, so it
 * scales with it. Still bolts, no flicker, when reduced motion is asked for;
 * paused while the tab is hidden or the figure isn't shown.
 */
export function Y2KLightning({ figure }: { figure: Figure }) {
  const group = useRef<SVGGElement>(null);
  const f = figures[figure] as unknown as FigureAnchors;

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const host = g.ownerSVGElement?.parentElement;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // One quiet, still strike instead of flashes.
      draw(g, f, ['halo', 'hands'], seeded(figure === 'man' ? 7 : 11));
      g.style.opacity = '0.5';
      return;
    }
    let timer = 0;
    const zap = () => {
      timer = window.setTimeout(zap, MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
      if (document.hidden || !host || host.offsetParent === null) return;
      draw(g, f, pickKinds(Math.random), Math.random);
      g.animate(
        [{ opacity: 1 }, { opacity: 0.15, offset: 0.16 }, { opacity: 1, offset: 0.3 }, { opacity: 0.7, offset: 0.6 }, { opacity: 0 }],
        { duration: FLASH_MS, easing: 'linear' },
      );
      host.animate(
        [
          { filter: 'drop-shadow(0 0 22px rgb(59 158 255 / 0.4))' },
          { filter: 'drop-shadow(0 0 30px rgb(143 211 255 / 0.85)) brightness(1.18)', offset: 0.3 },
          { filter: 'drop-shadow(0 0 22px rgb(59 158 255 / 0.4))' },
        ],
        { duration: FLASH_MS * 1.6, easing: 'ease-out' },
      );
    };
    // The two figures start out of step.
    timer = window.setTimeout(zap, figure === 'man' ? 600 : 1900);
    return () => window.clearTimeout(timer);
  }, [f, figure]);

  return (
    <svg className="y2k-lightning" viewBox={`0 0 ${f.width} ${f.height}`} preserveAspectRatio="xMidYMid meet">
      <g ref={group} className="y2k-bolts" />
    </svg>
  );
}

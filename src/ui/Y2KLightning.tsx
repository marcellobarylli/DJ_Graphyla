import { useEffect, useRef } from 'react';
import { useLightning } from '../state/lightningSetting';
import { type Bolt, patternBolts, skyBolt } from './lightning';

const FLASH_MS = 420;
/** Gap between strikes. With two flickers per strike this stays well under
 *  three flashes a second, the photosensitivity limit. */
const MIN_GAP_MS = 1600;
const MAX_GAP_MS = 4500;

/** Draws bolts into the group, each path three times: glow, body, core. */
function draw(svg: SVGSVGElement, group: SVGGElement, bolts: Bolt[]) {
  svg.setAttribute('viewBox', `0 0 ${svg.clientWidth} ${svg.clientHeight}`);
  const layer = (cls: string) =>
    bolts.flatMap((b) => [`<path class="${cls}" d="${b.main}"/>`, ...b.forks.map((d) => `<path class="${cls} y2k-bolt-thin" d="${d}"/>`)]);
  group.innerHTML = [...layer('y2k-bolt-glow'), ...layer('y2k-bolt-body'), ...layer('y2k-bolt-core')].join('');
}

/**
 * Lightning in the Y2K Futurism backdrop. Flashing: every few seconds one or
 * two bolts come down from the top of the screen, flicker and fade. Still:
 * the pattern picked in the look panel stays up. It sits above the orb
 * backdrop and below the chrome DJs (Y2KDecor puts it first). When reduced
 * motion is asked for it is always still, and fainter unless still was
 * picked; flashing pauses while the tab is hidden.
 */
export function Y2KLightning() {
  const svgRef = useRef<SVGSVGElement>(null);
  const group = useRef<SVGGElement>(null);
  const { still, pattern } = useLightning();

  useEffect(() => {
    const svg = svgRef.current;
    const g = group.current;
    if (!svg || !g) return;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || calm) {
      const show = () => draw(svg, g, patternBolts(pattern, svg.clientWidth, svg.clientHeight));
      show();
      g.style.opacity = still ? '0.8' : '0.45';
      window.addEventListener('resize', show);
      return () => {
        window.removeEventListener('resize', show);
        g.style.opacity = '';
      };
    }
    let timer = 0;
    const zap = () => {
      timer = window.setTimeout(zap, MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
      if (document.hidden) return;
      const count = Math.random() < 0.3 ? 2 : 1;
      draw(svg, g, Array.from({ length: count }, () => skyBolt(svg.clientWidth, svg.clientHeight, Math.random)));
      g.animate(
        [{ opacity: 1 }, { opacity: 0.15, offset: 0.16 }, { opacity: 1, offset: 0.3 }, { opacity: 0.7, offset: 0.6 }, { opacity: 0 }],
        { duration: FLASH_MS, easing: 'linear' },
      );
    };
    timer = window.setTimeout(zap, 800);
    return () => {
      window.clearTimeout(timer);
      g.innerHTML = '';
    };
  }, [still, pattern]);

  return (
    <svg ref={svgRef} className="y2k-lightning">
      <g ref={group} className="y2k-bolts" />
    </svg>
  );
}

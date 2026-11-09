import { useEffect, useRef } from 'react';
import { type Bolt, type Rand, seeded, skyBolt } from './lightning';

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

function bolts(svg: SVGSVGElement, rand: Rand, count: number): Bolt[] {
  return Array.from({ length: count }, () => skyBolt(svg.clientWidth, svg.clientHeight, rand));
}

/**
 * Lightning in the Y2K Futurism backdrop: every few seconds one or two bolts
 * come down from the top of the screen, flicker and fade. It sits above the
 * orb backdrop and below the chrome DJs (Y2KDecor puts it first). Still bolts,
 * no flicker, when reduced motion is asked for; paused while the tab is hidden.
 */
export function Y2KLightning() {
  const svgRef = useRef<SVGSVGElement>(null);
  const group = useRef<SVGGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const g = group.current;
    if (!svg || !g) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Two quiet, still bolts instead of flashes.
      const still = () => draw(svg, g, bolts(svg, seeded(2000), 2));
      still();
      g.style.opacity = '0.45';
      window.addEventListener('resize', still);
      return () => window.removeEventListener('resize', still);
    }
    let timer = 0;
    const zap = () => {
      timer = window.setTimeout(zap, MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
      if (document.hidden) return;
      draw(svg, g, bolts(svg, Math.random, Math.random() < 0.3 ? 2 : 1));
      g.animate(
        [{ opacity: 1 }, { opacity: 0.15, offset: 0.16 }, { opacity: 1, offset: 0.3 }, { opacity: 0.7, offset: 0.6 }, { opacity: 0 }],
        { duration: FLASH_MS, easing: 'linear' },
      );
    };
    timer = window.setTimeout(zap, 800);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <svg ref={svgRef} className="y2k-lightning">
      <g ref={group} className="y2k-bolts" />
    </svg>
  );
}

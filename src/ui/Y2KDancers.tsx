import { useEffect, useRef, useState } from 'react';
import manDance from '../assets/y2k/man-dance.webp';
import womanDance from '../assets/y2k/woman-dance.webp';
import { danceFrame, getDanceFloor, useDanceFloor } from '../state/dance';
import { useTheme } from '../state/theme';
import { DJ_SHEET } from './djSheet';

/** Where the chrome DJs are shown (styles.css, .y2k-chrome-dj). */
const WIDE = '(min-width: 1100px)';

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const change = () => setMatches(list.matches);
    change();
    list.addEventListener('change', change);
    return () => list.removeEventListener('change', change);
  }, [query]);
  return matches;
}

/** True where the chrome DJs are on screen: Y2K Futurism on a wide screen. */
export function useDancersShown(): boolean {
  const wide = useMedia(WIDE);
  return useTheme().id === 'futurism' && wide;
}

/** Downloads and decodes both dance sheets; true once they are ready. */
function useSheets(wanted: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!wanted || ready) return;
    let live = true;
    const decode = (src: string) => {
      const img = new Image();
      img.src = src;
      return img.decode();
    };
    Promise.all([decode(manDance), decode(womanDance)])
      .then(() => live && setReady(true))
      .catch(() => {
        /* offline before they were ever loaded: the DJs stay still */
      });
    return () => {
      live = false;
    };
  }, [wanted, ready]);
  return ready;
}

/**
 * The two chrome DJs of the Y2K Futurism look, beside the page on wide
 * screens. In play mode, once the set got going (play mode's "Get the DJs
 * dancing" button, or the first mix-in), they dance (state/dance.ts): a loop
 * of two beats to the tempo of the song that is on, and a spin when the next
 * song is mixed in. The frames come
 * from two sprite sheets (ui/djSheet.ts), downloaded the first time they
 * dance; until then, and on narrow screens, they stand still. They dance
 * even when the device asks for reduced motion: dancing is what they are
 * there for in play mode (the lightning still follows that setting).
 */
export function Y2KDancers() {
  const man = useRef<HTMLSpanElement>(null);
  const woman = useRef<HTMLSpanElement>(null);
  const { on } = useDanceFloor();
  const wide = useMedia(WIDE);
  const dancing = on && wide;
  const ready = useSheets(dancing);

  useEffect(() => {
    if (!dancing || !ready || !man.current || !woman.current) return;
    const figures: [HTMLSpanElement, string][] = [
      [man.current, manDance],
      [woman.current, womanDance],
    ];
    const { loopFrames, moveFrames } = DJ_SHEET;
    const cols = Math.max(loopFrames, moveFrames);
    for (const [el, sheet] of figures) {
      el.style.backgroundImage = `url(${sheet})`;
      el.style.backgroundSize = `${cols * 100}% 200%`;
    }
    let raf = 0;
    let shown = '';
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const { row, col } = danceFrame(getDanceFloor(), Date.now(), loopFrames, moveFrames);
      const position = `${(col / (cols - 1)) * 100}% ${row * 100}%`;
      if (position === shown) return;
      shown = position;
      for (const [el] of figures) el.style.backgroundPosition = position;
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      for (const [el] of figures) {
        el.style.backgroundImage = '';
        el.style.backgroundSize = '';
        el.style.backgroundPosition = '';
      }
    };
  }, [dancing, ready]);

  return (
    <>
      <span ref={man} className="y2k-chrome y2k-chrome-dj y2k-chrome-man" />
      <span ref={woman} className="y2k-chrome y2k-chrome-dj y2k-chrome-woman" />
    </>
  );
}

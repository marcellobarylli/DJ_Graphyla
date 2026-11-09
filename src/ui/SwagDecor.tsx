import { useMemo } from 'react';
import snapshot from '../assets/swag-snapshot.svg';
import { dateStamp } from '../domain/digicam';
import { stats } from '../domain/graph';
import { useStore } from '../state/store';
import { useDigicam } from './useDigicam';

/** Four-point Y2K star, in ink. */
function Star({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40">
      <path d="M20 0C21.6 13 27 18.4 40 20C27 21.6 21.6 27 20 40C18.4 27 13 21.6 0 20C13 18.4 18.4 13 20 0Z" />
    </svg>
  );
}

/** A barcode for the hang tag, drawn from the crate's numbers so it changes with them. */
function Barcode({ seed }: { seed: string }) {
  const bars = useMemo(() => {
    let h = 2166136261;
    const out: { x: number; w: number }[] = [];
    let x = 0;
    while (x < 150) {
      for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
      h = Math.imul(h ^ x, 16777619);
      const w = 1 + ((h >>> 3) % 3);
      out.push({ x, w });
      x += w + 1 + ((h >>> 7) % 3);
    }
    return out;
  }, [seed]);
  return (
    <svg className="swag-barcode" viewBox="0 0 150 34" preserveAspectRatio="none">
      {bars.map((b) => (
        <rect key={b.x} x={b.x} width={b.w} height="34" />
      ))}
    </svg>
  );
}

/**
 * Edge decorations of the SW4G 3R4 look (issue #12): flavour text in pixel
 * type up the page margins, a tribal flourish, a safety pin and stars at the
 * screen edges; on wide screens a hang tag with the crate's numbers and a
 * pixelated, overexposed digicam snapshot with its date stamp beside the
 * page. Purely decorative: it sits behind the page, takes no taps, and is
 * hidden from screen readers.
 */
export function SwagDecor() {
  const { graph, activeCrate } = useStore();
  const s = stats(graph);
  const shot = useDigicam(snapshot, 48, true);
  return (
    <div className="swag-decor" aria-hidden="true">
      <span className="swag-flourish swag-flourish-1" />
      <span className="swag-flourish swag-flourish-2" />
      <span className="swag-pin" />
      <Star className="swag-star swag-star-1" />
      <Star className="swag-star swag-star-2" />
      <Star className="swag-star swag-star-3" />
      <p className="swag-rail swag-rail-left">+ sw4g 3r4 + 100% auth3ntic + limit3d drop + no fak3s + est. 2007 +</p>
      <p className="swag-rail swag-rail-right">stay fr3sh + gr4phyl4 + v{__APP_VERSION__}</p>
      <div className="swag-tag">
        <span className="swag-tag-hole" />
        <p className="swag-tag-brand">Graphyla</p>
        <p className="swag-tag-line">sw4g 3r4 // fw26</p>
        <p className="swag-tag-crate">{activeCrate.name}</p>
        <p className="swag-tag-line">
          {s.songs} songs / {s.transitions} mixes / {s.sets} sets
        </p>
        <Barcode seed={`${activeCrate.id}:${s.songs}:${s.transitions}:${s.sets}`} />
        <p className="swag-tag-line">100% authentic</p>
      </div>
      <figure className="swag-snapshot">
        <img className={shot.pixelated ? 'is-digicam' : undefined} src={shot.src ?? undefined} alt="" />
        <figcaption className="swag-stamp">{dateStamp(new Date())}</figcaption>
      </figure>
    </div>
  );
}

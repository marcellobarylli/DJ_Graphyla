import { stats } from '../domain/graph';
import { useStore } from '../state/store';
import { Y2KDancers } from './Y2KDancers';
import { Y2KLightning } from './Y2KLightning';

/** Four-point "sparkle" star in chrome. */
function Sparkle({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40">
      <path d="M20 0C21.6 13 27 18.4 40 20C27 21.6 21.6 27 20 40C18.4 27 13 21.6 0 20C13 18.4 18.4 13 20 0Z" fill="url(#y2k-chrome-fill)" />
    </svg>
  );
}

/**
 * Side decorations of the Y2K Futurism look: rendered chrome objects at the
 * screen edges, sparkles, flavour text running up the page margins, and on
 * wide screens two full-body chrome DJs (a man and a woman, one in each
 * margin, dancing while play mode is open: Y2KDancers) and a HUD readout;
 * lightning strikes from above behind it all. The readout is bare glowing text, not a panel,
 * so it doesn't look like a button. Purely decorative: it sits behind the
 * page, takes no taps, and is hidden from screen readers.
 */
export function Y2KDecor() {
  const { graph, activeCrate } = useStore();
  const s = stats(graph);
  return (
    <div className="y2k-decor" aria-hidden="true">
      {/* First, so the bolts sit over the orb backdrop and under everything else here. */}
      <Y2KLightning />
      <svg className="y2k-defs" width="0" height="0">
        <defs>
          <linearGradient id="y2k-chrome-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.45" stopColor="#c6d2e6" />
            <stop offset="0.55" stopColor="#7d8ba8" />
            <stop offset="1" stopColor="#eef3fb" />
          </linearGradient>
        </defs>
      </svg>
      <span className="y2k-chrome y2k-chrome-blob" />
      <span className="y2k-chrome y2k-chrome-torus" />
      <Y2KDancers />
      <Sparkle className="y2k-sparkle y2k-sparkle-1" />
      <Sparkle className="y2k-sparkle y2k-sparkle-2" />
      <Sparkle className="y2k-sparkle y2k-sparkle-3" />
      <p className="y2k-rail y2k-rail-left">◆ Graphyla//2000 ◆ millennium ready ◆ bpm sync online ◆ enter the new millennium ◆</p>
      <p className="y2k-rail y2k-rail-right">system online ◆ y2k compliant ◆ v{__APP_VERSION__}</p>
      <div className="y2k-hud">
        <p className="y2k-hud-title">Transmission</p>
        <p>welcome to the future of the mix</p>
        <p className="y2k-hud-crate">{activeCrate.name}</p>
        <p>
          nodes {s.songs} ◆ edges {s.transitions} ◆ sets {s.sets}
        </p>
        <p>&gt; millennium ready_</p>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { energyBand, energyColor } from '../domain/energy';
import type { Song } from '../domain/types';
import { useTheme } from '../state/theme';

/**
 * Energy across a set: one bar per song, as high as its energy and in its
 * band's colour, so the build-up (and the dips) can be read at a glance.
 * Songs without an energy leave a dotted stub. Single series → no legend; the
 * badge on every song in the cue sheet below carries the same numbers.
 */
const W = 340;
const H = 130;
const PAD = { top: 14, right: 10, bottom: 24, left: 30 };
const TICKS = [0, 50, 100];

export function EnergyFlow({ songs }: { songs: (Song | undefined)[] }) {
  const { scheme } = useTheme();
  const [active, setActive] = useState<number | null>(null);
  const known = songs.filter((s) => s?.energy !== undefined).length;
  if (known === 0) return null;

  const n = songs.length;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / n;
  const barW = Math.max(3, Math.min(28, slot - 2)); // 2px gap between bars
  const xOf = (i: number) => PAD.left + slot * i + slot / 2;
  const yOf = (e: number) => PAD.top + (1 - e / 100) * plotH;
  const base = yOf(0);
  const label = (i: number) => i === 0 || i === n - 1 || n <= 12 || (i + 1) % 5 === 0;
  const activeSong = active !== null ? songs[active] : undefined;

  return (
    <figure className="tempo-chart energy-flow card">
      <figcaption className="chart-title">Energy across the set</figcaption>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Energy of ${known} of ${n} songs, in set order`}>
          {TICKS.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={PAD.left} x2={W - PAD.right} y1={yOf(t)} y2={yOf(t)} />
              <text className="chart-tick" x={PAD.left - 6} y={yOf(t)} dy="0.32em" textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {songs.map((song, i) => {
            const x = xOf(i) - barW / 2;
            if (song?.energy === undefined) {
              return <line key={i} className="energy-stub" x1={xOf(i)} x2={xOf(i)} y1={base} y2={base - 8} />;
            }
            const h = Math.max(2, base - yOf(song.energy));
            const r = Math.min(4, barW / 2, h);
            // Rounded data end at the top, square on the baseline.
            const d = `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + barW - r} Q${x + barW},${base - h} ${x + barW},${base - h + r} V${base} Z`;
            return <path key={i} d={d} fill={energyColor(song.energy, scheme)} className={active === i ? 'energy-bar is-active' : 'energy-bar'} />;
          })}
          {songs.map((_, i) =>
            label(i) ? (
              <text key={i} className="chart-tick" x={xOf(i)} y={H - 8} textAnchor="middle">
                {i + 1}
              </text>
            ) : null,
          )}
          {songs.map((song, i) => (
            <rect
              key={i}
              className="chart-hit"
              x={PAD.left + slot * i}
              y={0}
              width={slot}
              height={H}
              tabIndex={0}
              aria-label={`Song ${i + 1}: ${song?.title ?? 'unknown'}, energy ${song?.energy === undefined ? 'not set' : `${song.energy}, ${energyBand(song.energy).name}`}`}
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
              onFocus={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onBlur={() => setActive(null)}
            />
          ))}
        </svg>
        {active !== null && (
          <div className="chart-tooltip" style={{ left: `${(xOf(active) / W) * 100}%` }} role="status">
            <strong>{activeSong?.energy === undefined ? 'No energy set' : `${activeSong.energy} · ${energyBand(activeSong.energy).name}`}</strong>
            <span>
              {active + 1}. {activeSong?.title ?? 'Unknown song'}
            </span>
          </div>
        )}
      </div>
      <p className="chart-axis-note">song #</p>
    </figure>
  );
}

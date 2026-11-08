import { useState } from 'react';
import { songLabel } from '../domain/graph';
import type { TempoPoint } from '../domain/sets';
import { formatBpm } from '../domain/tempo';

/**
 * Tempo across a set: one point per BPM value at each mix (out-deck, then
 * in-deck when they differ). The line between mixes shows how far the tempo
 * is ridden while a song plays. Single series → no legend; the cue sheet
 * below the chart lists every value, so the tooltip never gates data.
 */
const W = 340;
const H = 150;
const PAD = { top: 18, right: 16, bottom: 26, left: 34 };

interface Vertex {
  x: number;
  y: number;
  bpm: number;
}

function niceTicks(min: number, max: number): number[] {
  const span = Math.max(max - min, 1);
  const step = [1, 2, 5, 10, 20].find((s) => span / s <= 4) ?? 50;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

export function TempoChart({ points }: { points: TempoPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const values = points.flatMap((p) => [p.outBpm, p.inBpm]).filter((v): v is number => v !== null);
  if (values.length === 0) return null;

  const lo = Math.floor(Math.min(...values) - 1);
  const hi = Math.ceil(Math.max(...values) + 1);
  const ticks = niceTicks(lo, hi);
  const yMin = Math.min(lo, ticks[0] ?? lo);
  const yMax = Math.max(hi, ticks[ticks.length - 1] ?? hi);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const n = points.length;
  const xOf = (mix: number) => PAD.left + (n === 1 ? plotW / 2 : ((mix - 1) / (n - 1)) * plotW);
  const yOf = (bpm: number) => PAD.top + (1 - (bpm - yMin) / (yMax - yMin)) * plotH;

  // Polyline runs, broken wherever a tempo is unknown (gaps / missing BPM).
  const runs: Vertex[][] = [];
  let run: Vertex[] = [];
  for (const p of points) {
    const vs = [p.outBpm, p.inBpm === p.outBpm ? null : p.inBpm];
    if (p.outBpm === null && p.inBpm === null) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    for (const bpm of vs) if (bpm !== null) run.push({ x: xOf(p.mix), y: yOf(bpm), bpm });
  }
  if (run.length) runs.push(run);
  const vertices = runs.flat();
  const first = vertices[0]!;
  const last = vertices[vertices.length - 1]!;
  const band = n === 1 ? plotW : plotW / (n - 1);
  const activePoint = active !== null ? points[active] : undefined;

  return (
    <figure className="tempo-chart card">
      <figcaption className="chart-title">Tempo across the set</figcaption>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Tempo from ${formatBpm(first.bpm)} to ${formatBpm(last.bpm)} BPM over ${n} mixes`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={PAD.left} x2={W - PAD.right} y1={yOf(t)} y2={yOf(t)} />
              <text className="chart-tick" x={PAD.left - 6} y={yOf(t)} dy="0.32em" textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {points.map((p) => (
            <text key={p.mix} className="chart-tick" x={xOf(p.mix)} y={H - 8} textAnchor="middle">
              {p.mix}
            </text>
          ))}
          {activePoint && <line className="chart-crosshair" x1={xOf(activePoint.mix)} x2={xOf(activePoint.mix)} y1={PAD.top - 6} y2={PAD.top + plotH} />}
          {runs.map((r, i) => (
            <polyline key={i} className="chart-line" points={r.map((v) => `${v.x},${v.y}`).join(' ')} />
          ))}
          {vertices.map((v, i) => (
            <circle key={i} className="chart-dot" cx={v.x} cy={v.y} r={4} />
          ))}
          <text className="chart-label" x={first.x} y={first.y - 9} textAnchor={n === 1 ? 'middle' : 'start'}>
            {formatBpm(first.bpm)}
          </text>
          {vertices.length > 1 && (
            <text className="chart-label" x={last.x} y={last.y - 9} textAnchor="end">
              {formatBpm(last.bpm)}
            </text>
          )}
          {/* Hit targets: a full-height band per mix, much larger than the dot. */}
          {points.map((p, i) => (
            <rect
              key={p.mix}
              className="chart-hit"
              x={xOf(p.mix) - band / 2}
              y={0}
              width={band}
              height={H}
              tabIndex={0}
              aria-label={`Mix ${p.mix}: ${songLabel(p.fromSong)} into ${songLabel(p.toSong)}, out ${p.outBpm ?? 'unknown'}, in ${p.inBpm ?? 'unknown'} BPM`}
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
              onFocus={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onBlur={() => setActive(null)}
            />
          ))}
        </svg>
        {activePoint && (
          <div
            className="chart-tooltip"
            style={{ left: `${(xOf(activePoint.mix) / W) * 100}%` }}
            role="status"
          >
            <strong>
              {activePoint.outBpm !== null ? formatBpm(activePoint.outBpm) : '?'}
              {activePoint.inBpm !== null && activePoint.inBpm !== activePoint.outBpm ? ` → ${formatBpm(activePoint.inBpm)}` : ''} BPM
            </strong>
            <span>
              Mix {activePoint.mix}: {activePoint.fromSong?.title ?? '?'} → {activePoint.toSong?.title ?? '?'}
            </span>
          </div>
        )}
      </div>
      <p className="chart-axis-note">mix #</p>
    </figure>
  );
}

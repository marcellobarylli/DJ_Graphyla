/**
 * Interactive graph: songs as nodes, transitions as directed edges.
 * Parallel edges (variants of the same pair) fan out as separate curves.
 * Edge colour + width encode the rating (ordinal blue ramp, validated on the
 * canvas colour); "doesn't work" uses the reserved critical red and a dashed
 * line, so it never relies on colour alone. A set can be overlaid as a
 * highlighted, numbered walk; everything else is dimmed.
 * The look (theme) changes the canvas, nodes and labels; the edges keep their
 * meaning in every look, stepped for a dark or a light canvas (EDGE_COLORS).
 *
 * Loaded lazily, so Cytoscape only downloads when the Graph tab is opened.
 */
import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from 'cytoscape';
import { useEffect, useMemo, useRef, useState } from 'react';
import { degree, songLabel } from '../domain/graph';
import { sortedSets } from '../domain/sets';
import type { GraphData } from '../domain/types';
import { linkTo, navigate, paths } from '../state/router';
import { useStore } from '../state/store';
import { EDGE_COLORS, useTheme, type ThemeInfo } from '../state/theme';
import { BpmBadge, EmptyState, KeyBadge, TopBar, VariantRow } from './components';
import { createAndOpenSet } from './SetsView';

/** Edge width by rating (the rating is also in the colour, so it never relies on colour alone). */
const WIDTH: Record<number, number> = { 0: 1.5, 1: 1.5, 2: 2, 3: 2.5, 4: 3.25, 5: 4 };

type MinRating = 0 | 3 | 4;

/** Fitting a handful of songs would zoom in absurdly far; cap it. */
const MAX_FIT_ZOOM = 1.25;
const LAYOUT = {
  name: 'cose',
  animate: false,
  padding: 40,
  // Measured: leaves ~280 units between songs in small graphs, ~100 at 40 songs.
  nodeRepulsion: () => 200000,
  idealEdgeLength: () => 140,
  gravity: 0.25,
  nodeDimensionsIncludeLabels: true,
} as const;

/**
 * Force layouts don't know the screen's shape. If the graph came out wide on a
 * tall phone screen (or the other way round), turn it 90° so it fills the
 * screen and can be shown larger. Distances and structure stay the same.
 */
function orientToCanvas(cy: Core): void {
  const bb = cy.nodes().boundingBox({});
  const w = cy.width();
  const h = cy.height();
  const mismatch = (h > w * 1.15 && bb.w > bb.h * 1.15) || (w > h * 1.15 && bb.h > bb.w * 1.15);
  if (!mismatch) return;
  const cx = bb.x1 + bb.w / 2;
  const cyy = bb.y1 + bb.h / 2;
  cy.nodes().positions((n) => {
    const p = n.position();
    return { x: cx + (p.y - cyy), y: cyy - (p.x - cx) };
  });
}

function afterLayout(cy: Core): void {
  orientToCanvas(cy);
  cy.nodes().forEach((n) => void positionCache.set(n.id(), { ...n.position() }));
}

function frame(cy: Core, eles?: cytoscape.CollectionArgument): void {
  cy.fit(eles, 48);
  if (cy.zoom() > MAX_FIT_ZOOM) {
    cy.zoom(MAX_FIT_ZOOM);
    cy.center(eles);
  }
}

/** Node positions survive tab switches so the layout doesn't reshuffle every time. */
const positionCache = new Map<string, { x: number; y: number }>();

function buildElements(graph: GraphData): ElementDefinition[] {
  const nodes: ElementDefinition[] = Object.values(graph.songs).map((s) => {
    const d = degree(graph, s.id);
    const pos = positionCache.get(s.id);
    return {
      group: 'nodes',
      data: { id: s.id, label: s.title, size: 22 + Math.min(d.in + d.out, 10) * 2.5 },
      ...(pos ? { position: { ...pos } } : {}),
    };
  });
  const edges: ElementDefinition[] = Object.values(graph.transitions).map((t) => ({
    group: 'edges',
    data: { id: t.id, source: t.fromSongId, target: t.toSongId, rating: t.rating ?? 0, idea: t.idea ? 1 : 0 },
  }));
  return [...nodes, ...edges];
}

/** Canvas, node and label colours come from the active look; edge colours from its scheme. */
const graphStyle = (theme: ThemeInfo): StylesheetJson => {
  const look = theme.graph;
  const C = EDGE_COLORS[theme.scheme];
  return [
    {
      selector: 'node',
      style: {
        'background-color': look.node,
        'border-width': 2,
        'border-color': look.nodeBorder,
        width: 'data(size)',
        height: 'data(size)',
        label: 'data(label)',
        color: look.text,
        'font-size': 13,
        'font-family': look.font,
        'text-valign': 'bottom',
        'text-margin-y': 5,
        'text-wrap': 'ellipsis',
        'text-max-width': '110px',
        'text-outline-color': look.canvas,
        'text-outline-width': 2,
        'min-zoomed-font-size': 7,
      },
    },
    {
      selector: 'edge',
      style: {
        'curve-style': 'bezier',
        'control-point-step-size': 22,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.9,
        width: 2,
        'line-color': C.unrated,
        'target-arrow-color': C.unrated,
      },
    },
    { selector: 'edge[rating = 0]', style: { 'line-style': 'dotted', width: WIDTH[0]! } },
    { selector: 'edge[rating = 1]', style: { 'line-color': C.bad, 'target-arrow-color': C.bad, 'line-style': 'dashed', width: WIDTH[1]! } },
    ...([2, 3, 4, 5] as const).map((r) => ({
      selector: `edge[rating = ${r}]`,
      style: { 'line-color': C.ramp[r], 'target-arrow-color': C.ramp[r], width: WIDTH[r]! },
    })),
    // Ideas: the pair goes well together, no mix worked out yet. Faint dashes, no arrowhead.
    {
      selector: 'edge[idea = 1]',
      style: { 'line-style': 'dashed', 'line-dash-pattern': [2, 6], 'target-arrow-shape': 'none', opacity: 0.7 },
    },
    { selector: '.hidden', style: { display: 'none' } },
    { selector: '.dim', style: { opacity: 0.14 } },
    { selector: 'node.in-set', style: { 'border-color': C.set, 'border-width': 3 } },
    {
      selector: 'edge.in-set',
      style: {
        'line-color': C.set,
        'target-arrow-color': C.set,
        'line-style': 'solid',
        width: 4,
        label: 'data(step)',
        color: look.text,
        'font-size': 11,
        'font-weight': 'bold',
        'text-background-color': look.canvas,
        'text-background-opacity': 1,
        'text-background-padding': '2px',
        'text-background-shape': 'roundrectangle',
        'z-index': 10,
      },
    },
    { selector: 'node:selected', style: { 'border-color': look.text, 'border-width': 3 } },
    { selector: 'edge:selected', style: { 'overlay-color': look.text, 'overlay-opacity': 0.15, 'overlay-padding': 4 } },
  ];
};

type Selection = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null;

export default function GraphView({ setId, focusId }: { setId?: string; focusId?: string }) {
  const store = useStore();
  const { graph } = store;
  const theme = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [minRating, setMinRating] = useState<MinRating>(0);
  const [selection, setSelection] = useState<Selection>(focusId ? { kind: 'node', id: focusId } : null);
  const sets = sortedSets(graph);
  const overlay = setId ? graph.sets[setId] : undefined;
  const isEmpty = Object.keys(graph.songs).length === 0;

  // Structural key: rebuild Cytoscape elements only when nodes/edges/labels/ratings change.
  const structureKey = useMemo(
    () =>
      JSON.stringify([
        Object.values(graph.songs).map((s) => [s.id, s.title]),
        Object.values(graph.transitions).map((t) => [t.id, t.fromSongId, t.toSongId, t.rating, !!t.idea]),
      ]),
    [graph.songs, graph.transitions],
  );

  // Create Cytoscape once.
  useEffect(() => {
    if (!container.current) return;
    const cy = cytoscape({
      container: container.current,
      style: graphStyle(theme),
      minZoom: 0.2,
      maxZoom: 3,
      boxSelectionEnabled: false,
    });
    cyRef.current = cy;
    cy.on('tap', (e) => {
      if (e.target === cy) setSelection(null);
    });
    cy.on('tap', 'node', (e) => setSelection({ kind: 'node', id: e.target.id() }));
    cy.on('tap', 'edge', (e) => setSelection({ kind: 'edge', id: e.target.id() }));
    cy.on('dragfree', 'node', (e) => positionCache.set(e.target.id(), { ...e.target.position() }));
    return () => {
      cy.nodes().forEach((n) => void positionCache.set(n.id(), { ...n.position() }));
      cy.destroy();
      cyRef.current = null;
    };
  }, [isEmpty]);

  // Switching the look restyles the canvas in place (positions and zoom stay).
  // Canvas text doesn't swap fonts by itself, so restyle again once the look's font has loaded.
  useEffect(() => {
    cyRef.current?.style(graphStyle(theme));
    let live = true;
    void document.fonts
      ?.load(`13px ${theme.graph.font}`)
      .then(() => live && cyRef.current?.style(graphStyle(theme)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [theme.id, isEmpty]);

  // (Re)load elements and lay out new nodes.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().remove();
    cy.add(buildElements(graph));
    const unplaced = cy.nodes().filter((n) => !positionCache.has(n.id()));
    if (unplaced.length > 0) {
      const layout = cy.layout({ ...LAYOUT, randomize: unplaced.length === cy.nodes().length });
      layout.one('layoutstop', () => afterLayout(cy));
      layout.run();
    }
    frame(cy);
  }, [structureKey, isEmpty]);

  // Filters, overlay and focus are classes on top of the same elements.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass('hidden dim in-set');
      cy.edges().removeData('step');
      if (minRating > 0) cy.edges().filter((e) => (e.data('rating') as number) < minRating).addClass('hidden');

      if (overlay) {
        const steps = new Map<string, number[]>();
        overlay.transitionIds.forEach((tid, i) => {
          if (tid) steps.set(tid, [...(steps.get(tid) ?? []), i + 1]);
        });
        cy.elements().addClass('dim');
        for (const sid of overlay.songIds) cy.getElementById(sid).removeClass('dim').addClass('in-set');
        for (const [tid, nums] of steps) {
          cy.getElementById(tid).removeClass('dim hidden').addClass('in-set').data('step', nums.join(', '));
        }
      } else if (selection?.kind === 'node') {
        const node = cy.getElementById(selection.id);
        if (node.nonempty()) {
          cy.elements().addClass('dim');
          node.closedNeighborhood().removeClass('dim');
        }
      }
    });
    cy.elements().unselect();
    if (selection) cy.getElementById(selection.id).select();
  }, [minRating, overlay, selection, structureKey]);

  // The info sheet takes space below the canvas: resize, and keep the selection visible.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.resize();
    if (selection?.kind === 'node') {
      const node = cy.getElementById(selection.id);
      const p = node.nonempty() ? node.renderedPosition() : null;
      if (p && (p.y < 24 || p.y > cy.height() - 24 || p.x < 24 || p.x > cy.width() - 24)) cy.center(node);
    }
  }, [selection]);

  // Frame the overlay set, or the focused song, when they change.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (overlay && overlay.songIds.length > 0) {
      frame(cy, cy.nodes().filter((n) => overlay.songIds.includes(n.id())));
    } else if (focusId && cy.getElementById(focusId).nonempty()) {
      frame(cy, cy.getElementById(focusId).closedNeighborhood());
    }
  }, [overlay?.id, focusId, isEmpty]);

  const fit = () => {
    if (cyRef.current) frame(cyRef.current);
  };
  const relayout = () => {
    positionCache.clear();
    const cy = cyRef.current;
    if (!cy) return;
    const layout = cy.layout({ ...LAYOUT, randomize: true });
    layout.one('layoutstop', () => afterLayout(cy));
    layout.run();
    frame(cy);
  };

  const chooseSet = (id: string) => {
    setSelection(null);
    navigate(paths.graph({ set: id || undefined }), { replace: true });
  };

  return (
    <>
      <TopBar
        crate
        actions={
          <span className="topbar-stat">
            {Object.keys(graph.songs).length} songs · {Object.keys(graph.transitions).length} mixes
          </span>
        }
      />
      {isEmpty ? (
        <main className="page">
          <EmptyState title="Nothing to draw yet">
            <a className="btn btn-primary" {...linkTo(paths.transitionNew())}>
              Add a transition
            </a>
          </EmptyState>
        </main>
      ) : (
        <main className="graph-page">
          <div className="graph-filters">
            <div className="segmented segmented-inline" role="radiogroup" aria-label="Minimum rating">
              {([0, 3, 4] as MinRating[]).map((r) => (
                <button key={r} type="button" role="radio" aria-checked={minRating === r} className={minRating === r ? 'on' : ''} onClick={() => setMinRating(r)}>
                  {r === 0 ? 'All' : `★${r}+`}
                </button>
              ))}
            </div>
            <select className="input select select-small" value={overlay?.id ?? ''} onChange={(e) => chooseSet(e.target.value)} aria-label="Show a set on the graph">
              <option value="">No set</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <Legend showSet={!!overlay} />
          <div className="graph-canvas-wrap">
            <div ref={container} className="graph-canvas" aria-label="Song graph" role="application" />
            <div className="graph-controls">
              <button type="button" className="btn btn-small" onClick={fit} aria-label="Fit graph to screen" title="Fit to screen">
                Fit
              </button>
              <button type="button" className="btn btn-small" onClick={relayout} aria-label="Re-arrange graph" title="Re-arrange">
                ↻
              </button>
            </div>
          </div>
          <SelectionSheet selection={selection} graph={graph} onClose={() => setSelection(null)} />
        </main>
      )}
    </>
  );
}

function Legend({ showSet }: { showSet: boolean }) {
  const C = EDGE_COLORS[useTheme().scheme];
  const key = (color: string, width: number, dash?: string) => (
    <svg width="22" height="8" aria-hidden="true">
      <line x1="1" y1="4" x2="21" y2="4" stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  );
  return (
    <ul className="legend" aria-label="Edge legend">
      {([2, 3, 4, 5] as const).map((r) => (
        <li key={r}>
          {key(C.ramp[r], WIDTH[r]!)}★{r}
        </li>
      ))}
      <li>{key(C.bad, WIDTH[1]!, '5 3')}doesn't work</li>
      <li>{key(C.unrated, WIDTH[0]!, '1.5 3')}unrated</li>
      {showSet && <li>{key(C.set, 4)}set (numbered)</li>}
    </ul>
  );
}

function SelectionSheet({ selection, graph, onClose }: { selection: Selection; graph: GraphData; onClose: () => void }) {
  const store = useStore();
  if (!selection) return null;

  if (selection.kind === 'node') {
    const song = graph.songs[selection.id];
    if (!song) return null;
    const d = degree(graph, song.id);
    const inSets = Object.values(graph.sets).filter((s) => s.songIds.includes(song.id)).length;
    return (
      <div className="sheet" role="dialog" aria-label={song.title}>
        <div className="sheet-head">
          <span className="picked-main">
            <span className="song-title">{song.title}</span>
            {song.artist && <span className="song-artist">{song.artist}</span>}
          </span>
          <button type="button" className="icon-btn icon-btn-small" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="row tight">
          <BpmBadge bpm={song.bpm} />
          <KeyBadge songKey={song.key} />
          <span className="degree">
            <span className="deg-in">{d.in} in</span> · <span className="deg-out">{d.out} out</span>
            {inSets > 0 && ` · in ${inSets} set${inSets === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="row">
          <a className="btn btn-small btn-primary" {...linkTo(paths.song(song.id))}>
            Open
          </a>
          <a className="btn btn-small" {...linkTo(paths.transitionNew({ from: song.id }))}>
            + Mix into…
          </a>
          <button type="button" className="btn btn-small" onClick={() => createAndOpenSet(store, song.id)}>
            Start set here
          </button>
          <a className="btn btn-small" {...linkTo(paths.freePlay({ start: song.id }))}>
            ▶ Free walk
          </a>
        </div>
      </div>
    );
  }

  const t = graph.transitions[selection.id];
  if (!t) return null;
  const from = graph.songs[t.fromSongId];
  const to = graph.songs[t.toSongId];
  return (
    <div className="sheet" role="dialog" aria-label="Transition">
      <div className="sheet-head">
        <span className="small">
          <strong>{songLabel(from)}</strong> → <strong>{songLabel(to)}</strong>
        </span>
        <button type="button" className="icon-btn icon-btn-small" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <VariantRow transition={t} fromSong={from} toSong={to} editPath={paths.transitionEdit(t.id)} />
      <p className="small muted">Tap the transition to edit it.</p>
    </div>
  );
}


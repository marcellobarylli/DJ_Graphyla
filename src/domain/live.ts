/**
 * Play mode: walking a set live, with the option to leave the plan and
 * walk the graph freely. A live session records what was actually played;
 * the set itself is never changed.
 */
import { GraphError } from './common';
import { outgoing } from './graph';
import { appendGap, appendTransition, createSet } from './sets';
import type { DjSet, GraphData, SongId, Transition, TransitionId } from './types';

export interface LiveStep {
  songId: SongId;
  /** The transition used to reach this song (null for the first song or a gap). */
  viaTransitionId: TransitionId | null;
  /** Position of this song in the set, or null when off the plan. */
  planIndex: number | null;
}

export interface LiveSession {
  setId: string;
  steps: LiveStep[];
}

export interface NextOption {
  toSongId: SongId;
  /** null = the set has a gap here: no known transition. */
  transition: Transition | null;
  /** This is the next step of the set. */
  planned: boolean;
  /** If taken, the walk is back on the set at this position. */
  rejoinsAt: number | null;
}

/**
 * A free walk has no plan: an empty, never-saved set stands in for it, so the
 * same functions work (no planned next step, every way out is an option).
 */
export function freePlan(id: string): DjSet {
  return { id, name: 'Free walk', notes: '', songIds: [], transitionIds: [], createdAt: '', updatedAt: '' };
}

export function startFreeWalk(plan: DjSet, songId: SongId): LiveSession {
  return { setId: plan.id, steps: [{ songId, viaTransitionId: null, planIndex: null }] };
}

/** Going to any song without a known transition (recorded as a gap). */
export function jumpTo(songId: SongId): NextOption {
  return { toSongId: songId, transition: null, planned: false, rejoinsAt: null };
}

export function startLive(set: DjSet): LiveSession {
  const first = set.songIds[0];
  if (first === undefined) throw new GraphError('This set has no songs yet');
  return { setId: set.id, steps: [{ songId: first, viaTransitionId: null, planIndex: 0 }] };
}

export function currentStep(session: LiveSession): LiveStep {
  return session.steps[session.steps.length - 1]!;
}

/** Furthest position in the set reached so far. */
function planProgress(session: LiveSession): number {
  return Math.max(-1, ...session.steps.map((s) => s.planIndex ?? -1));
}

/** The set's next step from here, if the walk is on the plan and the set continues. */
export function plannedNext(graph: GraphData, set: DjSet, session: LiveSession): NextOption | null {
  const { planIndex } = currentStep(session);
  if (planIndex === null || planIndex + 1 >= set.songIds.length) return null;
  const tid = set.transitionIds[planIndex];
  return {
    toSongId: set.songIds[planIndex + 1]!,
    transition: tid ? (graph.transitions[tid] ?? null) : null,
    planned: true,
    rejoinsAt: planIndex + 1,
  };
}

/**
 * Every other way out of the current song, best rated first. Options that lead
 * back to a later song of the set are marked with where they rejoin.
 */
export function otherOptions(graph: GraphData, set: DjSet, session: LiveSession): NextOption[] {
  const current = currentStep(session);
  const planned = plannedNext(graph, set, session);
  const after = planProgress(session);
  return outgoing(graph, current.songId)
    .filter((t) => t.id !== planned?.transition?.id)
    .map((t): NextOption => {
      const j = set.songIds.findIndex((id, i) => i > after && id === t.toSongId);
      return { toSongId: t.toSongId, transition: t, planned: false, rejoinsAt: j === -1 ? null : j };
    })
    .sort((a, b) => (b.transition!.rating ?? 0) - (a.transition!.rating ?? 0) || Number(b.rejoinsAt !== null) - Number(a.rejoinsAt !== null));
}

export function advance(session: LiveSession, option: NextOption): LiveSession {
  const current = currentStep(session);
  if (option.transition && option.transition.fromSongId !== current.songId) {
    throw new GraphError('That transition does not start at the current song');
  }
  return {
    ...session,
    steps: [...session.steps, { songId: option.toSongId, viaTransitionId: option.transition?.id ?? null, planIndex: option.rejoinsAt }],
  };
}

export function stepBack(session: LiveSession): LiveSession {
  if (session.steps.length <= 1) return session;
  return { ...session, steps: session.steps.slice(0, -1) };
}

/** True when what was played differs from the set (other songs or other variants). */
export function leftThePlan(set: DjSet, session: LiveSession): boolean {
  return session.steps.some((s, i) => s.planIndex !== i || (i > 0 && s.viaTransitionId !== set.transitionIds[i - 1]));
}

/** Saves the walk that was actually played as a new set. */
export function saveLiveAsSet(graph: GraphData, session: LiveSession, name: string): { graph: GraphData; set: DjSet } {
  const [first, ...rest] = session.steps;
  if (!first) throw new GraphError('Nothing was played');
  let { graph: next, set } = createSet(graph, { name, startSongId: first.songId });
  for (const step of rest) {
    const t = step.viaTransitionId ? next.transitions[step.viaTransitionId] : undefined;
    next = t ? appendTransition(next, set.id, t.id) : appendGap(next, set.id, step.songId);
  }
  set = next.sets[set.id]!;
  return { graph: next, set };
}

/** Restores a saved session if it still fits the graph; otherwise null. */
export function restoreLive(graph: GraphData, set: DjSet, raw: unknown): LiveSession | null {
  const s = raw as LiveSession | null;
  if (!s || s.setId !== set.id || !Array.isArray(s.steps) || s.steps.length === 0) return null;
  const ok = s.steps.every(
    (step, i) =>
      typeof step.songId === 'string' &&
      !!graph.songs[step.songId] &&
      (step.viaTransitionId === null ||
        (graph.transitions[step.viaTransitionId]?.toSongId === step.songId &&
          graph.transitions[step.viaTransitionId]?.fromSongId === s.steps[i - 1]?.songId)) &&
      (step.planIndex === null || set.songIds[step.planIndex] === step.songId),
  );
  return ok ? { setId: s.setId, steps: s.steps } : null;
}

/* ───────────────────────────── bar clock ───────────────────────────── */

/** Bar the song is at (fractional), from the bar it started at and its tempo (4/4). */
export function barAt(startBar: number, startedAtMs: number, nowMs: number, bpm: number, beatsPerBar = 4): number {
  const elapsed = Math.max(0, nowMs - startedAtMs) / 1000;
  return startBar + (elapsed * bpm) / 60 / beatsPerBar;
}

/** Seconds until `targetBar` at `bpm` (negative once it has passed). */
export function secondsUntilBar(currentBar: number, targetBar: number, bpm: number, beatsPerBar = 4): number {
  return ((targetBar - currentBar) * beatsPerBar * 60) / bpm;
}

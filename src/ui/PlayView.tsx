/**
 * Play mode: a live companion screen while DJing. Shows the song that is on,
 * what comes next and how to mix it, and the ways out of the current song.
 * There is no live bar counter: a tapped clock drifts from the decks, which
 * show the real position. Two modes share this screen:
 *  - set play: follow a saved set, with the option to leave the plan;
 *  - free walk: no set; start at any song and pick from every continuation.
 * The app plays no audio; the songs play on the decks.
 */
import { useEffect, useState } from 'react';
import * as L from '../domain/live';
import { formatBpm } from '../domain/tempo';
import type { DjSet, GraphData, SongId } from '../domain/types';
import { danceSpin, setDanceStart, stopDancing } from '../state/dance';
import { goBack, linkTo, navigate, paths } from '../state/router';
import { useStore } from '../state/store';
import { BpmBadge, EmptyState, KeyBadge, SongSearch, TopBar, VariantRow } from './components';
import { useDancersShown } from './Y2KDancers';

/**
 * When the set got going: the tap on "Get the DJs dancing", or the last
 * mix-in. Only the Y2K Futurism DJs use it, as the beat they dance on.
 * (Saved sessions from the bar clock days also carry a startBar; ignored.)
 */
interface Clock {
  /** Epoch ms. */
  startedAt: number;
}

interface LiveState {
  session: L.LiveSession;
  clock: Clock | null;
}

interface Mode {
  /** The set being played, or the stand-in plan of a free walk. */
  plan: DjSet;
  free: boolean;
  storageKey: string;
  title: string;
  backPath: string;
}

const setKey = (setId: string) => `dj-graphyla:live:${setId}`;
const freeKey = (crateId: string) => `dj-graphyla:live:free:${crateId}`;

function loadLive(graph: GraphData, plan: DjSet, key: string): LiveState | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as { session?: unknown; clock?: Clock } | null;
    const session = L.restoreLive(graph, plan, raw?.session ?? null);
    if (!session) return null;
    const c = raw?.clock;
    const clock = c && typeof c.startedAt === 'number' ? { startedAt: c.startedAt } : null;
    return { session, clock };
  } catch {
    return null;
  }
}

/** "song 3 of 9" if a play session for this set is in progress, else null. */
export function liveProgress(graph: GraphData, set: DjSet): string | null {
  const live = loadLive(graph, set, setKey(set.id));
  if (!live || live.session.steps.length <= 1) return null;
  const { planIndex } = L.currentStep(live.session);
  return planIndex === null ? 'off plan' : `song ${planIndex + 1} of ${set.songIds.length}`;
}

/** Keeps the screen on while play mode is open (where the browser supports it). */
function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;
    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request('screen');
        if (active) lock = next;
        else void next.release();
      } catch {
        /* denied or unsupported: the screen may dim as usual */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);
}

/**
 * Gets the Y2K Futurism chrome DJs dancing (state/dance.ts) once the set got
 * going (`startedAt`), to the tempo of the song that is on. Until then, and
 * after a restart, they stand still; leaving play mode stops them.
 */
function useDancers(bpm: number | null, startedAt: number | null) {
  useEffect(() => setDanceStart(bpm, startedAt), [bpm, startedAt]);
  useEffect(() => stopDancing, []);
}

const shortDate = () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/* ───────────────────────────── entry points ───────────────────────────── */

export function PlayView({ id }: { id: string }) {
  const { graph } = useStore();
  const set = graph.sets[id];
  if (!set || set.songIds.length === 0) {
    return (
      <>
        <TopBar title="Play" back={set ? paths.set(set.id) : paths.sets()} />
        <main className="page">
          <EmptyState title={set ? 'This set has no songs yet.' : 'This set does not exist (anymore).'} />
        </main>
      </>
    );
  }
  const mode: Mode = { plan: set, free: false, storageKey: setKey(set.id), title: set.name, backPath: paths.set(set.id) };
  return <Player mode={mode} graph={graph} initial={loadLive(graph, set, mode.storageKey) ?? { session: L.startLive(set), clock: null }} />;
}

/** Free walk: no set. Resumes a walk in progress, or starts at `start` / a picked song. */
export function FreeWalkView({ start }: { start?: SongId }) {
  const store = useStore();
  const { graph } = store;
  const crateId = store.activeCrate.id;
  const plan = L.freePlan(`free:${crateId}`);
  const key = freeKey(crateId);
  const saved = loadLive(graph, plan, key);
  const [initial, setInitial] = useState<LiveState | null>(() => {
    if (start && graph.songs[start]) {
      // Opening "free walk from <song>" while another walk is under way: ask below instead of overwriting it.
      if (saved && saved.session.steps.length > 1 && saved.session.steps[0]!.songId !== start) return null;
      if (saved && saved.session.steps[0]!.songId === start) return saved;
      return { session: L.startFreeWalk(plan, start), clock: null };
    }
    return saved;
  });

  const mode: Mode = { plan, free: true, storageKey: key, title: 'Free walk', backPath: paths.library() };
  const begin = (songId: SongId) => {
    setInitial({ session: L.startFreeWalk(plan, songId), clock: null });
    navigate(paths.freePlay({ start: songId }), { replace: true });
  };

  if (initial) return <Player key={initial.session.steps[0]!.songId} mode={mode} graph={graph} initial={initial} />;

  const startSong = start ? graph.songs[start] : undefined;
  return (
    <>
      <TopBar title="Free walk" back={paths.library()} />
      <main className="page">
        {saved && startSong ? (
          <section className="card form">
            <h3 className="section-title">A free walk is under way</h3>
            <p className="small muted">
              {saved.session.steps.length} songs so far, now on “{graph.songs[L.currentStep(saved.session).songId]?.title ?? '?'}”.
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={() => setInitial(saved)}>
              Continue that walk
            </button>
            <button type="button" className="btn btn-block" onClick={() => begin(startSong.id)}>
              Start a new walk from “{startSong.title}”
            </button>
          </section>
        ) : Object.keys(graph.songs).length === 0 ? (
          <EmptyState title="No songs in this crate yet.">
            <a className="btn btn-primary" {...linkTo(paths.songNew())}>
              Add a song
            </a>
          </EmptyState>
        ) : (
          <section className="card form">
            <h3 className="section-title">Free walk</h3>
            <p className="small muted">
              No set needed: start with any song, and at every step the app shows all the ways out of the song that is
              playing. Pick one, mix it in, repeat.
            </p>
            <SongSearch graph={graph} onPick={begin} placeholder="Pick the first song…" />
          </section>
        )}
      </main>
    </>
  );
}

/* ───────────────────────────────── player ───────────────────────────────── */

function Player({ mode, graph, initial }: { mode: Mode; graph: GraphData; initial: LiveState }) {
  const store = useStore();
  const { plan, free } = mode;
  const [live, setLive] = useState<LiveState>(initial);
  const [chosen, setChosen] = useState<L.NextOption | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [savedAs, setSavedAs] = useState<{ id: string; name: string } | null>(null);
  const dancersShown = useDancersShown();
  useWakeLock();

  useEffect(() => {
    try {
      localStorage.setItem(mode.storageKey, JSON.stringify(live));
    } catch {
      /* progress just won't survive a reload */
    }
  }, [live, mode.storageKey]);

  const { session, clock } = live;
  const step = L.currentStep(session);
  const song = graph.songs[step.songId];
  const via = step.viaTransitionId ? graph.transitions[step.viaTransitionId] : undefined;
  const planned = L.plannedNext(graph, plan, session);
  const others = L.otherOptions(graph, plan, session);
  // A free walk pre-selects the best-rated way out; a set follows its plan.
  const suggested = free ? (others[0] ?? null) : planned;
  const upNext = chosen ?? suggested;
  const nextSong = upNext ? graph.songs[upNext.toSongId] : undefined;
  const nextT = upNext?.transition ?? null;

  const playingBpm = via?.toBpm ?? song?.bpm ?? null;
  useDancers(playingBpm, clock?.startedAt ?? null);
  // A full-song overlap: both songs keep playing together.
  const fullOverlap = via?.overlapBars === 'full';
  const ride = nextT?.fromBpm != null && playingBpm !== null ? Math.round((nextT.fromBpm - playingBpm) * 10) / 10 : null;
  const offPlan = !free && L.leftThePlan(plan, session);
  const position = free
    ? `${session.steps.length} played`
    : step.planIndex === null
      ? 'off plan'
      : `${step.planIndex + 1} / ${plan.songIds.length}`;
  const listOpen = free || showOthers || !upNext;

  const upNextLabel = !upNext
    ? ''
    : upNext.transition === null && !upNext.planned
      ? 'jump'
      : free
        ? chosen
          ? 'your pick'
          : 'best rated'
        : upNext.planned
          ? 'from your set'
          : upNext.rejoinsAt !== null
            ? `back to the set at song ${upNext.rejoinsAt + 1}`
            : 'off plan';

  const startDancing = () => setLive({ ...live, clock: { startedAt: Date.now() } });

  const pick = (option: L.NextOption) => {
    setChosen(option);
    setShowOthers(false);
    setJumping(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const mixIn = () => {
    if (!upNext) return;
    const at = Date.now();
    setLive({ session: L.advance(session, upNext), clock: { startedAt: at } });
    // The DJs (start dancing if they weren't and) spin for two beats from this moment, landing on their new beat.
    danceSpin(at);
    setChosen(null);
    setShowOthers(false);
    setJumping(false);
  };

  const back = () => {
    // The music is still playing: the DJs keep dancing.
    setLive({ session: L.stepBack(session), clock });
    setChosen(null);
  };

  const restart = () => {
    if (!confirm('Start again from the first song?')) return;
    const first = session.steps[0]!.songId;
    setLive({ session: free ? L.startFreeWalk(plan, first) : L.startLive(plan), clock: null });
    setChosen(null);
    setSavedAs(null);
  };

  const savePlayed = () => {
    const name = free ? `Free walk (${shortDate()})` : `${plan.name} (played ${shortDate()})`;
    const played = store.batch((g) => {
      const r = L.saveLiveAsSet(g, session, name);
      return { graph: r.graph, result: r.set };
    });
    setSavedAs({ id: played.id, name: played.name });
  };

  const finish = () => {
    try {
      localStorage.removeItem(mode.storageKey);
    } catch {
      /* ignore */
    }
    goBack(mode.backPath);
  };

  const deadEnd = others.length === 0 && !planned;

  return (
    <>
      <TopBar title={mode.title} back={mode.backPath} actions={<span className="topbar-stat">{position}</span>} />
      <main className="page play">
        <section className="card play-now" aria-live="polite">
          <p className="play-label">Now playing</p>
          <h2 className="play-title">{song?.title ?? 'Unknown song'}</h2>
          {song?.artist && <p className="play-artist">{song.artist}</p>}
          <div className="row tight">
            {playingBpm !== null && <span className="badge">playing @ {formatBpm(playingBpm)}</span>}
            {song?.bpm != null && song.bpm !== playingBpm && <BpmBadge bpm={song.bpm} />}
            <KeyBadge songKey={song?.key ?? ''} />
            {offPlan && <span className="badge badge-tag">off plan</span>}
          </div>

          {fullOverlap && <p className="play-status">Both playing: full song overlap</p>}
          {dancersShown && !clock && (
            <div className="play-start">
              <button type="button" className="btn btn-block" onClick={startDancing}>
                ▶ Get the DJs dancing
              </button>
            </div>
          )}
        </section>

        {upNext ? (
          <section className={`card up-next${upNext.planned ? '' : ' is-off'}`}>
            <p className="play-label">Up next · {upNextLabel}</p>
            <h3 className="up-next-title">{nextSong?.title ?? 'Unknown song'}</h3>
            {nextSong?.artist && <p className="play-artist">{nextSong.artist}</p>}
            {nextT ? (
              <>
                <VariantRow transition={nextT} fromSong={song} toSong={nextSong} hideNotes />
                {ride !== null && ride !== 0 && (
                  <p className="pitch small">
                    Ride the tempo {ride > 0 ? '+' : '−'}
                    {formatBpm(Math.abs(ride))} BPM to {formatBpm(nextT.fromBpm)} before the mix
                  </p>
                )}
                {nextT.notes && <p className="play-note">{nextT.notes}</p>}
              </>
            ) : (
              <p className="gap-note">
                {upNext.planned
                  ? 'Gap in the set: no known transition into this song. Work it out live, or pick another way out below.'
                  : 'No known transition into this song: work it out live. It is saved as a gap if you keep this walk.'}
              </p>
            )}
            {chosen && suggested && (
              <button type="button" className="link-btn small" onClick={() => setChosen(null)}>
                {free ? 'Back to the best-rated way out' : 'Back to the planned next song'}
              </button>
            )}
          </section>
        ) : deadEnd ? (
          <section className="card up-next">
            <p className="play-label">{free ? 'Dead end' : 'End of the walk'}</p>
            <p className="small muted">No known way out of this song.{free ? ' Jump to any song below to keep going.' : ''}</p>
          </section>
        ) : (
          <section className="card up-next is-off">
            <p className="play-label">Up next · pick a way out</p>
            <p className="small muted">
              {step.planIndex === plan.songIds.length - 1 ? 'That was the last song of the set.' : 'You are off the plan.'} Choose below.
            </p>
          </section>
        )}

        {others.length > 0 && (
          <section className="section">
            {free ? (
              <h3 className="section-title">
                All ways out <span className="count">{others.length}</span>
              </h3>
            ) : (
              <button type="button" className="btn btn-block" aria-expanded={listOpen} onClick={() => setShowOthers(!showOthers)}>
                {listOpen ? 'Hide' : 'Other ways out'} ({others.length})
              </button>
            )}
            {listOpen && (
              <ul className="groups">
                {others.map((o) => {
                  const to = graph.songs[o.toSongId];
                  return (
                    <li key={o.transition!.id} className="group">
                      <div className="group-head">
                        <span className="group-song">
                          <span className="group-arrow" aria-hidden="true">→</span>
                          <span className="song-title">{to?.title ?? '?'}</span>
                        </span>
                        {o.rejoinsAt !== null && <span className="badge badge-active">back to set · song {o.rejoinsAt + 1}</span>}
                        {free && session.steps.some((s) => s.songId === o.toSongId) && <span className="badge badge-tag">played</span>}
                      </div>
                      <VariantRow
                        transition={o.transition!}
                        fromSong={song}
                        toSong={to}
                        selected={upNext?.transition?.id === o.transition!.id}
                        onSelect={() => pick(o)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        <section className="section">
          <button type="button" className="btn btn-block" aria-expanded={jumping || (free && deadEnd)} onClick={() => setJumping(!jumping)}>
            Jump to any song…
          </button>
          {(jumping || (free && deadEnd)) && (
            <SongSearch graph={graph} onPick={(id) => pick(L.jumpTo(id))} placeholder="Search the crate…" />
          )}
        </section>

        {(offPlan || (free && session.steps.length > 1)) && (
          <section className="card form">
            <p className="small muted">
              {free ? 'Keep this walk as a set?' : 'You left the plan. Keep what you actually played as its own set?'}
            </p>
            {savedAs ? (
              <p className="notice">
                Saved as <a {...linkTo(paths.set(savedAs.id))}>“{savedAs.name}”</a>.
              </p>
            ) : (
              <button type="button" className="btn btn-block" onClick={savePlayed}>
                {free ? 'Save this walk as a set' : 'Save what I played as a set'}
              </button>
            )}
          </section>
        )}

        <div className="row play-secondary">
          <button type="button" className="btn btn-small" onClick={restart}>
            Restart
          </button>
          <button type="button" className="btn btn-small" onClick={finish}>
            {free ? 'End free walk' : 'End play mode'}
          </button>
        </div>
      </main>

      <div className="play-actions">
        <button type="button" className="btn" onClick={back} disabled={session.steps.length <= 1}>
          ◀ Back
        </button>
        <button type="button" className="btn btn-primary" onClick={mixIn} disabled={!upNext}>
          Mix in next ▶
        </button>
      </div>
    </>
  );
}

/**
 * Play mode: a live companion screen while DJing a set. Shows the song that
 * is on, what comes next and how to mix it, a bar clock estimated from the
 * tempo, and every other way out of the current song for walking the graph
 * off-script. The app plays no audio; the songs play on the decks.
 */
import { useEffect, useState } from 'react';
import * as L from '../domain/live';
import { formatBpm } from '../domain/tempo';
import type { DjSet, GraphData } from '../domain/types';
import { goBack, linkTo, paths } from '../state/router';
import { useStore } from '../state/store';
import { BpmBadge, EmptyState, KeyBadge, TopBar, VariantRow } from './components';

interface Clock {
  /** Bar the song was at when the clock started. */
  startBar: number;
  /** Epoch ms when it was at that bar. */
  startedAt: number;
}

interface LiveState {
  session: L.LiveSession;
  clock: Clock | null;
}

const liveKey = (setId: string) => `dj-graphyla:live:${setId}`;

function loadLive(graph: GraphData, set: DjSet): LiveState | null {
  try {
    const raw = JSON.parse(localStorage.getItem(liveKey(set.id)) ?? 'null') as { session?: unknown; clock?: Clock } | null;
    const session = L.restoreLive(graph, set, raw?.session ?? null);
    if (!session) return null;
    const c = raw?.clock;
    const clock = c && typeof c.startBar === 'number' && typeof c.startedAt === 'number' ? c : null;
    return { session, clock };
  } catch {
    return null;
  }
}

/** "song 3 of 9" if a play session for this set is in progress, else null. */
export function liveProgress(graph: GraphData, set: DjSet): string | null {
  const live = loadLive(graph, set);
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

const mmss = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

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
  return <Player set={set} graph={graph} />;
}

function Player({ set, graph }: { set: DjSet; graph: GraphData }) {
  const store = useStore();
  const [live, setLive] = useState<LiveState>(() => loadLive(graph, set) ?? { session: L.startLive(set), clock: null });
  const [chosen, setChosen] = useState<L.NextOption | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [savedAs, setSavedAs] = useState<{ id: string; name: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useWakeLock();

  useEffect(() => {
    try {
      localStorage.setItem(liveKey(set.id), JSON.stringify(live));
    } catch {
      /* progress just won't survive a reload */
    }
  }, [live, set.id]);

  useEffect(() => {
    if (!live.clock) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [live.clock]);

  const { session, clock } = live;
  const step = L.currentStep(session);
  const song = graph.songs[step.songId];
  const via = step.viaTransitionId ? graph.transitions[step.viaTransitionId] : undefined;
  const planned = L.plannedNext(graph, set, session);
  const others = L.otherOptions(graph, set, session);
  const upNext = chosen ?? planned;
  const nextSong = upNext ? graph.songs[upNext.toSongId] : undefined;
  const nextT = upNext?.transition ?? null;

  const playingBpm = via?.toBpm ?? song?.bpm ?? null;
  const bar = clock && playingBpm ? L.barAt(clock.startBar, clock.startedAt, now, playingBpm) : null;
  const target = nextT?.fromBar ?? null;
  const toGo = bar !== null && target !== null && playingBpm ? L.secondsUntilBar(bar, target, playingBpm) : null;
  const barsToGo = bar !== null && target !== null ? target - bar : null;
  const overlapEnd = via?.overlapBars ? (via.toBar ?? 1) + via.overlapBars : null;
  const inOverlap = bar !== null && overlapEnd !== null && bar < overlapEnd;
  const ride = nextT?.fromBpm != null && playingBpm !== null ? Math.round((nextT.fromBpm - playingBpm) * 10) / 10 : null;
  const offPlan = L.leftThePlan(set, session);
  const position = step.planIndex === null ? 'off plan' : `${step.planIndex + 1} / ${set.songIds.length}`;

  const startClock = () => setLive({ ...live, clock: { startBar: via?.toBar ?? 1, startedAt: Date.now() } });
  const nudge = (bars: number) => clock && setLive({ ...live, clock: { ...clock, startBar: clock.startBar + bars } });

  const mixIn = () => {
    if (!upNext) return;
    setLive({ session: L.advance(session, upNext), clock: { startBar: upNext.transition?.toBar ?? 1, startedAt: Date.now() } });
    setNow(Date.now());
    setChosen(null);
    setShowOthers(false);
  };

  const back = () => {
    setLive({ session: L.stepBack(session), clock: null });
    setChosen(null);
  };

  const restart = () => {
    if (!confirm('Start again from the first song?')) return;
    setLive({ session: L.startLive(set), clock: null });
    setChosen(null);
    setSavedAs(null);
  };

  const savePlayed = () => {
    const name = `${set.name} (played ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})`;
    const played = store.batch((g) => {
      const r = L.saveLiveAsSet(g, session, name);
      return { graph: r.graph, result: r.set };
    });
    setSavedAs({ id: played.id, name: played.name });
  };

  const finish = () => {
    try {
      localStorage.removeItem(liveKey(set.id));
    } catch {
      /* ignore */
    }
    goBack(paths.set(set.id));
  };

  const atEnd = !upNext && others.length === 0;

  return (
    <>
      <TopBar title={set.name} back={paths.set(set.id)} actions={<span className="topbar-stat">{position}</span>} />
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

          <div className="clock">
            {!playingBpm ? (
              <p className="small muted">Add a BPM to this song to get a bar clock.</p>
            ) : bar === null ? (
              <button type="button" className="btn btn-block" onClick={startClock}>
                ▶ Start bar clock {via?.toBar ? `at bar ${via.toBar}` : 'at bar 1'}
              </button>
            ) : (
              <>
                <div className="clock-row">
                  <span className="clock-bar" aria-label={`About bar ${Math.floor(bar)}`}>
                    <span className="clock-approx">≈ bar</span> {Math.floor(bar)}
                  </span>
                  <span className="row tight">
                    <button type="button" className="chip-btn chip-btn-flush" onClick={() => nudge(-1)} aria-label="One bar back">
                      −1
                    </button>
                    <button type="button" className="chip-btn chip-btn-flush" onClick={() => nudge(1)} aria-label="One bar forward">
                      +1
                    </button>
                  </span>
                </div>
                {inOverlap && overlapEnd !== null && (
                  <p className="clock-status overlap">Both playing: previous song out in {Math.ceil(overlapEnd - bar)} bars</p>
                )}
                {target !== null && barsToGo !== null && toGo !== null && (
                  <p className={`clock-status${barsToGo <= 0 ? ' now' : barsToGo <= 8 ? ' soon' : ''}`}>
                    {barsToGo <= 0
                      ? `Mix now: past bar ${target}`
                      : barsToGo <= 8
                        ? `Get ready: mix out at bar ${target} in ${Math.ceil(barsToGo)} bars`
                        : `Mix out at bar ${target} · in ${mmss(toGo)}`}
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        {upNext ? (
          <section className={`card up-next${upNext.planned ? '' : ' is-off'}`}>
            <p className="play-label">
              Up next · {upNext.planned ? 'from your set' : upNext.rejoinsAt !== null ? `back to the set at song ${upNext.rejoinsAt + 1}` : 'off plan'}
            </p>
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
              <p className="gap-note">Gap in the set: no known transition into this song. Work it out live, or pick another way out below.</p>
            )}
            {chosen && planned && (
              <button type="button" className="link-btn small" onClick={() => setChosen(null)}>
                Back to the planned next song
              </button>
            )}
          </section>
        ) : atEnd ? (
          <section className="card up-next">
            <p className="play-label">End of the walk</p>
            <p className="small muted">No known way out of this song.</p>
          </section>
        ) : (
          <section className="card up-next is-off">
            <p className="play-label">Up next · pick a way out</p>
            <p className="small muted">{step.planIndex === set.songIds.length - 1 ? 'That was the last song of the set.' : 'You are off the plan.'} Choose below.</p>
          </section>
        )}

        {others.length > 0 && (
          <section className="section">
            <button
              type="button"
              className="btn btn-block"
              aria-expanded={showOthers || !upNext}
              onClick={() => setShowOthers(!showOthers)}
            >
              {showOthers || !upNext ? 'Hide' : 'Other ways out'} ({others.length})
            </button>
            {(showOthers || !upNext) && (
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
                      </div>
                      <VariantRow
                        transition={o.transition!}
                        fromSong={song}
                        toSong={to}
                        selected={chosen?.transition?.id === o.transition!.id}
                        onSelect={() => {
                          setChosen(o);
                          setShowOthers(false);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {offPlan && (
          <section className="card form">
            <p className="small muted">You left the plan. Keep what you actually played as its own set?</p>
            {savedAs ? (
              <p className="notice">
                Saved as <a {...linkTo(paths.set(savedAs.id))}>“{savedAs.name}”</a>.
              </p>
            ) : (
              <button type="button" className="btn btn-block" onClick={savePlayed}>
                Save what I played as a set
              </button>
            )}
          </section>
        )}

        <div className="row play-secondary">
          <button type="button" className="btn btn-small" onClick={restart}>
            Restart
          </button>
          <button type="button" className="btn btn-small" onClick={finish}>
            End play mode
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

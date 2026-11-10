import { useState, type FormEvent } from 'react';
import { findSimilarSong } from '../domain/dedupe';
import * as G from '../domain/graph';
import { formatBar, formatOverlap, overlapSeconds, parseBar } from '../domain/position';
import { setsUsingTransition } from '../domain/sets';
import { formatTimestamp, parseTimestamp } from '../domain/time';
import { formatBpm, parseBpm } from '../domain/tempo';
import { FULL_OVERLAP, type GraphData, type SongId, type TransitionInput } from '../domain/types';
import { goBack, navigate, paths } from '../state/router';
import { useStore } from '../state/store';
import { BarField, BpmBadge, BpmField, EmptyState, KeyBadge, StarRating, TextArea, TimeField, TopBar, VariantRow } from './components';
import { SongFields, draftFromOnline, draftToSongInput, emptySongDraft, type SongDraft } from './SongForm';
import { OnlineSongList, useSuggestedOnlineSongs } from './OnlineSongs';

type SongChoice = { kind: 'none' } | { kind: 'existing'; songId: SongId } | { kind: 'new'; draft: SongDraft };

interface Draft {
  from: SongChoice;
  to: SongChoice;
  fromBar: string;
  toBar: string;
  fromTime: string;
  toTime: string;
  fromBpm: string;
  toBpm: string;
  overlap: string;
  rating: number | null;
  notes: string;
  /** Sounds good together, transition not worked out yet. */
  idea: boolean;
}

const choiceFor = (graph: GraphData, id: string | undefined): SongChoice =>
  id && graph.songs[id] ? { kind: 'existing', songId: id } : { kind: 'none' };

function choiceBpm(graph: GraphData, c: SongChoice): number | null {
  if (c.kind === 'existing') return graph.songs[c.songId]?.bpm ?? null;
  if (c.kind === 'new') {
    const bpm = parseBpm(c.draft.bpm);
    return bpm !== null && Number.isFinite(bpm) ? bpm : null;
  }
  return null;
}

export function TransitionForm(props: { id?: string; from?: string; to?: string; idea?: boolean }) {
  const store = useStore();
  const { graph } = store;
  const existing = props.id ? graph.transitions[props.id] : undefined;

  const [draft, setDraft] = useState<Draft>(() =>
    existing
      ? {
          from: choiceFor(graph, existing.fromSongId),
          to: choiceFor(graph, existing.toSongId),
          fromBar: formatBar(existing.fromBar),
          toBar: formatBar(existing.toBar),
          fromTime: formatTimestamp(existing.fromTime),
          toTime: formatTimestamp(existing.toTime),
          fromBpm: formatBpm(existing.fromBpm),
          toBpm: formatBpm(existing.toBpm),
          overlap: existing.overlapBars === FULL_OVERLAP ? FULL_OVERLAP : formatBar(existing.overlapBars),
          rating: existing.rating,
          notes: existing.notes,
          idea: !!existing.idea,
        }
      : {
          from: choiceFor(graph, props.from),
          to: choiceFor(graph, props.to),
          fromBar: '',
          toBar: '',
          fromTime: '',
          toTime: '',
          fromBpm: '',
          toBpm: '',
          overlap: '',
          rating: null,
          notes: '',
          idea: props.idea ?? false,
        },
  );
  const [errors, setErrors] = useState<G.FieldErrors>({});
  const [newSongErrors, setNewSongErrors] = useState<{ from: G.FieldErrors; to: G.FieldErrors }>({ from: {}, to: {} });
  const [formError, setFormError] = useState('');

  if (props.id && !existing) {
    return (
      <>
        <TopBar title="Edit transition" back={paths.library()} />
        <main className="page">
          <EmptyState title="This transition does not exist (anymore)." />
        </main>
      </>
    );
  }

  const set = <K extends keyof Draft>(k: K) => (v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const swap = () =>
    setDraft((d) => ({
      ...d,
      from: d.to,
      to: d.from,
      fromBar: d.toBar,
      toBar: d.fromBar,
      fromTime: d.toTime,
      toTime: d.fromTime,
      fromBpm: d.toBpm,
      toBpm: d.fromBpm,
    }));

  const fallbackBack = existing
    ? paths.song(existing.fromSongId)
    : draft.from.kind === 'existing'
      ? paths.song(draft.from.songId)
      : paths.library();

  /** Validates everything, writes songs + transition in one update, returns the edge's endpoints. */
  const save = (): { fromId: SongId; toId: SongId } | null => {
    const errs: G.FieldErrors = {};
    const songErrs = { from: {} as G.FieldErrors, to: {} as G.FieldErrors };

    for (const side of ['from', 'to'] as const) {
      const choice = draft[side];
      if (choice.kind === 'none') {
        errs[`${side}SongId`] = side === 'from' ? 'Pick the song that is playing' : 'Pick the song you mix in';
      } else if (choice.kind === 'new') {
        songErrs[side] = G.validateSongInput(draftToSongInput(choice.draft));
      }
    }

    const parseTime = (raw: string, key: string) => {
      const t = parseTimestamp(raw);
      if (raw.trim() && t === null) errs[key] = 'Use m:ss, or digits only (132 → 1:32)';
      return t;
    };
    const fromBar = parseBar(draft.fromBar);
    const toBar = parseBar(draft.toBar);
    const fromTime = parseTime(draft.fromTime, 'fromTime');
    const toTime = parseTime(draft.toTime, 'toTime');
    const fromBpm = parseBpm(draft.fromBpm);
    // Blank incoming tempo = beatmatched to the outgoing one.
    const toBpm = draft.toBpm.trim() === '' ? fromBpm : parseBpm(draft.toBpm);

    const overlapBars = draft.overlap === FULL_OVERLAP ? FULL_OVERLAP : parseBar(draft.overlap);
    const partial = { fromBar, toBar, fromTime, toTime, fromBpm, toBpm, overlapBars, rating: draft.rating, notes: draft.notes, idea: draft.idea };
    // Song ids are checked above; the domain checks times, tempos and rating.
    const numericErrors = { ...G.validateTransitionFields(partial), ...errs };

    setErrors(numericErrors);
    setNewSongErrors(songErrs);
    setFormError('');
    if (Object.keys(numericErrors).length || Object.keys(songErrs.from).length || Object.keys(songErrs.to).length) {
      return null;
    }

    try {
      return store.batch((g) => {
        let next = g;
        const resolve = (choice: SongChoice): SongId => {
          if (choice.kind === 'existing') return choice.songId;
          if (choice.kind === 'new') {
            const r = G.addSong(next, draftToSongInput(choice.draft));
            next = r.graph;
            return r.song.id;
          }
          throw new G.GraphError('Pick both songs');
        };
        const fromId = resolve(draft.from);
        const toId = resolve(draft.to);
        const input: TransitionInput = { fromSongId: fromId, toSongId: toId, ...partial };
        next = existing ? G.updateTransition(next, existing.id, input) : G.addTransition(next, input).graph;
        return { graph: next, result: { fromId, toId } };
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const saved = save();
    if (saved) goBack(paths.song(saved.fromId));
  };

  const onSaveAndContinue = () => {
    const saved = save();
    if (saved) navigate(paths.transitionNew({ from: saved.toId }), { replace: true });
  };

  const onDelete = () => {
    if (!existing) return;
    const inSets = setsUsingTransition(graph, existing.id).length;
    const warning = inSets
      ? `Delete this transition? It is used in ${inSets} set${inSets === 1 ? '' : 's'}; there it becomes a gap you can fill later.`
      : 'Delete this transition?';
    if (!confirm(warning)) return;
    store.deleteTransition(existing.id);
    goBack(paths.song(existing.fromSongId));
  };

  const fromId = draft.from.kind === 'existing' ? draft.from.songId : null;
  const toId = draft.to.kind === 'existing' ? draft.to.songId : null;
  const siblings = fromId && toId ? G.transitionsBetween(graph, fromId, toId).filter((t) => t.id !== existing?.id) : [];
  const fromBpmNumber = parseBpm(draft.fromBpm);

  return (
    <>
      <TopBar
        title={existing ? (draft.idea ? 'Edit idea' : 'Edit transition') : draft.idea ? 'New idea' : 'New transition'}
        back={fallbackBack}
      />
      <main className="page">
        <form className="form transition-form" onSubmit={onSubmit} noValidate>
          <IdeaToggle value={draft.idea} onChange={set('idea')} />
          <fieldset className="card side-card side-card-out">
            <legend className="side-legend">
              <span className="side-dot" /> Playing — mix out of
            </legend>
            <SongPicker
              choice={draft.from}
              onChange={set('from')}
              error={errors.fromSongId}
              newSongErrors={newSongErrors.from}
            />
            <div className="grid-2">
              <BarField label="Mix out at bar" value={draft.fromBar} onChange={set('fromBar')} error={errors.fromBar} />
              <BpmField
                label="Out BPM"
                value={draft.fromBpm}
                onChange={set('fromBpm')}
                error={errors.fromBpm}
                originalBpm={choiceBpm(graph, draft.from)}
              />
            </div>
            <OptionalTime label="Mix out at (time)" value={draft.fromTime} onChange={set('fromTime')} error={errors.fromTime} />
          </fieldset>

          <div className="flow">
            <span className="flow-line" />
            <button type="button" className="chip-btn" onClick={swap} title="Swap direction">
              ⇅ swap
            </button>
            <span className="flow-line" />
          </div>

          <fieldset className="card side-card side-card-in">
            <legend className="side-legend">
              <span className="side-dot" /> Next — mix into
            </legend>
            <SongPicker choice={draft.to} onChange={set('to')} error={errors.toSongId} newSongErrors={newSongErrors.to} />
            <div className="grid-2">
              <BarField label="Mix in at bar" value={draft.toBar} onChange={set('toBar')} error={errors.toBar} />
              <BpmField
                label="In BPM"
                value={draft.toBpm}
                onChange={set('toBpm')}
                error={errors.toBpm}
                originalBpm={choiceBpm(graph, draft.to)}
                extraHint={
                  !draft.toBpm && fromBpmNumber !== null && Number.isFinite(fromBpmNumber)
                    ? `Blank = ${formatBpm(fromBpmNumber)} (same as out)`
                    : undefined
                }
              />
            </div>
            <OptionalTime label="Mix in at (time)" value={draft.toTime} onChange={set('toTime')} error={errors.toTime} />
          </fieldset>

          {siblings.length > 0 && (
            <div className="card siblings">
              <p className="small muted">
                {siblings.length === 1 ? 'One other variant' : `${siblings.length} other variants`} for this pair already
                saved — this one is added alongside:
              </p>
              {siblings.map((t) => (
                <VariantRow
                  key={t.id}
                  transition={t}
                  fromSong={graph.songs[t.fromSongId]}
                  toSong={graph.songs[t.toSongId]}
                  editPath={paths.transitionEdit(t.id)}
                />
              ))}
            </div>
          )}

          <div className="card form">
            <OverlapField
              value={draft.overlap}
              onChange={set('overlap')}
              error={errors.overlapBars}
              fromBar={parseBar(draft.fromBar)}
              toBar={parseBar(draft.toBar)}
              bpm={(() => {
                const b = fromBpmNumber ?? parseBpm(draft.toBpm);
                return b !== null && Number.isFinite(b) ? b : null;
              })()}
            />
            <StarRating value={draft.rating} onChange={set('rating')} />
            <TextArea
              label="Notes"
              value={draft.notes}
              onChange={set('notes')}
              placeholder={draft.idea ? 'Same vocal mood, try the breakdown…' : 'Bass swap on the drop, filter out the vocal…'}
            />
          </div>

          {formError && <p className="field-error">{formError}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-block">
              {existing ? 'Save changes' : draft.idea ? 'Save idea' : 'Save transition'}
            </button>
            {!existing && (
              <button type="button" className="btn btn-block" onClick={onSaveAndContinue}>
                Save & continue from next song →
              </button>
            )}
            {existing && (
              <button type="button" className="btn btn-danger btn-block" onClick={onDelete}>
                Delete transition
              </button>
            )}
          </div>
        </form>
      </main>
    </>
  );
}

/** Marks the pair as an idea: it goes well together, the mix itself is still open. */
function IdeaToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`card idea-toggle${value ? ' on' : ''}`}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="idea-toggle-title">Idea: transition not found yet</span>
        <span className="small muted">
          {value
            ? 'Saved as a pair that sounds good together. Everything below is optional; untick once you have worked out the mix.'
            : 'Tick to save that these two go well together, without mix points.'}
        </span>
      </span>
    </label>
  );
}

const OVERLAP_PRESETS = [4, 8, 16, 32];

/** How long both songs play together, in bars or the full song, with one-tap presets. */
function OverlapField(props: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  fromBar: number | null;
  toBar: number | null;
  bpm: number | null;
}) {
  const full = props.value === FULL_OVERLAP;
  const bars = full ? null : parseBar(props.value);
  const valid = bars !== null && Number.isInteger(bars) && bars >= 1;
  const seconds = valid ? overlapSeconds(bars, props.bpm) : null;
  const outBy = valid && props.fromBar !== null && Number.isInteger(props.fromBar) ? props.fromBar + bars : null;
  const inFullyBy = valid && props.toBar !== null && Number.isInteger(props.toBar) ? props.toBar + bars : null;
  return (
    <div className={`field${props.error ? ' has-error' : ''}`}>
      <label className="field-label" htmlFor="overlap-input">
        Overlap — both songs playing
      </label>
      <div className="overlap-row">
        <span className="input-with-suffix">
          <input
            id="overlap-input"
            className="input"
            inputMode="numeric"
            placeholder="—"
            value={full ? '' : props.value}
            onChange={(e) => props.onChange(e.target.value)}
            autoComplete="off"
            aria-describedby={full ? 'overlap-full-hint' : undefined}
          />
          <span className="input-suffix">bars</span>
        </span>
        <span className="presets" role="group" aria-label="Overlap presets">
          {OVERLAP_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              className={`chip-btn chip-btn-flush${bars === n ? ' on' : ''}`}
              aria-pressed={bars === n}
              onClick={() => props.onChange(bars === n ? '' : String(n))}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            className={`chip-btn chip-btn-flush${full ? ' on' : ''}`}
            aria-pressed={full}
            title="Both songs play together for the whole song"
            onClick={() => props.onChange(full ? '' : FULL_OVERLAP)}
          >
            Full song
          </button>
        </span>
      </div>
      {props.error ? (
        <p className="field-error">{props.error}</p>
      ) : full ? (
        <p className="field-hint" id="overlap-full-hint">
          Both songs play together for the whole song (layered).
        </p>
      ) : (
        valid && (
          <ul className="field-hint hint-lines">
            {outBy !== null && <li>Outgoing song is out by bar {outBy}</li>}
            {inFullyBy !== null && <li>Next song plays alone from bar {inFullyBy}</li>}
            {seconds !== null && (
              <li>
                {formatOverlap(bars)} ≈ {seconds} s at {formatBpm(props.bpm)} BPM (4/4)
              </li>
            )}
          </ul>
        )
      )}
    </div>
  );
}

/** Timestamp field, hidden behind a chip until needed (bars are the main unit). */
function OptionalTime(props: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  const [open, setOpen] = useState(() => props.value !== '' || !!props.error);
  if (!open && !props.error) {
    return (
      <div>
        <button type="button" className="chip-btn chip-btn-flush" onClick={() => setOpen(true)}>
          + add timestamp (m:ss)
        </button>
      </div>
    );
  }
  return <TimeField label={props.label} value={props.value} onChange={props.onChange} error={props.error} />;
}

/** Pick an existing song, or type a new name and fill in a mini song card. */
function SongPicker({
  choice,
  onChange,
  error,
  newSongErrors,
}: {
  choice: SongChoice;
  onChange: (c: SongChoice) => void;
  error?: string;
  newSongErrors: G.FieldErrors;
}) {
  const { graph } = useStore();
  const [query, setQuery] = useState('');
  // Songs from the online catalogue, below the crate's own matches.
  const online = useSuggestedOnlineSongs(query, '', choice.kind === 'none');

  if (choice.kind === 'existing') {
    const song = graph.songs[choice.songId];
    return (
      <div className="picked">
        <div className="picked-main">
          <span className="song-title">{song?.title ?? 'Unknown song'}</span>
          {song?.artist && <span className="song-artist">{song.artist}</span>}
        </div>
        <div className="row tight">
          <BpmBadge bpm={song?.bpm ?? null} />
          <KeyBadge songKey={song?.key ?? ''} />
          <button type="button" className="chip-btn" onClick={() => onChange({ kind: 'none' })}>
            Change
          </button>
        </div>
      </div>
    );
  }

  if (choice.kind === 'new') {
    const dup = G.findDuplicateSong(graph, choice.draft.title, choice.draft.artist);
    const similar = dup ? undefined : findSimilarSong(graph, choice.draft.title, choice.draft.artist);
    return (
      <div className="new-song">
        <div className="new-song-head">
          <span className="badge badge-new">New song</span>
          <button
            type="button"
            className="chip-btn"
            onClick={() => {
              setQuery(choice.draft.title);
              onChange({ kind: 'none' });
            }}
          >
            Pick existing instead
          </button>
        </div>
        <SongFields draft={choice.draft} onChange={(draft) => onChange({ kind: 'new', draft })} errors={newSongErrors} compact />
        {dup && (
          <p className="warning">
            Already in your library.{' '}
            <button type="button" className="link-btn" onClick={() => onChange({ kind: 'existing', songId: dup.id })}>
              Use “{G.songLabel(dup)}”
            </button>
          </p>
        )}
        {similar && (
          <p className="warning">
            Did you mean{' '}
            <button type="button" className="link-btn" onClick={() => onChange({ kind: 'existing', songId: similar.id })}>
              “{G.songLabel(similar)}”
            </button>
            ? It’s already in your library.
          </p>
        )}
      </div>
    );
  }

  const results = query.trim()
    ? G.searchSongs(graph, query).slice(0, 6)
    : Object.values(graph.songs)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5);
  const exact = query.trim() && results.some((s) => s.title.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className={`picker${error ? ' has-error' : ''}`}>
      <input
        className="input"
        type="search"
        placeholder="Search your songs or type a new one…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        aria-label="Song"
      />
      <ul className="picker-results">
        {!query.trim() && results.length > 0 && <li className="picker-caption">Recent</li>}
        {results.map((s) => (
          <li key={s.id}>
            <button type="button" className="picker-option" onClick={() => onChange({ kind: 'existing', songId: s.id })}>
              <span>
                <span className="song-title">{s.title}</span>
                {s.artist && <span className="song-artist"> — {s.artist}</span>}
              </span>
              <BpmBadge bpm={s.bpm} />
            </button>
          </li>
        ))}
        {!exact && (
          <li>
            <button
              type="button"
              className="picker-option picker-new"
              onClick={() => onChange({ kind: 'new', draft: emptySongDraft(query.trim()) })}
            >
              + {query.trim() ? `New song “${query.trim()}”` : 'New song'}
            </button>
          </li>
        )}
      </ul>
      <OnlineSongList {...online} query={query} onPick={(song) => onChange({ kind: 'new', draft: draftFromOnline(song) })} />
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

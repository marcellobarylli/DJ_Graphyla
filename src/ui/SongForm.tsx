import { useState, type FormEvent } from 'react';
import { GraphError, findDuplicateSong, validateSongInput, type FieldErrors } from '../domain/graph';
import { formatBpm, parseBpm } from '../domain/tempo';
import type { Song, SongInput } from '../domain/types';
import { goBack, linkTo, navigate, paths } from '../state/router';
import { useStore } from '../state/store';
import { artistSuggestions, currentTag, keySuggestions, replaceCurrentTag, tagSuggestions } from '../domain/suggest';
import { EmptyState, SuggestField, TextArea, TextField, TopBar } from './components';

export interface SongDraft {
  title: string;
  artist: string;
  bpm: string;
  key: string;
  tags: string;
  notes: string;
}

export const emptySongDraft = (title = ''): SongDraft => ({ title, artist: '', bpm: '', key: '', tags: '', notes: '' });

export function songToDraft(song: Song): SongDraft {
  return {
    title: song.title,
    artist: song.artist,
    bpm: formatBpm(song.bpm),
    key: song.key,
    tags: song.tags.join(', '),
    notes: song.notes,
  };
}

/** Converts the text draft into domain input. BPM may come back as NaN → caught by validation. */
export function draftToSongInput(d: SongDraft): SongInput {
  return {
    title: d.title,
    artist: d.artist,
    bpm: parseBpm(d.bpm),
    key: d.key,
    tags: d.tags.split(','),
    notes: d.notes,
  };
}

/** The song "card": title, artist, BPM, key, tags, notes. Used standalone and inline. */
export function SongFields({
  draft,
  onChange,
  errors,
  compact = false,
  autoFocus = false,
}: {
  draft: SongDraft;
  onChange: (d: SongDraft) => void;
  errors: FieldErrors;
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const { graph } = useStore();
  const set = (k: keyof SongDraft) => (v: string) => onChange({ ...draft, [k]: v });
  return (
    <>
      <TextField label="Title" value={draft.title} onChange={set('title')} error={errors.title} autoFocus={autoFocus} />
      <SuggestField
        label="Artist"
        value={draft.artist}
        onChange={set('artist')}
        suggestions={artistSuggestions(graph, draft.artist)}
        onPick={set('artist')}
      />
      <div className="grid-2">
        <TextField label="Original BPM" value={draft.bpm} onChange={set('bpm')} inputMode="decimal" placeholder="e.g. 124" error={errors.bpm} />
        <SuggestField
          label="Key"
          value={draft.key}
          onChange={set('key')}
          suggestions={keySuggestions(graph, draft.key, 4)}
          onPick={set('key')}
          placeholder="e.g. 8A / Am"
        />
      </div>
      {!compact && (
        <>
          <SuggestField
            label="Tags"
            value={draft.tags}
            onChange={set('tags')}
            suggestions={tagSuggestions(graph, draft.tags)}
            onPick={(tag) => onChange({ ...draft, tags: replaceCurrentTag(draft.tags, tag) })}
            query={currentTag(draft.tags)}
            placeholder="house, peak time, vocal"
            hint="Comma separated · type to see your categories"
          />
          <TextArea label="Notes" value={draft.notes} onChange={set('notes')} placeholder="Intro is 32 bars, big break at 3:10…" />
        </>
      )}
    </>
  );
}

export function SongForm({ id }: { id?: string }) {
  const store = useStore();
  const existing = id ? store.graph.songs[id] : undefined;
  const [draft, setDraft] = useState<SongDraft>(() => (existing ? songToDraft(existing) : emptySongDraft()));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');

  if (id && !existing) {
    return (
      <>
        <TopBar title="Edit song" back={paths.library()} />
        <main className="page">
          <EmptyState title="This song is not in your library (anymore)." />
        </main>
      </>
    );
  }

  const duplicate = findDuplicateSong(store.graph, draft.title, draft.artist, id);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const input = draftToSongInput(draft);
    const errs = validateSongInput(input);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    try {
      if (existing) {
        store.updateSong(existing.id, input);
        goBack(paths.song(existing.id));
      } else {
        const song = store.addSong(input);
        navigate(paths.song(song.id), { replace: true });
      }
    } catch (err) {
      setFormError(err instanceof GraphError ? err.message : String(err));
    }
  };

  return (
    <>
      <TopBar title={existing ? 'Edit song' : 'New song'} back={existing ? paths.song(existing.id) : paths.library()} />
      <main className="page">
        <form className="card form" onSubmit={onSubmit} noValidate>
          <SongFields draft={draft} onChange={setDraft} errors={errors} autoFocus={!existing} />
          {duplicate && (
            <p className="warning">
              “{duplicate.title}”{duplicate.artist ? ` by ${duplicate.artist}` : ''} is already in your library.{' '}
              <a {...linkTo(paths.song(duplicate.id), { replace: true })}>Open it</a>
            </p>
          )}
          {formError && <p className="field-error">{formError}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-block">
              {existing ? 'Save changes' : 'Add song'}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}

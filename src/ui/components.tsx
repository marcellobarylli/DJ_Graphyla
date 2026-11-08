import { useId, useState, type ReactNode } from 'react';
import { formatOverlap, formatPosition } from '../domain/position';
import { formatTimestamp, parseTimestamp } from '../domain/time';
import { formatBpm, formatPitch, pitchPercent } from '../domain/tempo';
import { RATING_LABELS, type Song, type Transition } from '../domain/types';
import { goBack, linkTo, paths } from '../state/router';
import { useStore } from '../state/store';

/**
 * Screen header. Top-level tabs pass `crate` instead of a title: the header then
 * shows the active crate as a switcher (the tab bar already names the screen).
 */
export function TopBar({ title, back, actions, crate }: { title?: ReactNode; back?: string; actions?: ReactNode; crate?: boolean }) {
  return (
    <header className="topbar">
      {back !== undefined ? (
        <button type="button" className="icon-btn" aria-label="Back" onClick={() => goBack(back)}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <span className="topbar-logo" aria-hidden="true" />
      )}
      <h1 className="topbar-title">{crate ? <CratePill /> : title}</h1>
      <div className="topbar-actions">{actions}</div>
    </header>
  );
}

function CratePill() {
  const { activeCrate } = useStore();
  return (
    <a className="crate-pill" {...linkTo(paths.crates())} aria-label={`Crate: ${activeCrate.name}. Switch crate`}>
      <span className="crate-pill-name">{activeCrate.name}</span>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  autoFocus?: boolean;
  inputMode?: 'text' | 'decimal' | 'numeric';
  onBlur?: () => void;
}) {
  const id = useId();
  return (
    <Field label={props.label} hint={props.hint} error={props.error} htmlFor={id}>
      <input
        id={id}
        className="input"
        value={props.value}
        placeholder={props.placeholder}
        autoFocus={props.autoFocus}
        inputMode={props.inputMode}
        autoComplete="off"
        onChange={(e) => props.onChange(e.target.value)}
        onBlur={props.onBlur}
      />
    </Field>
  );
}

/** Timestamp input: accepts "1:32" or just "132" (numeric keypad friendly). Reformats on blur. */
export function TimeField(props: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <TextField
      label={props.label}
      value={props.value}
      onChange={props.onChange}
      inputMode="numeric"
      placeholder="m:ss"
      error={props.error}
      hint="Type 132 for 1:32"
      onBlur={() => {
        const t = parseTimestamp(props.value);
        if (t !== null) props.onChange(formatTimestamp(t));
      }}
    />
  );
}

/** Bar number of the mix point (1 = first bar). */
export function BarField(props: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: ReactNode }) {
  return (
    <TextField
      label={props.label}
      value={props.value}
      onChange={props.onChange}
      inputMode="numeric"
      placeholder="bar"
      error={props.error}
      hint={props.hint}
    />
  );
}

export function BpmField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  originalBpm?: number | null;
  extraHint?: ReactNode;
}) {
  const playback = Number(props.value.replace(',', '.'));
  const pitch = props.value && Number.isFinite(playback) ? pitchPercent(props.originalBpm ?? null, playback) : null;
  const hint = (
    <>
      {props.originalBpm != null && (
        <span>
          Original {formatBpm(props.originalBpm)}
          {pitch !== null && <strong className="pitch"> {formatPitch(pitch)}</strong>}
          {!props.value && (
            <button type="button" className="chip-btn" onClick={() => props.onChange(formatBpm(props.originalBpm!))}>
              Use {formatBpm(props.originalBpm)}
            </button>
          )}
        </span>
      )}
      {props.extraHint && <span>{props.extraHint}</span>}
    </>
  );
  return (
    <TextField
      label={props.label}
      value={props.value}
      onChange={props.onChange}
      inputMode="decimal"
      placeholder="BPM"
      error={props.error}
      hint={hint}
    />
  );
}

export function TextArea(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const id = useId();
  return (
    <Field label={props.label} htmlFor={id}>
      <textarea
        id={id}
        className="input textarea"
        rows={3}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </Field>
  );
}

export function StarRating({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  return (
    <div className="field">
      <span className="field-label">How well does it work?</span>
      <div className="stars" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} – ${RATING_LABELS[n]}`}
            className={`star${shown !== null && n <= shown ? ' on' : ''}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(value === n ? null : n)}
          >
            ★
          </button>
        ))}
        <span className="stars-label">{shown ? RATING_LABELS[shown] : 'Not rated'}</span>
      </div>
    </div>
  );
}

export function Stars({ rating }: { rating: number | null }) {
  if (!rating) return <span className="stars-static muted">unrated</span>;
  return (
    <span className={`stars-static${rating === 1 ? ' bad' : ''}`} title={RATING_LABELS[rating]}>
      {'★'.repeat(rating)}
      <span className="dim">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

export function BpmBadge({ bpm }: { bpm: number | null }) {
  if (bpm === null) return null;
  return <span className="badge">{formatBpm(bpm)} BPM</span>;
}

export function KeyBadge({ songKey }: { songKey: string }) {
  if (!songKey) return null;
  return <span className="badge badge-key">{songKey}</span>;
}

/** One side of a mix: "bar 97 @ 124". */
function MixPoint({ bar, time, bpm, song }: { bar: number | null; time: number | null; bpm: number | null; song: Song | undefined }) {
  const pitch = pitchPercent(song?.bpm ?? null, bpm);
  return (
    <span className="mixpoint">
      <span className="mixpoint-time">{formatPosition(bar, time) || '—'}</span>
      {bpm !== null && (
        <span className="mixpoint-bpm">
          @ {formatBpm(bpm)}
          {pitch !== null && pitch !== 0 && <span className="pitch"> {formatPitch(pitch)}</span>}
        </span>
      )}
    </span>
  );
}

/** A single transition variant row, linking to its edit card. */
export function VariantRow({
  transition,
  fromSong,
  toSong,
  editPath,
  onSelect,
  selected,
}: {
  transition: Transition;
  fromSong: Song | undefined;
  toSong: Song | undefined;
  /** Link to the edit card … */
  editPath?: string;
  /** … or a button action instead. */
  onSelect?: () => void;
  selected?: boolean;
}) {
  const body = <VariantBody transition={transition} fromSong={fromSong} toSong={toSong} />;
  if (onSelect) {
    return (
      <button type="button" className={`variant variant-btn${selected ? ' selected' : ''}`} aria-pressed={selected} onClick={onSelect}>
        {body}
      </button>
    );
  }
  return (
    <a className="variant" {...linkTo(editPath ?? '/')}>
      {body}
    </a>
  );
}

function VariantBody({ transition, fromSong, toSong }: { transition: Transition; fromSong: Song | undefined; toSong: Song | undefined }) {
  return (
    <>
      <span className="variant-points">
        <span className="side side-out">
          <span className="side-label">out</span>
          <MixPoint bar={transition.fromBar} time={transition.fromTime} bpm={transition.fromBpm} song={fromSong} />
        </span>
        <span className="variant-arrow" aria-hidden="true">→</span>
        <span className="side side-in">
          <span className="side-label">in</span>
          <MixPoint bar={transition.toBar} time={transition.toTime} bpm={transition.toBpm} song={toSong} />
        </span>
      </span>
      <span className="variant-meta">
        {transition.overlapBars !== null && (
          <span className="badge badge-overlap" title="Both songs play together for this long">
            ⇄ {formatOverlap(transition.overlapBars)}
          </span>
        )}
        <Stars rating={transition.rating} />
        {transition.notes && <span className="variant-notes">{transition.notes}</span>}
      </span>
    </>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

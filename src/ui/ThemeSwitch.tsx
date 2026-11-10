import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { isStill, setLightning, stepPattern, useLightning } from '../state/lightningSetting';
import { clearLookFont, setLookFontFile, useLookFont } from '../state/lookFont';
import { THEMES, setTheme, useTheme } from '../state/theme';
import { PATTERNS } from './lightning';
import { REDUCED_MOTION, useMedia } from './useMedia';

/**
 * The look switch (issue #9): a slim handle on the right edge of the screen,
 * inside the page margin so it never covers buttons or text. Tapping it opens
 * a small panel with the three looks; picking one applies it at once, so the
 * looks can be compared without closing the panel.
 */
export function ThemeSwitch() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const handle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    handle.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        ref={handle}
        type="button"
        className="theme-handle"
        aria-label={`Look: ${theme.spokenName}. Change look`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="theme-handle-track" aria-hidden="true">
          {THEMES.map((t) => (
            <span key={t.id} className={`theme-handle-dot${t.id === theme.id ? ' on' : ''}`} />
          ))}
        </span>
      </button>
      {open && (
        <>
          <div className="theme-backdrop" aria-hidden="true" onClick={close} />
          <div id={panelId} ref={panel} className="theme-panel" role="dialog" aria-label="Look">
            <div className="sheet-head">
              <p className="theme-panel-title">Look</p>
              <button type="button" className="icon-btn icon-btn-small" aria-label="Close" onClick={close}>
                ✕
              </button>
            </div>
            <div className="theme-options" role="radiogroup" aria-label="Look">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={t.id === theme.id}
                  aria-label={`${t.spokenName}: ${t.hint}`}
                  className={`theme-option theme-option-${t.id}`}
                  onClick={() => setTheme(t.id)}
                >
                  <span className={`theme-swatch theme-swatch-${t.id}`} aria-hidden="true" />
                  <span className="theme-option-text">
                    <span className="theme-option-name">{t.name}</span>
                    <span className="theme-option-hint">{t.hint}</span>
                  </span>
                </button>
              ))}
            </div>
            {theme.id === 'futurism' && (
              <>
                <HeadingFont />
                <LightningControls />
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

/**
 * Y2K Futurism headings use Orbitron unless the person picks their own font
 * file (e.g. their copy of Xylem, which the app can't ship).
 */
function HeadingFont() {
  const font = useLookFont();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      await setLookFontFile(file);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="theme-font">
      <p className="small">
        Headings: <strong className="theme-font-name">{font ? font.name : 'Orbitron'}</strong>
        <span className="muted">{font ? ' (your file)' : ' (built in)'}</span>
      </p>
      <div className="row tight">
        <button type="button" className="btn btn-small" onClick={() => input.current?.click()}>
          {font ? 'Other font file…' : 'Use a font file…'}
        </button>
        {font && (
          <button type="button" className="btn btn-small" onClick={clearLookFont}>
            Back to Orbitron
          </button>
        )}
      </div>
      <p className="small muted">E.g. your copy of Xylem (.ttf, .otf, .woff). It stays on this device.</p>
      {error && <p className="field-error">{error}</p>}
      <input ref={input} type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" hidden onChange={onPick} />
    </div>
  );
}

/**
 * Y2K Futurism lightning: flashing (random strikes) or still, and in still
 * mode which pattern. The backdrop updates behind the panel as you pick.
 * Until one is picked it follows the device's reduced-motion preference.
 */
function LightningControls() {
  const { motion, pattern } = useLightning();
  const calm = useMedia(REDUCED_MOTION);
  const showStill = isStill(motion, calm);
  const current = PATTERNS[stepPattern(pattern, 0, PATTERNS.length)]!;
  const step = (by: number) => setLightning({ pattern: stepPattern(pattern, by, PATTERNS.length) });
  return (
    <div className="theme-font">
      <p className="small">Lightning</p>
      <div className="segmented" role="radiogroup" aria-label="Lightning">
        {(
          [
            [false, 'Flashing'],
            [true, 'Still'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={showStill === value}
            className={showStill === value ? 'on' : ''}
            onClick={() => setLightning({ motion: value ? 'still' : 'flashing' })}
          >
            {label}
          </button>
        ))}
      </div>
      {showStill && (
        <div className="lightning-pattern">
          <button type="button" className="btn btn-small" aria-label="Previous pattern" onClick={() => step(-1)}>
            ‹
          </button>
          <p className="small" aria-live="polite">
            <strong>{current.name}</strong>
            <span className="muted">
              {' '}
              {stepPattern(pattern, 0, PATTERNS.length) + 1} of {PATTERNS.length}
            </span>
          </p>
          <button type="button" className="btn btn-small" aria-label="Next pattern" onClick={() => step(1)}>
            ›
          </button>
        </div>
      )}
      {calm && motion === 'device' && (
        <p className="small muted">Your device asks for less motion, so the lightning stays still. Pick Flashing to turn it on.</p>
      )}
    </div>
  );
}

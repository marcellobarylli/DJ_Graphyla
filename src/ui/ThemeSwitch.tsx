import { useEffect, useId, useRef, useState } from 'react';
import { THEMES, setTheme, useTheme } from '../state/theme';

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
          </div>
        </>
      )}
    </>
  );
}

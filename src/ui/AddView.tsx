import { linkTo, paths } from '../state/router';
import { useStore } from '../state/store';
import { TopBar } from './components';
import { createAndOpenSet } from './SetsView';

export function AddView() {
  const store = useStore();
  return (
    <>
      <TopBar crate />
      <main className="page">
        <a className="card choice" {...linkTo(paths.transitionNew(), { replace: true })}>
          <span className="choice-icon choice-icon-edge" aria-hidden="true">
            <svg viewBox="0 0 48 24" width="48" height="24">
              <circle cx="6" cy="12" r="5" />
              <path d="M12 12h22" />
              <path d="M30 6l6 6-6 6" />
              <circle cx="42" cy="12" r="5" />
            </svg>
          </span>
          <span>
            <span className="choice-title">Transition</span>
            <span className="choice-text">
              Song A mixes into song B: where you mix out, where you mix in, and the tempo of both. New songs can be created
              right in the card.
            </span>
          </span>
        </a>
        <a className="card choice" {...linkTo(paths.songNew(), { replace: true })}>
          <span className="choice-icon" aria-hidden="true">
            <svg viewBox="0 0 48 24" width="48" height="24">
              <circle cx="24" cy="12" r="7" />
            </svg>
          </span>
          <span>
            <span className="choice-title">Song</span>
            <span className="choice-text">Just add a track to the library — connect it later.</span>
          </span>
        </a>
        <button type="button" className="card choice" onClick={() => createAndOpenSet(store, undefined, { replace: true })}>
          <span className="choice-icon choice-icon-set" aria-hidden="true">
            <svg viewBox="0 0 48 24" width="48" height="24">
              <circle cx="5" cy="12" r="3.5" />
              <path d="M9 12h8" />
              <circle cx="21" cy="12" r="3.5" />
              <path d="M25 12h8" />
              <circle cx="37" cy="12" r="3.5" />
              <path d="M41 12h4" />
            </svg>
          </span>
          <span>
            <span className="choice-title">Set</span>
            <span className="choice-text">Walk through the graph: start at any song and follow transitions you know work.</span>
          </span>
        </button>
      </main>
    </>
  );
}

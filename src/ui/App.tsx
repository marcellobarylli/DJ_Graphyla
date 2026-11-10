import { lazy, Suspense, useEffect, useState } from 'react';
import { UPDATE_EVENT } from '../updates';
import { linkTo, paths, useRoute, type Route } from '../state/router';
import { useTheme } from '../state/theme';
import { AddView } from './AddView';
import { CratesView } from './CratesView';
import { DataView } from './DataView';
import { DuplicatesView } from './DuplicatesView';
import { LibraryView } from './LibraryView';
import { FreeWalkView, PlayView } from './PlayView';
import { SetView } from './SetView';
import { SetsView } from './SetsView';
import { ShopView } from './ShopView';
import { SwagDecor } from './SwagDecor';
import { SongForm } from './SongForm';
import { SongView } from './SongView';
import { ThemeSwitch } from './ThemeSwitch';
import { TransitionForm } from './TransitionForm';
import { Y2KDecor } from './Y2KDecor';
import { EmptyState, TopBar } from './components';

// Cytoscape is only downloaded when the Graph tab is opened.
const GraphView = lazy(() => import('./GraphView'));

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'library':
      return <LibraryView />;
    case 'add':
      return <AddView />;
    case 'data':
      return <DataView />;
    case 'shop':
      return <ShopView />;
    case 'duplicates':
      return <DuplicatesView />;
    case 'graph':
      return (
        <Suspense fallback={<TopBar crate />}>
          <GraphView key={route.focus ?? ''} setId={route.set} focusId={route.focus} />
        </Suspense>
      );
    case 'sets':
      return <SetsView />;
    case 'crates':
      return <CratesView />;
    case 'set':
      return <SetView key={route.id} id={route.id} />;
    case 'set-play':
      return <PlayView key={route.id} id={route.id} />;
    case 'free-play':
      return <FreeWalkView start={route.start} />;
    case 'song':
      return <SongView key={route.id} id={route.id} />;
    case 'song-new':
      return <SongForm key="new" />;
    case 'song-edit':
      return <SongForm key={route.id} id={route.id} />;
    case 'transition-new':
      return (
        <TransitionForm
          key={`new:${route.from ?? ''}:${route.to ?? ''}:${route.idea ? 'idea' : ''}`}
          from={route.from}
          to={route.to}
          idea={route.idea}
        />
      );
    case 'transition-edit':
      return <TransitionForm key={route.id} id={route.id} />;
    case 'not-found':
      return (
        <>
          <TopBar title="Not found" back={paths.library()} />
          <main className="page">
            <EmptyState title="Nothing here." />
          </main>
        </>
      );
  }
}

/** Screens without the tab bar: forms (keyboard) and play mode (full screen). */
const isForm = (r: Route) =>
  r.name === 'song-new' || r.name === 'song-edit' || r.name === 'transition-new' || r.name === 'transition-edit' || r.name === 'set-play' || r.name === 'free-play';

/** Shown when a newer version was deployed while the app was open. Reloads only on tap. */
function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const show = () => setAvailable(true);
    window.addEventListener(UPDATE_EVENT, show);
    return () => window.removeEventListener(UPDATE_EVENT, show);
  }, []);
  if (!available) return null;
  return (
    <div className="update-banner" role="status">
      <span>New version available</span>
      <button type="button" className="btn btn-small btn-primary" onClick={() => location.reload()}>
        Reload
      </button>
      <button type="button" className="icon-btn icon-btn-small" aria-label="Later" onClick={() => setAvailable(false)}>
        ✕
      </button>
    </div>
  );
}

export function App() {
  const route = useRoute();
  const theme = useTheme();
  const tab =
    route.name === 'add' ? 'add'
    : route.name === 'data' || route.name === 'shop' || route.name === 'duplicates' ? 'data'
    : route.name === 'graph' ? 'graph'
    : route.name === 'sets' || route.name === 'set' ? 'sets'
    : 'library';
  return (
    <div className={`app${isForm(route) ? ' is-form' : ''}${route.name === 'graph' ? ' is-graph' : ''}`}>
      {theme.id === 'futurism' && <Y2KDecor />}
      {theme.id === 'swag' && <SwagDecor />}
      <Screen route={route} />
      <UpdateBanner />
      {/* The look switch sits with the tab bar; forms and play mode stay free of it. */}
      {!isForm(route) && <ThemeSwitch />}
      {!isForm(route) && (
        <nav className="tabbar" aria-label="Main">
          <a className={`tab${tab === 'library' ? ' on' : ''}`} aria-current={tab === 'library' ? 'page' : undefined} {...linkTo(paths.library())}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="6" cy="7" r="2.5" />
              <circle cx="18" cy="7" r="2.5" />
              <circle cx="12" cy="18" r="2.5" />
              <path d="M8.3 8.3l2.4 7.4M15.7 8.3l-2.4 7.4M8.5 7h7" />
            </svg>
            Library
          </a>
          <a className={`tab${tab === 'graph' ? ' on' : ''}`} aria-current={tab === 'graph' ? 'page' : undefined} {...linkTo(paths.graph())}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="5" cy="6" r="2.2" />
              <circle cx="19" cy="5" r="2.2" />
              <circle cx="12" cy="13" r="2.2" />
              <circle cx="6" cy="19" r="2.2" />
              <circle cx="18" cy="18" r="2.2" />
              <path d="M7 7.3l3.4 4M17.2 6.4l-3.6 5M10.6 14.6l-3.2 2.8M13.7 14.4l2.8 2.2" />
            </svg>
            Graph
          </a>
          <a className={`tab tab-add${tab === 'add' ? ' on' : ''}`} aria-current={tab === 'add' ? 'page' : undefined} {...linkTo(paths.add())} aria-label="Add">
            <span className="tab-add-btn">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          </a>
          <a className={`tab${tab === 'sets' ? ' on' : ''}`} aria-current={tab === 'sets' ? 'page' : undefined} {...linkTo(paths.sets())}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="4.5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19.5" cy="12" r="2" />
              <path d="M6.5 12h3.5M14 12h3.5M3 5h18M3 19h18" />
            </svg>
            Sets
          </a>
          <a className={`tab${tab === 'data' ? ' on' : ''}`} aria-current={tab === 'data' ? 'page' : undefined} {...linkTo(paths.data())}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <ellipse cx="12" cy="6" rx="7" ry="2.8" />
              <path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" />
            </svg>
            Data
          </a>
        </nav>
      )}
    </div>
  );
}

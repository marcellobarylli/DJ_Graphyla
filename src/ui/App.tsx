import { linkTo, paths, useRoute, type Route } from '../state/router';
import { AddView } from './AddView';
import { DataView } from './DataView';
import { LibraryView } from './LibraryView';
import { SongForm } from './SongForm';
import { SongView } from './SongView';
import { TransitionForm } from './TransitionForm';
import { EmptyState, TopBar } from './components';

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'library':
      return <LibraryView />;
    case 'add':
      return <AddView />;
    case 'data':
      return <DataView />;
    case 'song':
      return <SongView key={route.id} id={route.id} />;
    case 'song-new':
      return <SongForm key="new" />;
    case 'song-edit':
      return <SongForm key={route.id} id={route.id} />;
    case 'transition-new':
      return <TransitionForm key={`new:${route.from ?? ''}:${route.to ?? ''}`} from={route.from} to={route.to} />;
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

const isForm = (r: Route) => r.name === 'song-new' || r.name === 'song-edit' || r.name === 'transition-new' || r.name === 'transition-edit';

export function App() {
  const route = useRoute();
  const tab = route.name === 'add' ? 'add' : route.name === 'data' ? 'data' : 'library';
  return (
    <div className={`app${isForm(route) ? ' is-form' : ''}`}>
      <Screen route={route} />
      {!isForm(route) && (
        <nav className="tabbar" aria-label="Main">
          <a className={`tab${tab === 'library' ? ' on' : ''}`} {...linkTo(paths.library())}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="6" cy="7" r="2.5" />
              <circle cx="18" cy="7" r="2.5" />
              <circle cx="12" cy="18" r="2.5" />
              <path d="M8.3 8.3l2.4 7.4M15.7 8.3l-2.4 7.4M8.5 7h7" />
            </svg>
            Library
          </a>
          <a className={`tab tab-add${tab === 'add' ? ' on' : ''}`} {...linkTo(paths.add())} aria-label="Add">
            <span className="tab-add-btn">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          </a>
          <a className={`tab${tab === 'data' ? ' on' : ''}`} {...linkTo(paths.data())}>
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

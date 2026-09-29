import { Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { HelpLayer } from './help/HelpLayer';
import Library from './Library';
import SongView from './SongView';
import ToolView from './ToolView';

/**
 * The shell's router (PLAN.md §4): hash-based, so the app works from any path, a NAS, or a
 * `file://`-style static host. Three routes: the library, a song (with a module), and a
 * stand-alone tool.
 */
export default function App() {
  return (
    <>
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={Library} />
        <Route path="/tools/:moduleId" component={ToolView} />
        <Route path="/song/:songId/:moduleId?" component={SongView} />
        <Route>
          <div className="mx-auto max-w-lg px-4 py-10 text-center">
            <p className="text-lg font-medium">Page not found.</p>
          </div>
        </Route>
      </Switch>
    </Router>
    <HelpLayer />
    </>
  );
}

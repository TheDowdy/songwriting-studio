// Applies the saved theme before the first paint so the page doesn't flash (§6): a saved
// light/dark choice, nothing for a saved "Match system", and light for a first-time visitor.
// (A separate file rather than inline, so the site can forbid inline scripts.)
try {
  var theme = null;
  var explicitSystem = false;

  // Current: the shell's own settings (zustand persist).
  var shell = localStorage.getItem('sw:shell-settings');
  if (shell) theme = JSON.parse(shell).state.theme;
  if (theme === 'system') explicitSystem = true;

  // Legacy fall-backs, checked in the order they were introduced, so nobody's choice is lost:
  // the guitar module's own settings (Fluid Frets, then Fretscape before it was renamed)...
  if (!explicitSystem && theme !== 'light' && theme !== 'dark') {
    var guitar =
      localStorage.getItem('sw:guitar-settings') ||
      localStorage.getItem('fluid-frets-settings') ||
      localStorage.getItem('fretscape-settings');
    if (guitar) theme = JSON.parse(guitar).state.theme;
  }
  // ...and the progression builder's own plain (non-JSON) theme key.
  if (!explicitSystem && theme !== 'light' && theme !== 'dark') {
    theme = localStorage.getItem('chordbuilder:theme');
  }

  // Nothing saved anywhere: a first visit, which starts in the light theme.
  if (theme !== 'light' && theme !== 'dark' && !explicitSystem) theme = 'light';

  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch (e) {}

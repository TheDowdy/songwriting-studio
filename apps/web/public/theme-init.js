// Applies a saved light/dark choice before the first paint so the page doesn't flash (§6).
// (A separate file rather than inline, so the site can forbid inline scripts.)
try {
  var theme = null;

  // Current: the shell's own settings (zustand persist).
  var shell = localStorage.getItem('sw:shell-settings');
  if (shell) theme = JSON.parse(shell).state.theme;

  // Legacy fall-backs, checked in the order they were introduced, so nobody's choice is lost:
  // the guitar module's own settings (Fluid Frets, then Fretscape before it was renamed)...
  if (theme !== 'light' && theme !== 'dark') {
    var guitar =
      localStorage.getItem('sw:guitar-settings') ||
      localStorage.getItem('fluid-frets-settings') ||
      localStorage.getItem('fretscape-settings');
    if (guitar) theme = JSON.parse(guitar).state.theme;
  }
  // ...and the progression builder's own plain (non-JSON) theme key.
  if (theme !== 'light' && theme !== 'dark') {
    theme = localStorage.getItem('chordbuilder:theme');
  }

  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch (e) {}

// Applies a saved light/dark choice before the first paint so the page doesn't flash.
// (A separate file rather than inline, so the site can forbid inline scripts.)
try {
  // The key was 'fretscape-settings' before the app was renamed; read it until it has been migrated.
  var saved = localStorage.getItem('fluid-frets-settings') || localStorage.getItem('fretscape-settings');
  var t = JSON.parse(saved).state.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}

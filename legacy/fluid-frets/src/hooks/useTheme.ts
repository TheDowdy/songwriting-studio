import { useEffect } from 'react';
import { useStore } from '../state/store';

/**
 * Applies the theme setting to the page. "System" leaves `data-theme` off so the stylesheet follows
 * `prefers-color-scheme`; "dark" and "light" force it. (index.html applies the saved choice before
 * the first paint so there is no flash.)
 */
export function useTheme(): void {
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset['theme'];
    else root.dataset['theme'] = theme;
    // Keep the browser chrome (address bar on phones) in step with the page.
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.body).backgroundColor;
  }, [theme]);
}

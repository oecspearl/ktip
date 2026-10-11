import { useEffect, useState } from 'react';
import { THEME_SYNC_EVENT, setThemeMode } from '../a11y/theme';

/**
 * Light/dark theme mode: toggles the `dark` class on <html>, which flips the
 * ktip color variables (see html.dark in index.css). The class is applied
 * pre-render by an inline script in index.html (saved preference, else OS
 * prefers-color-scheme), so initial state reads from the DOM.
 *
 * The setter is setThemeMode (src/a11y/theme.ts), shared with the
 * accessibility service so presets and sync flip the same switch.
 */
export function useThemeMode(): [boolean, (dark: boolean) => void] {
  const [dark, setDarkState] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  // Keep every mounted instance in sync (e.g. FAB toggle + Settings toggle)
  useEffect(() => {
    const onSync = (e: Event) => setDarkState((e as CustomEvent<boolean>).detail);
    window.addEventListener(THEME_SYNC_EVENT, onSync);
    return () => window.removeEventListener(THEME_SYNC_EVENT, onSync);
  }, []);

  return [dark, setThemeMode];
}

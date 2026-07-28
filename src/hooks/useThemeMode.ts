import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ktip_theme';
const SYNC_EVENT = 'ktip-theme-change';

/**
 * Light/dark theme mode: toggles the `dark` class on <html>, which flips the
 * ktip color variables (see html.dark in index.css). The class is applied
 * pre-render by an inline script in index.html (saved preference, else OS
 * prefers-color-scheme), so initial state reads from the DOM.
 */
export function useThemeMode(): [boolean, (dark: boolean) => void] {
  const [dark, setDarkState] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  // Keep every mounted instance in sync (e.g. FAB toggle + Settings toggle)
  useEffect(() => {
    const onSync = (e: Event) => setDarkState((e as CustomEvent<boolean>).detail);
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, []);

  const setDark = (on: boolean) => {
    document.documentElement.classList.toggle('dark', on);
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'dark' : 'light');
    } catch {
      // localStorage unavailable — mode still applies for this session
    }
    setDarkState(on);
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: on }));
  };

  return [dark, setDark];
}

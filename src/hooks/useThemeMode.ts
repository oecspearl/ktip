import { useState } from 'react';

const STORAGE_KEY = 'ktip_theme';

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

  const setDark = (on: boolean) => {
    document.documentElement.classList.toggle('dark', on);
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'dark' : 'light');
    } catch {
      // localStorage unavailable — mode still applies for this session
    }
    setDarkState(on);
  };

  return [dark, setDark];
}

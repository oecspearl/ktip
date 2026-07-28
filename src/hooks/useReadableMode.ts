import { useState } from 'react';

const STORAGE_KEY = 'ktip_readable';

/**
 * Accessibility "readable font" mode: toggles the `readable` class on <html>,
 * which swaps all fonts to Atkinson Hyperlegible (see index.css).
 * The class is applied pre-render by an inline script in index.html,
 * so initial state reads from the DOM rather than localStorage.
 */
export function useReadableMode(): [boolean, (on: boolean) => void] {
  const [enabled, setEnabled] = useState(() =>
    document.documentElement.classList.contains('readable')
  );

  const setReadable = (on: boolean) => {
    document.documentElement.classList.toggle('readable', on);
    try {
      localStorage.setItem(STORAGE_KEY, String(on));
    } catch {
      // localStorage unavailable — mode still applies for this session
    }
    setEnabled(on);
  };

  return [enabled, setReadable];
}

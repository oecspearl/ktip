import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ktip_readable';
const SYNC_EVENT = 'ktip-readable-change';

/**
 * Accessibility "readable font" mode: toggles the `readable` class on <html>,
 * which swaps all fonts to Atkinson Hyperlegible (see index.css).
 * The class is applied pre-render by an inline script in index.html,
 * so initial state reads from the DOM rather than localStorage.
 *
 * Same CustomEvent sync as useThemeMode, so the Settings toggle, the FAB and
 * DisplayPrefsSync (155) all agree without a shared store.
 */
export function useReadableMode(): [boolean, (on: boolean) => void] {
  const [enabled, setEnabled] = useState(() =>
    document.documentElement.classList.contains('readable')
  );

  useEffect(() => {
    const onSync = (e: Event) => setEnabled((e as CustomEvent<boolean>).detail);
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, []);

  const setReadable = (on: boolean) => {
    document.documentElement.classList.toggle('readable', on);
    try {
      localStorage.setItem(STORAGE_KEY, String(on));
    } catch {
      // localStorage unavailable — mode still applies for this session
    }
    setEnabled(on);
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: on }));
  };

  return [enabled, setReadable];
}

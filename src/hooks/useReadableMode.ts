import { useCallback } from 'react';
import { useA11ySettings } from '@a11y-kit';
import { a11yStore } from '../a11y/store';

/**
 * Accessibility "readable font" mode: Atkinson Hyperlegible across the site
 * (html.readable, see index.css). A view over the accessibility kit's `font`
 * setting, which also loads the webfont the first time it is chosen.
 */
export function useReadableMode(): [boolean, (on: boolean) => void] {
  const enabled = useA11ySettings(a11yStore).font === 'atkinson';
  const setReadable = useCallback((on: boolean) => {
    a11yStore.patch({ font: on ? 'atkinson' : 'default' });
  }, []);
  return [enabled, setReadable];
}

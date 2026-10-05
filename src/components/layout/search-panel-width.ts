/**
 * Width of the desktop search surface — the input AND the results panel.
 *
 * Navbar sets it on the input container; NavbarSearchPanel sets it on the
 * panel. The input used to be `max-w-md` (448px) against the panel's 544px, so
 * the panel hung out past the left edge of the box that opened it and the two
 * read as unrelated objects. One constant is the only way two elements in
 * different files stay flush.
 *
 * Its own module so Navbar can read it without importing the panel, which it
 * loads lazily on the first search: a bundler cannot split a file, so a
 * constant shared from the panel's module kept the whole panel — and the ~60
 * icons it resolves rows to — in the entry chunk.
 */
export const SEARCH_PANEL_WIDTH = 'w-[min(34rem,calc(100vw-2rem))]'

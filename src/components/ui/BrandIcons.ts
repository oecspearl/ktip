import { createLucideIcon } from 'lucide-react'

/**
 * Brand marks lucide-react dropped in 1.0.
 *
 * The node data is copied verbatim from lucide-react 0.563 (ISC), so these
 * render exactly as before and take the same props as any other lucide icon
 * (size, strokeWidth, className). Built with lucide's own createLucideIcon
 * rather than hand-written SVG so they stay a `LucideIcon` and slot into maps
 * typed that way.
 */

export const Facebook = createLucideIcon({
  name: 'facebook',
  size: 24,
  node: [['path', { d: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z', key: '1jg4f8' }]],
})

export const Github = createLucideIcon({
  name: 'github',
  size: 24,
  node: [
    [
      'path',
      {
        d: 'M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4',
        key: 'tonef',
      },
    ],
    ['path', { d: 'M9 18c-4.51 2-5-2-7-2', key: '9comsn' }],
  ],
})

export const Instagram = createLucideIcon({
  name: 'instagram',
  size: 24,
  node: [
    ['rect', { width: '20', height: '20', x: '2', y: '2', rx: '5', ry: '5', key: '2e1cvw' }],
    ['path', { d: 'M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z', key: '9exkf1' }],
    ['line', { x1: '17.5', x2: '17.51', y1: '6.5', y2: '6.5', key: 'r4j83e' }],
  ],
})

export const Linkedin = createLucideIcon({
  name: 'linkedin',
  size: 24,
  node: [
    ['path', { d: 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z', key: 'c2jq9f' }],
    ['rect', { width: '4', height: '12', x: '2', y: '9', key: 'mk3on5' }],
    ['circle', { cx: '4', cy: '4', r: '2', key: 'bt5ra8' }],
  ],
})

export const Youtube = createLucideIcon({
  name: 'youtube',
  size: 24,
  node: [
    [
      'path',
      {
        d: 'M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17',
        key: '1q2vi4',
      },
    ],
    ['path', { d: 'm10 15 5-3-5-3z', key: '1jp15x' }],
  ],
})

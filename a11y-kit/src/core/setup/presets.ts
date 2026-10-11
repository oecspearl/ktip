import type { A11ySettings, ContrastMode, ShortcutMode, ThemeMode } from '../config'

/**
 * What each answer to "what would help you?" turns on. Values are minimums
 * or maximums, never resets: a preset only ever moves a setting further in
 * the helpful direction, so someone who already chose 140% text and ticks
 * "low vision" keeps 140%, not 125%.
 */
export interface NeedDef {
  id: string
  /** Settings to move. Numbers are bounds (see MERGE); booleans turn on */
  set: Partial<A11ySettings>
  theme?: ThemeMode
  /** The walkthrough is read as text, without a visual spotlight */
  textTour?: boolean
}

export const DEFAULT_NEEDS: NeedDef[] = [
  {
    id: 'lowVision',
    set: {
      fontScale: 1.25,
      contrast: 'more',
      focusRing: 'strong',
      cursor: 'large',
      underlineLinks: true,
      highlightHeadings: true,
      spacing: 1,
      readerBar: true,
    },
  },
  {
    id: 'screenReader',
    // Nothing visual. The screen reader does the reading, so no reading bar
    set: { focusOnNavigate: true, shortcuts: 'modifier', reduceMotion: true },
    textTour: true,
  },
  {
    id: 'lightSensitive',
    set: { pageBrightness: 0.85, saturation: 0.8, photoBrightness: 0.8, reduceMotion: true },
    theme: 'dark',
  },
  { id: 'colourVision', set: { underlineLinks: true, highlightHeadings: true, focusRing: 'strong' } },
  {
    id: 'dyslexia',
    set: { font: 'atkinson', spacing: 2, fontScale: 1.1, readerBar: true, underlineLinks: true, reduceMotion: true },
  },
  {
    id: 'motor',
    // Voice is offered on its own switch, never turned on for someone
    set: { bigTargets: true, cursor: 'large', focusRing: 'strong', shortcuts: 'all', focusOnNavigate: true },
  },
  { id: 'hearing', set: { captions: 'on' } },
  {
    id: 'cognitive',
    set: { reduceMotion: true, highlightHeadings: true, underlineLinks: true, spacing: 1, readerBar: true, focusRing: 'strong' },
  },
  { id: 'motionSensitive', set: { reduceMotion: true } },
]

/** "None of these": changes nothing, and still offers the walkthrough. */
export const NO_NEEDS = 'none'

/** Higher is more help for these numbers; lower is more help for the rest. */
const UP: (keyof A11ySettings)[] = ['fontScale', 'spacing', 'ttsRate']
const DOWN: (keyof A11ySettings)[] = ['pageBrightness', 'saturation', 'photoBrightness']

/** For choices, how strong each value is. A preset never weakens a choice. */
const RANK: Partial<Record<keyof A11ySettings, readonly string[]>> = {
  contrast: ['auto', 'standard', 'more'] satisfies readonly ContrastMode[],
  shortcuts: ['off', 'modifier', 'all'] satisfies readonly ShortcutMode[],
  focusRing: ['default', 'strong'],
  cursor: ['default', 'large'],
  captions: ['auto', 'on'],
}

export interface PresetResult {
  settings: A11ySettings
  theme?: ThemeMode
  textTour: boolean
}

/**
 * Fold the chosen needs into the current settings. Fonts are the one
 * either/or: the first need that names one wins, and only over 'default', so
 * a font someone already picked stays theirs.
 */
export function applyPreset(base: A11ySettings, needIds: string[], defs: NeedDef[] = DEFAULT_NEEDS): PresetResult {
  const out: A11ySettings = { ...base }
  let theme: ThemeMode | undefined
  let textTour = false
  for (const id of needIds) {
    const def = defs.find((d) => d.id === id)
    if (!def) continue
    if (def.theme) theme = def.theme
    if (def.textTour) textTour = true
    for (const [k, v] of Object.entries(def.set) as [keyof A11ySettings, unknown][]) {
      const current = out[k] as unknown
      let next: unknown = v
      if (UP.includes(k)) next = Math.max(current as number, v as number)
      else if (DOWN.includes(k)) next = Math.min(current as number, v as number)
      else if (typeof v === 'boolean') next = (current as boolean) || v
      else if (RANK[k]) {
        const rank = RANK[k]!
        next = rank.indexOf(v as string) > rank.indexOf(current as string) ? v : current
      } else if (k === 'font') next = current === 'default' ? v : current
      ;(out as unknown as Record<string, unknown>)[k] = next
    }
  }
  return { settings: out, theme, textTour }
}

/** The settings a preset changed, for the "here is what changes" list. */
export function changedKeys(before: A11ySettings, after: A11ySettings): (keyof A11ySettings)[] {
  return (Object.keys(after) as (keyof A11ySettings)[]).filter(
    (k) => k !== 'setup' && JSON.stringify(before[k]) !== JSON.stringify(after[k])
  )
}

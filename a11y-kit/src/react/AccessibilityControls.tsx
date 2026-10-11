import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { A11ySettings, ContrastMode, NumericKey, SpacingLevel, ThemeMode } from '../core/config'
import type { A11yStore } from '../core/store'
import { useA11yContext } from './context'
import { useA11ySettings } from './hooks'
import type { A11yTextKey } from './messages'
import { ChoiceRow, Section, StepperRow, SwitchRow } from './primitives'
import type { ThemeAdapter } from './context'

export type ControlId =
  | 'fontScale'
  | 'font'
  | 'spacing'
  | 'theme'
  | 'contrast'
  | 'pageBrightness'
  | 'pageContrast'
  | 'saturation'
  | 'photoBrightness'
  | 'underlineLinks'
  | 'highlightHeadings'
  | 'bigTargets'
  | 'cursor'
  | 'focusRing'
  | 'reduceMotion'

export type SectionId = 'text' | 'colour' | 'reading' | 'navigation' | 'motion'

export const SECTIONS: { id: SectionId; title: A11yTextKey; controls: ControlId[] }[] = [
  { id: 'text', title: 'sectionText', controls: ['fontScale', 'font', 'spacing'] },
  {
    id: 'colour',
    title: 'sectionColour',
    controls: ['theme', 'contrast', 'pageBrightness', 'pageContrast', 'saturation', 'photoBrightness'],
  },
  { id: 'reading', title: 'sectionReading', controls: ['underlineLinks', 'highlightHeadings'] },
  { id: 'navigation', title: 'sectionNavigation', controls: ['bigTargets', 'cursor', 'focusRing'] },
  { id: 'motion', title: 'sectionMotion', controls: ['reduceMotion'] },
]

/** Settings each control owns, so a section can reset exactly its own. */
const OWNS: Partial<Record<ControlId, (keyof A11ySettings)[]>> = {
  cursor: ['cursor'],
  focusRing: ['focusRing'],
}
const ownedKeys = (id: ControlId): (keyof A11ySettings)[] =>
  OWNS[id] ?? (id === 'theme' ? [] : [id as keyof A11ySettings])

const FILTER_CONTROLS: ControlId[] = ['contrast', 'pageBrightness', 'pageContrast', 'saturation']

const pct = (v: number) => `${Math.round(v * 100)}%`

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const update = () => setOn(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [query])
  return on
}

const noTheme = { get: () => 'light' as const, set: () => {}, subscribe: () => () => {} }

function useTheme(theme: ThemeAdapter | null) {
  const t = theme ?? noTheme
  return useSyncExternalStore(t.subscribe, t.get, t.get)
}

export interface AccessibilityControlsProps {
  /** settings: page-width grid. panel: one column, for a popover. compact: one column, no section resets */
  variant?: 'settings' | 'panel' | 'compact'
  /** Show only these controls */
  only?: ControlId[]
  /** Leave these controls out, e.g. a theme switch the page already has */
  exclude?: ControlId[]
  /** Extra content under the controls, e.g. a "run setup again" button */
  footer?: ReactNode
}

/**
 * Every display control, grouped. One component for the settings page, the
 * floating panel and the setup walkthrough, so the three can never drift.
 * Changes apply instantly; there is nothing to save.
 */
export function AccessibilityControls({ variant = 'settings', only, exclude, footer }: AccessibilityControlsProps) {
  const { store, theme, messages: m } = useA11yContext()
  const s = useA11ySettings(store)
  const mode = useTheme(theme)
  const forced = useMedia('(forced-colors: active)')
  const r = store.config.ranges

  const shown = (id: ControlId) =>
    (!only || only.includes(id)) && !exclude?.includes(id) && (id !== 'theme' || !!theme)

  const set = (patch: Partial<A11ySettings>) => store.patch(patch)
  // From the store, not this render: four quick presses are four steps
  const bump = (key: NumericKey, direction: 1 | -1) =>
    store.patch({ [key]: store.getSettings()[key] + direction * r[key].step })

  const render: Record<ControlId, () => ReactNode> = {
    fontScale: () => (
      <StepperRow
        label={m.textSize}
        value={s.fontScale}
        display={pct(s.fontScale)}
        min={r.fontScale.min}
        max={r.fontScale.max}
        messages={m}
        onStep={(d) => bump('fontScale', d)}
      />
    ),
    font: () =>
      store.config.fonts.length > 0 && (
        <ChoiceRow
          label={m.font}
          value={s.font}
          options={[
            { value: 'default', label: m.fontDefault },
            ...store.config.fonts.map((f) => ({
              value: f.id,
              label: f.label,
              // Each name previews itself once its font has been loaded
              style: f.family ? { fontFamily: f.family } : undefined,
            })),
          ]}
          onChange={(v) => set({ font: v })}
        />
      ),
    spacing: () => (
      <ChoiceRow<SpacingLevel>
        label={m.spacing}
        value={s.spacing}
        options={[
          { value: 0, label: m.spacingNormal },
          { value: 1, label: m.spacingWider },
          { value: 2, label: m.spacingWidest },
        ]}
        onChange={(v) => set({ spacing: v })}
      />
    ),
    theme: () =>
      theme && (
        <ChoiceRow<ThemeMode>
          label={m.theme}
          value={mode}
          options={[
            { value: 'light', label: m.themeLight },
            { value: 'dark', label: m.themeDark },
          ]}
          onChange={(v) => theme.set(v)}
        />
      ),
    contrast: () => (
      <ChoiceRow<ContrastMode>
        label={m.contrast}
        hint={variant === 'compact' ? undefined : m.contrastHint}
        value={s.contrast}
        disabled={forced}
        options={[
          { value: 'auto', label: m.contrastAuto },
          { value: 'standard', label: m.contrastStandard },
          { value: 'more', label: m.contrastMore },
        ]}
        onChange={(v) => set({ contrast: v })}
      />
    ),
    pageBrightness: () => (
      <StepperRow
        label={m.pageBrightness}
        value={s.pageBrightness}
        display={pct(s.pageBrightness)}
        min={r.pageBrightness.min}
        max={r.pageBrightness.max}
        disabled={forced}
        messages={m}
        onStep={(d) => bump('pageBrightness', d)}
      />
    ),
    pageContrast: () => (
      <StepperRow
        label={m.pageContrast}
        value={s.pageContrast}
        display={pct(s.pageContrast)}
        min={r.pageContrast.min}
        max={r.pageContrast.max}
        disabled={forced}
        messages={m}
        onStep={(d) => bump('pageContrast', d)}
      />
    ),
    saturation: () => (
      <StepperRow
        label={m.saturation}
        value={s.saturation}
        display={pct(s.saturation)}
        min={r.saturation.min}
        max={r.saturation.max}
        disabled={forced}
        messages={m}
        onStep={(d) => bump('saturation', d)}
      />
    ),
    photoBrightness: () => (
      <StepperRow
        label={m.photoBrightness}
        value={s.photoBrightness}
        display={pct(s.photoBrightness)}
        min={r.photoBrightness.min}
        max={r.photoBrightness.max}
        messages={m}
        onStep={(d) => bump('photoBrightness', d)}
      />
    ),
    underlineLinks: () => (
      <SwitchRow label={m.underlineLinks} checked={s.underlineLinks} onChange={(v) => set({ underlineLinks: v })} />
    ),
    highlightHeadings: () => (
      <SwitchRow
        label={m.highlightHeadings}
        checked={s.highlightHeadings}
        onChange={(v) => set({ highlightHeadings: v })}
      />
    ),
    bigTargets: () => (
      <SwitchRow
        label={m.bigTargets}
        hint={variant === 'compact' ? undefined : m.bigTargetsHint}
        checked={s.bigTargets}
        onChange={(v) => set({ bigTargets: v })}
      />
    ),
    cursor: () => (
      <SwitchRow
        label={m.largeCursor}
        checked={s.cursor === 'large'}
        onChange={(v) => set({ cursor: v ? 'large' : 'default' })}
      />
    ),
    focusRing: () => (
      <SwitchRow
        label={m.strongFocus}
        hint={variant === 'compact' ? undefined : m.strongFocusHint}
        checked={s.focusRing === 'strong'}
        onChange={(v) => set({ focusRing: v ? 'strong' : 'default' })}
      />
    ),
    reduceMotion: () => (
      <SwitchRow
        label={m.reduceMotion}
        hint={variant === 'compact' ? undefined : m.reduceMotionHint}
        checked={s.reduceMotion}
        onChange={(v) => set({ reduceMotion: v })}
      />
    ),
  }

  const sections = SECTIONS.map((sec) => ({ ...sec, controls: sec.controls.filter(shown) })).filter(
    (sec) => sec.controls.length > 0
  )
  const showsFilters = sections.some((sec) => sec.controls.some((c) => FILTER_CONTROLS.includes(c)))

  return (
    <div className="ak-controls" data-variant={variant}>
      {forced && showsFilters && (
        <p className="ak-note" role="note">
          {m.forcedColors}
        </p>
      )}
      {sections.map((sec) => {
        const keys = sec.controls.flatMap(ownedKeys)
        const dirty = keys.some((k) => s[k] !== store.config.defaults[k])
        const title = m[sec.title]
        const body = sec.controls.map((id) => <div key={id}>{render[id]()}</div>)
        if (variant === 'compact') return <div key={sec.id} className="ak-section-body">{body}</div>
        return (
          <Section
            key={sec.id}
            title={title}
            resetText={m.resetSection}
            resetLabel={m.resetSectionLabel(title)}
            canReset={dirty}
            onReset={() => resetKeys(store, keys)}
          >
            {body}
          </Section>
        )
      })}
      {footer}
    </div>
  )
}

function resetKeys(store: A11yStore, keys: (keyof A11ySettings)[]) {
  const defaults = store.config.defaults
  store.patch(Object.fromEntries(keys.map((k) => [k, defaults[k]])) as Partial<A11ySettings>)
}

/** Back to every default, keeping the record of how setup ended. */
export function resetAllSettings(store: A11yStore) {
  store.replace({ ...store.config.defaults, setup: store.getSettings().setup })
}

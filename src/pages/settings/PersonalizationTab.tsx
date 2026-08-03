import { useEffect, useState } from 'react'
import { Sparkles, Save, Layers, FileType, Leaf, SlidersHorizontal, RotateCcw } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Toggle } from '../../components/ui/Toggle'
import { TopicPicker } from '../../components/personalization/TopicPicker'
import { SignalSummary } from '../../components/personalization/SignalSummary'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import {
  useMyPersonalization,
  useSavePersonalization,
  useResetPersonalization,
  DEFAULT_PERSONALIZATION,
  type PersonalizationSettings,
} from '../../hooks/usePersonalization'
import { analytics } from '../../hooks/useAnalytics'
import {
  PROJECT_CATEGORIES,
  RESOURCE_CATEGORY_LABELS,
  RESOURCE_TYPE_LABELS,
  EVENT_TYPE_LABELS,
  GRANT_TYPE_LABELS,
} from '../../lib/constants'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

/**
 * Projects and resources share the category enum, but resources carry two
 * values projects never had (`climate_action`, `business`). The union is what
 * the picker offers, because `user_personalization.categories` is matched
 * against both tables.
 */
const CATEGORY_OPTIONS = [
  ...PROJECT_CATEGORIES.map((c) => ({ value: c.value as string, label: c.label })),
  ...Object.entries(RESOURCE_CATEGORY_LABELS)
    .filter(([value]) => !PROJECT_CATEGORIES.some((c) => c.value === value))
    .map(([value, label]) => ({ value, label })),
]

/**
 * Type keys are namespaced on the way in: `education` is both a resource
 * category and a grant type, so a bare value would match the wrong entity.
 */
const TYPE_GROUPS: { entity: string; heading: MessageDescriptor; labels: Record<string, string> }[] = [
  { entity: 'resource', heading: msg`Resources`, labels: RESOURCE_TYPE_LABELS },
  { entity: 'event', heading: msg`Events`, labels: EVENT_TYPE_LABELS },
  { entity: 'grant', heading: msg`Grants`, labels: GRANT_TYPE_LABELS },
]

interface ChipProps {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}

function Chip({ selected, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
        selected
          ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-800'
          : 'border-ktip-sand-200 text-ktip-sand-700 hover:border-ktip-ocean-300 hover:bg-ktip-ocean-50/50'
      }`}
    >
      {children}
    </button>
  )
}

interface SectionProps {
  icon: React.ReactNode
  iconClass: string
  title: string
  subtitle: string
  children: React.ReactNode
}

function Section({ icon, iconClass, title, subtitle, children }: SectionProps) {
  return (
    // Title doubles as the scrollspy rail label
    <Card id={title.toLowerCase().replace(/\s+/g, '-')} data-spy={title} className="scroll-mt-24">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconClass}`}>
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-display font-bold text-ktip-sand-900">{title}</h2>
          <p className="text-sm text-ktip-sand-600">{subtitle}</p>
        </div>
      </div>
      {children}
    </Card>
  )
}

export function PersonalizationTab() {
    const { t, i18n } = useLingui()
  const auth = useAuth()
  const toast = useToast()
  const { personalization, loading } = useMyPersonalization(auth.user?.id)
  const { savePersonalization, loading: saving } = useSavePersonalization()
  const { resetPersonalization, loading: resetting } = useResetPersonalization()

  const [form, setForm] = useState<PersonalizationSettings>({ ...DEFAULT_PERSONALIZATION })

  // Seeded once the row arrives, then owned locally until Save — same shape as
  // the other settings tabs.
  useEffect(() => {
    if (loading || !personalization) return
    setForm({ ...personalization })
  }, [loading, personalization])

  const set = <K extends keyof PersonalizationSettings>(
    key: K,
    value: PersonalizationSettings[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }))

  const toggleIn = (key: 'categories' | 'content_types', value: string) =>
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((v) => v !== value)
        : [...prev[key], value],
    }))

  const handleSave = async () => {
    if (!auth.user) return
    try {
      await savePersonalization(auth.user.id, form)
      analytics.feature('personalization', 'save', {
        enabled: form.enabled,
        topics: form.topics.length,
        categories: form.categories.length,
        content_types: form.content_types.length,
      })
      toast.success(t`Personalization saved!`)
    } catch {
      toast.error(t`Failed to save personalization`)
    }
  }

  const handleReset = async () => {
    if (!auth.user) return
    try {
      await resetPersonalization(auth.user.id)
      setForm({ ...DEFAULT_PERSONALIZATION })
      analytics.feature('personalization', 'reset')
      toast.success(t`Personalization reset to defaults`)
    } catch {
      toast.error(t`Failed to reset personalization`)
    }
  }

  const off = !form.enabled

  return (
    <div className="space-y-6">
      <Section
        icon={<Sparkles size={20} className="text-ktip-ocean-600" />}
        iconClass="bg-ktip-ocean-100"
        title={t`Personalize my platform`}
        subtitle={t`Put the projects, resources, events and grants that suit you first`}
      >
        <div className="divide-y divide-ktip-sand-100">
          <Toggle
            checked={form.enabled}
            onChange={(v) => set('enabled', v)}
            label={t`Personalize what I see`}
            description={t`Adds a “For You” sort to every list page and makes it your default. Nothing is ever hidden — matching items simply move to the top, and every other sort stays one click away.`}
          />
        </div>
      </Section>

      <Section
        icon={<Sparkles size={20} className="text-ktip-tropical-600" />}
        iconClass="bg-ktip-tropical-100"
        title={t`Topics`}
        subtitle={t`The single biggest lever — pick what you want to see more of`}
      >
        <TopicPicker values={form.topics} onChange={(v) => set('topics', v)} />
      </Section>

      <Section
        icon={<Layers size={20} className="text-ktip-ocean-600" />}
        iconClass="bg-ktip-ocean-100"
        title={t`Categories`}
        subtitle={t`Applies to projects and resources — events and grants are sorted by type instead`}
      >
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map(({ value, label }) => (
            <Chip
              key={value}
              selected={form.categories.includes(value)}
              onClick={() => toggleIn('categories', value)}
            >
              {label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section
        icon={<FileType size={20} className="text-ktip-sun-700" />}
        iconClass="bg-ktip-sun-100"
        title={t`Content types`}
        subtitle={t`The formats you find most useful`}
      >
        <div className="space-y-4">
          {TYPE_GROUPS.map(({ entity, heading, labels }) => (
            <div key={entity}>
              <div className="text-xs font-semibold uppercase tracking-wide text-ktip-sand-500 mb-2">
                {i18n._(heading)}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(labels).map(([value, label]) => {
                  const key = `${entity}:${value}`
                  return (
                    <Chip
                      key={key}
                      selected={form.content_types.includes(key)}
                      onClick={() => toggleIn('content_types', key)}
                    >
                      {label}
                    </Chip>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        icon={<Leaf size={20} className="text-ktip-tropical-600" />}
        iconClass="bg-ktip-tropical-100"
        title={t`Climate focus`}
        subtitle={t`Boost climate action work across every list`}
      >
        <div className="divide-y divide-ktip-sand-100">
          <Toggle
            checked={form.climate_focus}
            onChange={(v) => set('climate_focus', v)}
            label={t`Prioritise climate action content`}
            description={t`Anything flagged as climate action ranks higher for you.`}
          />
        </div>
      </Section>

      <Section
        icon={<SlidersHorizontal size={20} className="text-ktip-sand-600" />}
        iconClass="bg-ktip-sand-100"
        title={t`Signals we use`}
        subtitle={t`Switch off anything you would rather we ignored`}
      >
        <div className="divide-y divide-ktip-sand-100 mb-4">
          <Toggle
            checked={form.use_profile_signals}
            onChange={(v) => set('use_profile_signals', v)}
            disabled={off}
            label={t`My profile`}
            description={t`Interests, skills, industry, country and roles.`}
          />
          <Toggle
            checked={form.use_behavior_signals}
            onChange={(v) => set('use_behavior_signals', v)}
            disabled={off}
            label={t`My activity`}
            description={t`Projects you like or follow, events you RSVP to, grants you apply for. Things you have already engaged with are pushed down, not hidden.`}
          />
          <Toggle
            checked={form.use_badge_signals}
            onChange={(v) => set('use_badge_signals', v)}
            disabled={off}
            label={t`My badges`}
            description={t`Suggests the next useful step — starter guides before your first project, grants once you are verified.`}
          />
        </div>

        <SignalSummary />
      </Section>

      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <Button
          variant="ghost"
          onClick={handleReset}
          loading={resetting}
          icon={<RotateCcw size={16} />}
        >
          <Trans>Reset to defaults</Trans>
        </Button>
        <Button onClick={handleSave} loading={saving} icon={<Save size={18} />}>
          <Trans>Save Personalization</Trans>
        </Button>
      </div>
    </div>
  )
}

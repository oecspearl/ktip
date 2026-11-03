import { useMemo } from 'react'
import { Building2, PencilRuler, Shuffle, Sparkles } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'
import { Button } from '../../ui/Button'
import { cn } from '../../../lib/utils'
import {
  SCRATCH_BUILDING,
  SCRATCH_MAX_FLOORS,
  SCRATCH_MIN_FLOORS,
  planScratch,
  type BuildingPlan,
} from '../../../lib/venue-building'
import { isLaidOut, templateById, templatesForType } from '../../../lib/venue-templates'
import { BuildingPlanPreview } from './BuildingPlanPreview'
import { TEMPLATE_ICONS, TemplateSize, TemplateThumb } from './VenueTemplatePicker'

interface BuildingChooserProps {
  eventType: string | null | undefined
  /** A template id or SCRATCH_BUILDING. */
  value: string
  onChange: (choice: string) => void
  scratchFloors: number
  onScratchFloorsChange: (floors: number) => void
  /** The building as it will be saved, laid out with the current seed. */
  plan: BuildingPlan
  onShuffle: () => void
}

/**
 * Picking the venue's building while creating the event: a template card or
 * "from scratch", a larger plan of the one picked, and a shuffle for a fresh
 * layout. Saving happens after the event exists; see CreateEventPage.
 */
export function BuildingChooser({
  eventType,
  value,
  onChange,
  scratchFloors,
  onScratchFloorsChange,
  plan,
  onShuffle,
}: BuildingChooserProps) {
  const { t, i18n } = useLingui()
  const templates = templatesForType(eventType)
  const scratch = value === SCRATCH_BUILDING
  const chosen = scratch ? null : templateById(value)
  const scratchThumb = useMemo(() => planScratch(scratchFloors, 20261103), [scratchFloors])

  const floorCount = plan.config.floors.length
  const roomCount = plan.rooms.length
  const floorText = plural(floorCount, { one: '# floor', other: '# floors' })
  const roomText = plural(roomCount, { one: '# room', other: '# rooms' })
  // Only a laid-out building has a layout to re-roll. From scratch, the only
  // thing that moves is the stairs, so there must be some.
  const canShuffle = scratch ? floorCount > 1 : !!chosen && isLaidOut(chosen)

  const cardClass = (selected: boolean) =>
    cn(
      'rounded-xl border-2 p-3 text-left transition-colors',
      selected
        ? 'border-ktip-ocean-500 bg-ktip-ocean-50'
        : 'border-ktip-sand-200 bg-ktip-cream hover:border-ktip-ocean-300'
    )

  return (
    <div className="space-y-4 rounded-xl border-2 border-ktip-sand-200 p-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-ktip-sand-800">
          <Building2 size={18} className="text-ktip-sand-600" aria-hidden="true" />
          <Trans>Building</Trans>
        </div>
        <p className="mt-1 text-xs text-ktip-sand-500">
          <Trans>
            The venue people walk around in. Pick a building or start from scratch. You can change
            any room later in the venue editor.
          </Trans>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => {
          const Icon = TEMPLATE_ICONS[template.icon] ?? Sparkles
          const selected = value === template.id
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onChange(template.id)}
              aria-pressed={selected}
              className={cardClass(selected)}
            >
              <TemplateThumb template={template} />
              <span className="mt-2 flex items-center gap-1.5">
                <Icon size={14} className="shrink-0 text-ktip-ocean-600" aria-hidden="true" />
                <span className="text-sm font-semibold text-ktip-sand-800">
                  {i18n._(template.name)}
                </span>
              </span>
              <TemplateSize template={template} />
              <span className="mt-1 block text-xs leading-relaxed text-ktip-sand-500">
                {i18n._(template.description)}
              </span>
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => onChange(SCRATCH_BUILDING)}
          aria-pressed={scratch}
          className={cardClass(scratch)}
        >
          <BuildingPlanPreview plan={scratchThumb} compact />
          <span className="mt-2 flex items-center gap-1.5">
            <PencilRuler size={14} className="shrink-0 text-ktip-ocean-600" aria-hidden="true" />
            <span className="text-sm font-semibold text-ktip-sand-800">
              <Trans>From scratch</Trans>
            </span>
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-ktip-sand-500">
            <Trans>
              Empty floors with a door each and stairs between them. You draw the rooms.
            </Trans>
          </span>
        </button>
      </div>

      <div className="rounded-xl bg-ktip-sand-50 p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm font-semibold text-ktip-sand-800">
            {chosen ? i18n._(chosen.name) : t`From scratch`}
          </p>
          <p className="text-xs text-ktip-sand-600" aria-live="polite">
            {scratch ? floorText : t`${floorText}, ${roomText}`}
          </p>
          {scratch && (
            <label className="flex items-center gap-2 text-xs text-ktip-sand-700">
              <Trans>Floors</Trans>
              <select
                value={scratchFloors}
                onChange={(e) => onScratchFloorsChange(Number(e.target.value))}
                className="rounded-lg border-2 border-ktip-sand-200 bg-white px-2 py-1 text-sm focus:border-ktip-ocean-500 focus:outline-hidden"
              >
                {Array.from(
                  { length: SCRATCH_MAX_FLOORS - SCRATCH_MIN_FLOORS + 1 },
                  (_, i) => SCRATCH_MIN_FLOORS + i
                ).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          {canShuffle && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<Shuffle size={16} aria-hidden="true" />}
              onClick={onShuffle}
              className="ml-auto"
            >
              <Trans>Shuffle layout</Trans>
            </Button>
          )}
        </div>
        <BuildingPlanPreview plan={plan} className="mt-3" />
        {plan.missing.length > 0 && (
          <p className="mt-2 text-xs text-ktip-sand-600">
            <Trans>
              Some rooms did not fit this layout. They are kept off the map for you to place, or
              shuffle for another layout.
            </Trans>
          </p>
        )}
      </div>
    </div>
  )
}

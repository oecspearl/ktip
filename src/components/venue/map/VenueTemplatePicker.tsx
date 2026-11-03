import { useEffect } from 'react'
import {
  Building2,
  GraduationCap,
  Layers,
  Mic,
  Rocket,
  Sparkles,
  Store,
  Warehouse,
  Wrench,
  X,
} from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'
import {
  isLaidOut,
  templateSize,
  templatesForType,
  type VenueTemplate,
} from '../../../lib/venue-templates'
import { EVENT_TYPE_LABELS } from '../../../lib/constants'
import { BuildingPlanPreview, thumbnailPlan } from './BuildingPlanPreview'

/** A host-saved building, loaded from venue_templates (107). */
export interface SavedVenueTemplate {
  id: string
  name: string
  description: string | null
  /** events.venue_map snapshot — parsed by the editor, never trusted raw. */
  map?: unknown
  /** The room snapshot array — parsed by the editor, never trusted raw. */
  rooms?: unknown
}

interface VenueTemplatePickerProps {
  open: boolean
  /** events.event_type — orders the gallery, suggested buildings first. */
  eventType?: string | null
  /** The host's own saved buildings. Absent hides the section entirely. */
  saved?: SavedVenueTemplate[]
  onApply: (template: VenueTemplate) => void
  onApplySaved?: (template: SavedVenueTemplate) => void
  onClose: () => void
}

export const TEMPLATE_ICONS: Record<string, typeof Rocket> = {
  Rocket,
  Mic,
  Wrench,
  Store,
  Building2,
  Layers,
  GraduationCap,
  Warehouse,
}

/** The little floorplan on each card: every floor from above, to scale. */
export function TemplateThumb({ template }: { template: VenueTemplate }) {
  return <BuildingPlanPreview plan={thumbnailPlan(template)} compact />
}

/** "5 floors, 31 rooms" under a template's name. */
export function TemplateSize({ template }: { template: VenueTemplate }) {
  const { floors, rooms } = templateSize(template)
  const floorText = plural(floors, { one: '# floor', other: '# floors' })
  const roomText = plural(rooms, { one: '# room', other: '# rooms' })
  return (
    <span className="text-xs text-ktip-sand-500">
      <Trans>
        {floorText}, {roomText}
      </Trans>
    </span>
  )
}

/**
 * The template gallery: every built-in building, the ones suggested for this
 * event type first, plus whatever the host has saved themselves. Laid-out
 * buildings replace the whole venue; single-floor layouts add rooms to it.
 * Either way it is one editor step, so the wrong pick is one undo away.
 */
export function VenueTemplatePicker({
  open,
  eventType,
  saved,
  onApply,
  onApplySaved,
  onClose,
}: VenueTemplatePickerProps) {
  const { t, i18n } = useLingui()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const templates = templatesForType(eventType)
  const buildings = templates.filter(isLaidOut)
  const layouts = templates.filter((template) => !isLaidOut(template))

  const card = (template: VenueTemplate) => {
    const Icon = TEMPLATE_ICONS[template.icon] ?? Sparkles
    const suggested = !!eventType && template.suggestedFor.includes(eventType)
    return (
      <button
        key={template.id}
        type="button"
        onClick={() => onApply(template)}
        className="group rounded-xl border border-ktip-sand-200 bg-white p-3 text-left transition-colors hover:border-ktip-tropical-400"
      >
        <TemplateThumb template={template} />
        <div className="mt-2 flex items-center gap-1.5">
          <Icon size={14} className="shrink-0 text-ktip-tropical-700" aria-hidden="true" />
          <span className="font-display text-sm font-bold text-ktip-sand-900">
            {i18n._(template.name)}
          </span>
          {suggested && (
            <span className="ml-auto rounded-full bg-ktip-tropical-50 px-2 py-0.5 text-xs font-semibold text-ktip-tropical-800">
              {EVENT_TYPE_LABELS[eventType] ?? eventType}
            </span>
          )}
        </div>
        <TemplateSize template={template} />
        <p className="mt-1 text-xs leading-relaxed text-ktip-sand-600">
          {i18n._(template.description)}
        </p>
      </button>
    )
  }

  return (
    <div
      data-lite-solid
      className="fixed inset-0 z-modal flex items-center justify-center bg-ktip-sand-900/40 p-4 backdrop-blur-sm [--lite-solid:color-mix(in_srgb,var(--color-ktip-sand-900)_50%,transparent)]"
      role="dialog"
      aria-modal="true"
      aria-label={t`Venue templates`}
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-ktip-sand-900">
              <Trans>Start from a template</Trans>
            </h2>
            <p className="mt-0.5 text-sm text-ktip-sand-600">
              <Trans>
                A whole building in one click. Every room stays editable afterwards, and Undo takes
                a pick back.
              </Trans>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t`Close`}
            className="rounded-lg p-1.5 text-ktip-sand-500 hover:bg-ktip-sand-100"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
          <Trans>Whole buildings</Trans>
        </h3>
        <p className="mb-2 text-xs text-ktip-sand-600">
          <Trans>
            These replace every floor and room, laid out afresh each time. Team rooms you already
            have are kept and moved into the new team rooms.
          </Trans>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">{buildings.map(card)}</div>

        <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
          <Trans>Single floor layouts</Trans>
        </h3>
        <p className="mb-2 text-xs text-ktip-sand-600">
          <Trans>These add rooms to the floors you already have.</Trans>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">{layouts.map(card)}</div>

        {!!saved?.length && (
          <>
            <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
              <Trans>My templates</Trans>
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {saved.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => onApplySaved?.(template)}
                  className="rounded-xl border border-ktip-sand-200 bg-white p-3 text-left transition-colors hover:border-ktip-tropical-400"
                >
                  <span className="font-display text-sm font-bold text-ktip-sand-900">
                    {template.name}
                  </span>
                  {template.description && (
                    <p className="mt-1 text-xs leading-relaxed text-ktip-sand-600">
                      {template.description}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

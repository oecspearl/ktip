import { useEffect } from 'react'
import { Mic, Rocket, Sparkles, Store, Wrench, X } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { templatesForType, type VenueTemplate } from '../../../lib/venue-templates'
import { presetByKey } from '../../../lib/venue-room-presets'
import { EVENT_TYPE_LABELS } from '../../../lib/constants'

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

const TEMPLATE_ICONS: Record<string, typeof Rocket> = {
  Rocket,
  Mic,
  Wrench,
  Store,
}

/** The little floorplan on each card — the template's rects, to scale. */
function TemplateThumb({ template }: { template: VenueTemplate }) {
  return (
    <svg viewBox="0 0 28 18" className="h-20 w-full rounded-lg bg-ktip-sand-100" aria-hidden="true">
      {template.rooms.map((entry, i) => {
        const [x1, y1, x2, y2] = entry.rect
        return (
          <rect
            key={i}
            x={x1}
            y={y1}
            width={x2 - x1 + 1}
            height={y2 - y1 + 1}
            rx={0.6}
            fill={presetByKey(entry.preset)?.color ?? '#a8a29e'}
            opacity={0.85}
          />
        )
      })}
    </svg>
  )
}

/**
 * The template gallery: every built-in building, the ones suggested for this
 * event type first, plus whatever the host has saved themselves. Applying one
 * only drops draft rooms into the editor — nothing is written until Save, so
 * the wrong pick is one undo away.
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

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-ktip-sand-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t`Venue templates`}
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-ktip-sand-900">
              <Trans>Start from a template</Trans>
            </h2>
            <p className="mt-0.5 text-sm text-ktip-sand-600">
              <Trans>
                A whole building in one click. Every room stays editable afterwards, and nothing is
                saved until you press Save.
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

        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((template) => {
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
                    <span className="ml-auto rounded-full bg-ktip-tropical-50 px-2 py-0.5 text-[10px] font-semibold text-ktip-tropical-800">
                      {EVENT_TYPE_LABELS[eventType] ?? eventType}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ktip-sand-600">
                  {i18n._(template.description)}
                </p>
              </button>
            )
          })}
        </div>

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

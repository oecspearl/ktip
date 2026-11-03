import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Palette, Trash2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import { supabase } from '../../../lib/supabase'
import { keys } from '../../../queries/keys'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { Button } from '../../ui/Button'
import { VenueMapStage } from '../map/VenueMapStage'
import {
  VENUE_PALETTE,
  buildGeometry,
  makeProjection,
  parseCells,
  type VenueMapConfig,
} from '../../../lib/venue-map'
import {
  HOMEBASE_ITEMS,
  homebaseItems,
  parseDecor,
  type HomebaseItem,
  type RoomDecor,
} from '../../../lib/venue-furniture'
import { ROOM_ART_TYPES, roomArtUrl, uploadRoomArt } from '../../../lib/venue-room-art'
import type { VenueRoom } from '../../../types'

const ITEM_LABEL: Record<HomebaseItem, MessageDescriptor> = {
  video: msg`Video call wall`,
  kanban: msg`Task board`,
  whiteboard: msg`Whiteboard with sticky notes`,
  banner: msg`Logo banner`,
  mural: msg`Mural`,
  desks: msg`Desks and monitors`,
  sofa: msg`Sofa`,
  beanbags: msg`Beanbags`,
  coffee: msg`Coffee corner`,
  shelf: msg`Bookshelf`,
  plants: msg`Plants`,
  rug: msg`Team rug`,
}

const PREVIEW_W = 520
const PREVIEW_H = 320

interface Props {
  room: VenueRoom
}

/**
 * "Make this Homebase yours": the team picks a colour, what stands in the
 * room, and hangs its own logo and mural (migration 188).
 *
 * The preview is the real map renderer pointed at this one room, so what the
 * team sees here is exactly what everyone walking past sees on the floor. The
 * room is shifted to the origin of a small private grid for the preview; its
 * cells on the real map are untouched.
 */
export function HomebaseLookPanel({ room }: Props) {
  const { t, i18n } = useLingui()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data: canEdit } = useQuery({
    queryKey: [...keys.sub('venue', 'room-look-edit', room.id), user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('can_edit_room_look', {
        p_user: user!.id,
        p_room_id: room.id,
      })
      // Before 188 is applied the function does not exist: nobody can edit,
      // and the panel stays hidden rather than erroring.
      if (error) return false
      return !!data
    },
  })

  const saved = useMemo(() => parseDecor((room as any).decor), [room])
  const [draft, setDraft] = useState<RoomDecor>(saved)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<null | 'logo' | 'mural'>(null)
  useEffect(() => setDraft(saved), [saved])

  const items = homebaseItems(draft)
  const color = draft.color || room.color || VENUE_PALETTE[1]
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  // ---- preview: this room alone, on a grid just big enough for it ----
  const preview = useMemo(() => {
    const cells = parseCells(room.cells)
    if (!cells.length) return null
    const minX = Math.min(...cells.map((c) => c[0]))
    const minY = Math.min(...cells.map((c) => c[1]))
    const shifted = cells.map(([x, y]) => [x - minX + 1, y - minY + 1] as [number, number])
    const cols = Math.max(...shifted.map((c) => c[0])) + 2
    const rows = Math.max(...shifted.map((c) => c[1])) + 2
    const config: VenueMapConfig = { v: 1, cols, rows, floors: [{ key: 'preview', name: 'Preview' }] }
    const geometry = buildGeometry([
      { ...room, floor: 0, cells: shifted, decor: draft, furniture: 'homebase' } as any,
    ])
    const height = Math.max(1, Number(room.wall_height) || 1)
    const projection = makeProjection({
      cols,
      rows,
      tilt: 1,
      width: PREVIEW_W,
      height: PREVIEW_H,
      zoom: { k: 1, px: 0, py: 0 },
      topZ: height,
      padding: 40,
    })
    return { config, geometry, projection }
  }, [room, draft])

  const save = useMutation({
    mutationFn: async (decor: RoomDecor) => {
      const { error } = await (supabase as any).rpc('set_room_look', { p_room_id: room.id, p_decor: decor })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'rooms', room.event_id) })
      toast.success(t`Homebase saved. Everyone on the map sees the new look.`)
    },
    onError: (err: any) => toast.error(err?.message || t`Could not save the new look`),
  })

  const logoInput = useRef<HTMLInputElement>(null)
  const muralInput = useRef<HTMLInputElement>(null)
  const upload = async (slot: 'logo' | 'mural', file: File | undefined) => {
    if (!file) return
    setBusy(slot)
    try {
      const prev = slot === 'logo' ? draft.logo_path : draft.mural_path
      const path = await uploadRoomArt(room.id, slot, file, prev)
      setDraft((d) => ({
        ...d,
        [slot === 'logo' ? 'logo_path' : 'mural_path']: path,
        items: { ...(d.items || {}), [slot === 'logo' ? 'banner' : 'mural']: true },
      }))
    } catch (err: any) {
      toast.error(err?.message || t`Upload failed`)
    } finally {
      setBusy(null)
    }
  }

  if (!canEdit) return null

  if (!open) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ktip-sand-200 bg-white p-4">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-ktip-sand-900">
            <Trans>Make this Homebase yours</Trans>
          </p>
          <p className="text-sm text-ktip-sand-600">
            <Trans>Pick a colour, choose what goes in the room, and hang your team's logo.</Trans>
          </p>
        </div>
        <Button variant="secondary" icon={<Palette size={16} aria-hidden="true" />} onClick={() => setOpen(true)}>
          <Trans>Customise</Trans>
        </Button>
      </div>
    )
  }

  return (
    <section className="mb-6 rounded-2xl border border-ktip-sand-200 bg-white p-4 md:p-5" aria-labelledby="homebase-look-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="homebase-look-title" className="font-display text-xl font-bold text-ktip-sand-900">
          <Trans>Customise your Homebase</Trans>
        </h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => { setDraft(saved); setOpen(false) }}>
            <Trans>Close</Trans>
          </Button>
          <Button onClick={() => save.mutate(draft)} loading={save.isPending} disabled={!dirty}>
            <Trans>Save look</Trans>
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0 overflow-hidden rounded-xl bg-ktip-canvas">
          {preview && (
            <svg viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`} className="block h-auto w-full" role="img" aria-label={t`Preview of ${room.name}`}>
              <VenueMapStage
                config={preview.config}
                geometry={preview.geometry}
                projection={preview.projection}
                floor={0}
                tilt={1}
                stack={0}
                roomArtUrl={roomArtUrl}
              />
            </svg>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ktip-sand-800"><Trans>Colour</Trans></legend>
            <div className="flex flex-wrap items-center gap-2">
              {VENUE_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={t`Colour ${c}`}
                  aria-pressed={color.toUpperCase() === c.toUpperCase()}
                  onClick={() => setDraft((d) => ({ ...d, color: c.toUpperCase() }))}
                  className="h-8 w-8 rounded-full border-2 border-white shadow ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-ktip-ocean-600"
                  style={{ background: c }}
                />
              ))}
              <label className="flex items-center gap-2 text-sm text-ktip-sand-700">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value.toUpperCase() }))}
                  className="h-8 w-10 cursor-pointer rounded border border-ktip-sand-200 bg-white"
                />
                <Trans>Your own</Trans>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ktip-sand-800"><Trans>In the room</Trans></legend>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {HOMEBASE_ITEMS.map((k) => (
                <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ktip-sand-800 hover:bg-ktip-sand-50">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-ktip-ocean-600"
                    checked={items[k]}
                    onChange={(e) => setDraft((d) => ({ ...d, items: { ...(d.items || {}), [k]: e.target.checked } }))}
                  />
                  {i18n._(ITEM_LABEL[k])}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-ktip-sand-800"><Trans>Logo and mural</Trans></legend>
            {(['logo', 'mural'] as const).map((slot) => {
              const path = slot === 'logo' ? draft.logo_path : draft.mural_path
              return (
                <div key={slot} className="flex flex-wrap items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ktip-sand-200 bg-ktip-sand-50">
                    {path ? (
                      <img src={roomArtUrl(path)} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <ImagePlus size={18} className="text-ktip-sand-400" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium text-ktip-sand-800">
                      {slot === 'logo' ? <Trans>Team logo</Trans> : <Trans>Mural or design</Trans>}
                    </p>
                    <p className="text-xs text-ktip-sand-500">
                      {slot === 'logo'
                        ? t`Shows on the banner and the rug. PNG, JPEG, WebP or GIF, up to 2 MB.`
                        : t`Hangs on a wall. PNG, JPEG, WebP or GIF, up to 2 MB.`}
                    </p>
                  </div>
                  <input
                    ref={slot === 'logo' ? logoInput : muralInput}
                    type="file"
                    accept={ROOM_ART_TYPES.join(',')}
                    className="sr-only"
                    onChange={(e) => {
                      upload(slot, e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy === slot}
                    onClick={() => (slot === 'logo' ? logoInput : muralInput).current?.click()}
                  >
                    {path ? <Trans>Replace</Trans> : <Trans>Upload</Trans>}
                  </Button>
                  {path && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={slot === 'logo' ? t`Remove logo` : t`Remove mural`}
                      icon={<Trash2 size={14} aria-hidden="true" />}
                      onClick={() =>
                        setDraft((d) => {
                          const next = { ...d }
                          if (slot === 'logo') delete next.logo_path
                          else delete next.mural_path
                          return next
                        })
                      }
                    />
                  )}
                </div>
              )
            })}
          </fieldset>
          <p className="text-xs text-ktip-sand-500">
            <Trans>Anyone on your team can change this. Organisers can too.</Trans>
          </p>
        </div>
      </div>
    </section>
  )
}

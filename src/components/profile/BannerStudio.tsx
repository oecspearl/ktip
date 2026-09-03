import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useFileDrop } from '../../hooks/useFileDrop'
import { uploadOptimizedImage } from '../../lib/storage-upload'
import { IMAGE_PRESETS } from '../../lib/constants'
import { heroImageFor } from '../../lib/hero-images'
import {
  BANNER_WASH,
  DEFAULT_GRADIENT_COLORS,
  PRESET_BANNERS,
  bannerImage,
  bannerPosition,
  isGradientBanner,
  parseBanner,
  type BannerSpec,
  type BannerSurface,
} from '../../lib/banner'
import { BannerAurora } from './BannerAurora'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { cn } from '../../lib/utils'
import { Dices, ImagePlus, Move, Save, Trash2, Upload } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'

const IMAGE_ACCEPT = ['image/*'] as const

type SourceTab = 'upload' | 'designs' | 'gradient'

/**
 * The banner editor: pick a source (your own photo, a built-in design, or an
 * aurora gradient), watch every surface that will show it update live, and
 * drag inside each preview to set that surface's own focal point. Nothing
 * writes to the profile until Save — the previews read a local draft.
 */
/**
 * Card on the settings grid, plain block inside the editor sheet.
 *
 * The scroll-spy marker rides the Card, so in `bare` mode it is deliberately
 * absent — the collapsed BannerTile on the page carries it instead, and two
 * elements answering to `[data-spy="Banner"]` would put the same step on the
 * rail twice.
 */
function Shell({
  bare,
  className,
  children,
}: {
  bare?: boolean
  className?: string
  children: ReactNode
}) {
  if (bare) return <div className={className}>{children}</div>
  return (
    <Card id="banner" data-spy="Banner" className={cn('scroll-mt-24', className)}>
      {children}
    </Card>
  )
}

interface BannerStudioProps {
  className?: string
  /**
   * Drop the Card shell and the heading block. For the editor sheet, where the
   * dialog already supplies a surface and a title and repeating both reads as
   * a card inside a card.
   */
  bare?: boolean
  /** Fired after a successful save or remove — the sheet closes on it. */
  onSaved?: () => void
}

export function BannerStudio({ className, bare, onSaved }: BannerStudioProps = {}) {
  const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()

  const saved = useMemo(() => parseBanner(auth.profile?.banner), [auth.profile?.banner])
  const [draft, setDraft] = useState<BannerSpec | null>(saved)
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    // Same late-profile hydration dance as the rest of the settings form.
    if (auth.profile && !initialized) {
      setDraft(parseBanner(auth.profile.banner))
      setInitialized(true)
    }
  }, [auth.profile, initialized])

  const [tab, setTab] = useState<SourceTab>(() =>
    saved?.kind === 'gradient' ? 'gradient' : saved?.kind === 'preset' ? 'designs' : 'upload'
  )
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  // ------------------------------------------------------------- sources
  const handleBannerFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error(t`Please select an image file`)
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error(t`Image must be less than 8MB`)
      return
    }
    setUploading(true)
    try {
      const url = await uploadOptimizedImage({
        bucket: 'avatars',
        basePath: `${auth.user!.id}/banner`,
        file,
        preset: IMAGE_PRESETS.BANNER,
      })
      setDraft((prev) => ({ kind: 'image', url, pos: prev && prev.kind !== 'gradient' ? prev.pos : undefined }))
    } catch (err: any) {
      toast.error(err.message || t`Failed to upload banner`)
    } finally {
      setUploading(false)
    }
  }

  const { isDragging, dropProps } = useFileDrop({
    onFiles: (files) => void handleBannerFile(files[0]),
    accept: IMAGE_ACCEPT,
    disabled: uploading,
  })

  const gradientDraft = isGradientBanner(draft)
    ? draft
    : { kind: 'gradient' as const, colors: DEFAULT_GRADIENT_COLORS, seed: 1 }

  const setGradientColors = (colors: string[]) =>
    setDraft({ kind: 'gradient', colors, seed: gradientDraft.seed ?? 1 })

  const shuffleGradient = () =>
    setDraft({
      kind: 'gradient',
      colors: gradientDraft.colors,
      seed: ((gradientDraft.seed ?? 1) * 7 + Math.floor(Math.random() * 997)) % 100000,
    })

  // ---------------------------------------------------------- positioning
  const setPos = (surface: BannerSurface, x: number, y: number) =>
    setDraft((prev) => {
      if (!prev || prev.kind === 'gradient') return prev
      return { ...prev, pos: { ...prev.pos, [surface]: { x: Math.round(x), y: Math.round(y) } } }
    })

  // -------------------------------------------------------------- saving
  const handleSave = async () => {
    setSaving(true)
    try {
      await auth.updateProfile({ banner: draft } as any)
      toast.success(t`Banner updated!`)
      onSaved?.()
    } catch (err: any) {
      toast.error(err.message || t`Failed to update banner`)
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setDraft(null)
    if (saved) {
      setSaving(true)
      try {
        await auth.updateProfile({ banner: null } as any)
        toast.success(t`Banner removed`)
        onSaved?.()
      } catch (err: any) {
        toast.error(err.message || t`Failed to update banner`)
      } finally {
        setSaving(false)
      }
    }
  }

  const draggable = !!draft && draft.kind !== 'gradient'
  const displayName = auth.profile?.display_name || t`You`

  return (
    <Shell bare={bare} className={className}>
      {/* The dialog supplies the title in `bare` mode, but not this paragraph —
          it is the only place that explains where a banner actually shows up,
          so it stays in both. */}
      {!bare && (
        <h2 className="text-lg font-display font-bold text-ktip-sand-900 mb-1"><Trans>Banner</Trans></h2>
      )}
      <p className="text-sm text-ktip-sand-600 mb-4">
        <Trans>
          Shown on your member page, your directory card, the member preview and your dashboard.
          The previews below are live{draggable ? t` — drag inside one to position the image for that surface` : ''}.
        </Trans>
      </p>

      {/* Source tabs */}
      <div className="flex gap-1.5 mb-4">
        {(
          [
            ['upload', t`Your photo`],
            ['designs', t`Designs`],
            ['gradient', t`Gradient`],
          ] as Array<[SourceTab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'px-3.5 py-1.5 rounded-full border-2 text-sm font-medium transition-all',
              tab === key
                ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-700'
                : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-ocean-300'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'upload' && (
        <label
          {...dropProps}
          className={cn(
            'flex h-28 cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors',
            isDragging
              ? 'border-ktip-ocean-400 bg-ktip-ocean-50'
              : 'border-ktip-sand-300 bg-ktip-sand-50/50 hover:border-ktip-ocean-300'
          )}
        >
          {uploading ? (
            <span className="text-sm text-ktip-ocean-600"><Trans>Uploading…</Trans></span>
          ) : (
            <>
              {draft?.kind === 'image' ? <ImagePlus size={18} className="text-ktip-sand-500" /> : <Upload size={18} className="text-ktip-sand-500" />}
              <span className="text-sm text-ktip-sand-600">
                {isDragging ? (
                  <Trans>Drop to upload</Trans>
                ) : draft?.kind === 'image' ? (
                  <Trans>Click or drop to replace your banner photo</Trans>
                ) : (
                  <Trans>Click or drop a wide photo — it is resized and optimized automatically</Trans>
                )}
              </span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void handleBannerFile(file)
            }}
          />
        </label>
      )}

      {tab === 'designs' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {PRESET_BANNERS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() =>
                setDraft((prev) => ({
                  kind: 'preset',
                  id: preset.id,
                  pos: prev && prev.kind !== 'gradient' ? prev.pos : undefined,
                }))
              }
              className={cn(
                'group relative h-16 overflow-hidden rounded-lg border-2 transition-all',
                draft?.kind === 'preset' && draft.id === preset.id
                  ? 'border-ktip-ocean-500 ring-2 ring-ktip-ocean-500/30'
                  : 'border-transparent hover:border-ktip-ocean-300'
              )}
            >
              <img src={preset.url} alt={preset.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              <span className="absolute bottom-1 left-2 text-[10px] font-semibold uppercase tracking-wider text-white/85 [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">
                {preset.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {tab === 'gradient' && (
        <div className="flex flex-wrap items-center gap-3">
          {gradientDraft.colors.map((color, i) => (
            <span key={i} className="relative inline-flex items-center gap-1">
              <input
                type="color"
                value={color}
                aria-label={t`Gradient colour ${i + 1}`}
                onChange={(e) => {
                  const next = [...gradientDraft.colors]
                  next[i] = e.target.value
                  setGradientColors(next)
                }}
                className="h-9 w-12 cursor-pointer rounded-lg border border-ktip-sand-300 bg-transparent p-0.5"
              />
              {gradientDraft.colors.length > 2 && (
                <button
                  type="button"
                  aria-label={t`Remove colour`}
                  onClick={() => setGradientColors(gradientDraft.colors.filter((_, j) => j !== i))}
                  className="text-ktip-sand-400 hover:text-red-600 text-xs"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
          {gradientDraft.colors.length < 4 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setGradientColors([...gradientDraft.colors, '#97D700'])}
            >
              <Trans>+ Colour</Trans>
            </Button>
          )}
          <Button variant="outline" size="sm" icon={<Dices size={15} />} onClick={shuffleGradient}>
            <Trans>Shuffle placement</Trans>
          </Button>
          <p className="w-full text-xs text-ktip-sand-500">
            <Trans>
              Flat colour shapes are diffused into a slow-moving glow — placement is random per
              shuffle, then stays the same everywhere your banner appears.
            </Trans>
          </p>
        </div>
      )}

      {/* Live previews */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Preview surface="card" label={t`Directory card`} draft={draft} onPos={setPos} className="h-40 rounded-surface">
          <div className="absolute inset-0 p-4 flex flex-col justify-between pointer-events-none">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-white/75"><Trans>Member</Trans></p>
              <p className="mt-1 flex items-center gap-2 text-sm font-display font-bold text-white">
                <DiamondAvatar src={auth.profile?.avatar_url} name={displayName} size={24} />
                {displayName}
              </p>
            </div>
            <span className="self-start rounded-control bg-brand-navy px-2.5 py-1 text-[10px] font-semibold text-white">
              <Trans>View Profile</Trans>
            </span>
          </div>
        </Preview>

        <Preview surface="panel" label={t`Member preview`} draft={draft} onPos={setPos} className="h-40 rounded-xl" bandClass="h-16">
          <div className="absolute inset-x-0 top-16 bottom-0 bg-ktip-cream pointer-events-none" />
          <div className="absolute left-4 top-16 -translate-y-1/2 pointer-events-none">
            <DiamondAvatar src={auth.profile?.avatar_url} name={displayName} size={44} frameClassName="ring-4 ring-ktip-cream" />
          </div>
          <p className="absolute left-4 top-[4.7rem] text-sm font-display font-bold text-ktip-sand-900 pointer-events-none">
            {displayName}
          </p>
        </Preview>

        <Preview surface="page" label={t`Member page`} draft={draft} onPos={setPos} className="h-40 rounded-xl">
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          <div className="absolute bottom-3 right-4 text-right pointer-events-none">
            <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/60"><Trans>Member</Trans></p>
            <p className="text-lg font-display font-extrabold text-white">{displayName}</p>
          </div>
        </Preview>

        <Preview surface="dashboard" label={t`Dashboard`} draft={draft} onPos={setPos} className="h-40 rounded-xl">
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          <div className="absolute bottom-3 right-4 text-right pointer-events-none">
            <p className="flex items-center justify-end gap-1.5 text-[10px] text-white/85">
              <DiamondAvatar src={auth.profile?.avatar_url} name={displayName} size={18} />
              {displayName}
            </p>
            <p className="text-lg font-display font-extrabold text-white"><Trans>Dashboard</Trans></p>
          </div>
        </Preview>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        {(draft || saved) && (
          <Button variant="ghost" size="sm" icon={<Trash2 size={15} />} onClick={handleRemove} disabled={saving}>
            <Trans>Remove banner</Trans>
          </Button>
        )}
        <Button size="sm" icon={<Save size={15} />} onClick={handleSave} loading={saving} disabled={!dirty}>
          <Trans>Save banner</Trans>
        </Button>
      </div>
    </Shell>
  )
}

// ---------------------------------------------------------------------------

interface PreviewProps {
  surface: BannerSurface
  label: string
  draft: BannerSpec | null
  onPos: (surface: BannerSurface, x: number, y: number) => void
  className?: string
  /** Height of the banner band inside the preview; defaults to the full box. */
  bandClass?: string
  children?: React.ReactNode
}

/**
 * One surface mockup. The banner band renders the draft exactly the way the
 * real surface will (aurora animated, image with this surface's focal point);
 * dragging inside the band moves that focal point — the image follows the
 * pointer, so dragging left reveals more of the right side.
 */
function Preview({ surface, label, draft, onPos, className, bandClass, children }: PreviewProps) {
  const { t } = useLingui()
  const bandRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null)
  const draggable = !!draft && draft.kind !== 'gradient'

  const posString = bannerPosition(draft, surface) ?? '50% 50%'
  const [posX, posY] = posString.split(' ').map((v) => parseFloat(v))

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!draggable) return
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragState.current = { startX: e.clientX, startY: e.clientY, posX, posY }
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const s = dragState.current
    const rect = bandRef.current?.getBoundingClientRect()
    if (!s || !rect) return
    // Pointer right = image follows right = focal point percentage decreases.
    const x = s.posX - ((e.clientX - s.startX) / rect.width) * 100
    const y = s.posY - ((e.clientY - s.startY) / rect.height) * 100
    onPos(surface, Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y)))
  }
  const onPointerUp = () => {
    dragState.current = null
  }

  const gradient = isGradientBanner(draft)
  const imageSrc = bannerImage(draft) || heroImageFor(`${surface}-preview`)

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ktip-sand-600">
        {label}
        {draggable && <Move size={11} className="text-ktip-sand-400" aria-label={t`Drag to position`} />}
      </p>
      <div className={cn('relative overflow-hidden border border-ktip-sand-200 bg-ktip-sand-100', className)}>
        <div
          ref={bandRef}
          className={cn('absolute inset-x-0 top-0 overflow-hidden', bandClass ?? 'h-full', draggable && 'cursor-move touch-none')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {gradient ? (
            <BannerAurora spec={draft} />
          ) : (
            <img
              src={imageSrc}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover select-none"
              style={{ objectPosition: posString }}
            />
          )}
          {/* Same scrim the real surfaces put over chosen banner art, so the
              preview's contrast matches reality. Nothing over the aurora. */}
          {!gradient && (
            <div className={cn('absolute inset-0 bg-gradient-to-br pointer-events-none', BANNER_WASH)} />
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

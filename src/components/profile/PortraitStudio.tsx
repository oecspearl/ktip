import { useEffect, useMemo, useRef, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Dices, RotateCcw, Save, Scissors, Upload } from 'lucide-react'
import { Button } from '../ui/Button'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useFileDrop } from '../../hooks/useFileDrop'
import { IMAGE_PRESETS } from '../../lib/constants'
import { uploadOptimizedImage } from '../../lib/storage-upload'
import {
  AVATAR_BACKDROPS,
  DEFAULT_AVATAR_GRADIENT,
  PHOTO_STYLE,
  avatarGradientSpec,
  avatarKeys,
  isCutoutStyle,
  parseAvatarStyle,
  bannerFromAvatarStyle,
  type AvatarStyle,
  type CutoutStyle,
} from '../../lib/avatar-backdrop'
import { compositeAvatar } from '../../lib/portrait-composite'
import {
  CutoutUnavailableError,
  cutoutSupported,
  type CutoutPhase,
  type CutoutResult,
} from '../../lib/portrait-cutout'
import type { SubjectSide } from '../../lib/portrait-mask'
import { bannerImage, parseBanner, PRESET_BANNERS, type BannerSpec } from '../../lib/banner'
import { BannerAurora } from './BannerAurora'
import { cn } from '../../lib/utils'

const IMAGE_ACCEPT = ['image/*'] as const

type Tab = 'photo' | 'designs' | 'gradient'

type Phase =
  | 'idle'
  | 'uploading'
  | 'checking'
  | CutoutPhase
  | 'composing'
  | 'saving'

/** A fresh cut, held in memory until Save. */
interface Cut {
  blob: Blob
  /** The whole result, not just the mask maths: the refinement counts drive
   *  the "that background put up a fight" note. */
  analysis: CutoutResult
  /** Object URL of `blob`, for the hero-side preview. */
  url: string
}

interface PortraitStudioProps {
  /** A file dropped on the tile before the studio opened — starts the cut at once. */
  initialFile?: File | null
  onSaved?: () => void
}

/**
 * The photo editor: upload, cut the background out in the browser, drop the
 * person on a backdrop, and see the exact diamond the directory will show.
 *
 * Modelled on BannerStudio — tabbed source picker, live preview, a local draft,
 * nothing written until Save. The differences are all about the cut:
 *
 * - The cut runs on the member's own machine (MediaPipe, self-hosted) and can
 *   fail for a dozen honest reasons. Every failure lands on "keep the plain
 *   photo", with the reason shown; it never blocks the upload.
 * - The cut is a one-time cost per photo. Changing backdrop afterwards is a
 *   re-composite of the stored cut-out — ~300 ms and no model — and reverting
 *   to the untouched photo is a copy. Both work without re-uploading.
 * - `side` (where the head sits) is read off the mask and can be overridden
 *   here, because it decides where the member page puts their name.
 */
export function PortraitStudio({ initialFile, onSaved }: PortraitStudioProps) {
  const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()

  const saved = useMemo(() => parseAvatarStyle(auth.profile?.avatar_style), [auth.profile?.avatar_style])
  const [draft, setDraft] = useState<AvatarStyle>(saved)
  // The banner, for the plain-photo case ONLY. A cut-out derives its banner
  // from the backdrop it stands on (bannerFromAvatarStyle), so there is one
  // choice and no way to make the two disagree — but a member who keeps their
  // photo uncut stands on nothing, and without this their member page would
  // have no art behind them at all and no way to give it any.
  const savedBanner = useMemo(() => parseBanner(auth.profile?.banner), [auth.profile?.banner])
  const [bannerDraft, setBannerDraft] = useState<BannerSpec | null>(savedBanner)
  const [tab, setTab] = useState<Tab>(saved.kind === 'gradient' ? 'gradient' : saved.kind === 'backdrop' ? 'designs' : 'photo')
  const [file, setFile] = useState<File | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [cut, setCut] = useState<Cut | null>(null)
  const [cutError, setCutError] = useState<string | null>(null)
  const [cutting, setCutting] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [sideOverride, setSideOverride] = useState<SubjectSide | 'auto'>('auto')
  const [preview, setPreview] = useState<string | null>(null)

  const supported = cutoutSupported()
  const displayName = auth.profile?.display_name || t`You`

  // A saved cut-out survives across sessions; a fresh one wins while it exists.
  const cutoutUrl = cut?.url ?? (isCutoutStyle(saved) ? saved.cutout : null)
  const frame = cut?.analysis.frame ?? (isCutoutStyle(saved) ? saved.frame : null)
  const detectedSide: SubjectSide = cut?.analysis.side ?? (isCutoutStyle(saved) ? saved.side : 'center')
  const side: SubjectSide = sideOverride === 'auto' ? detectedSide : sideOverride
  const hasCutout = !!cutoutUrl && !!frame
  // A photo the remover had to work hard on: it threw away several stray
  // patches of background, or a big one. Both mean "look at the preview".
  const fought =
    !!cut &&
    (cut.analysis.strayPatches >= 3 ||
      cut.analysis.strayPixels > cut.analysis.width * cut.analysis.height * 0.005)

  // ---------------------------------------------------------------- files
  const takeFile = async (f: File) => {
    if (!f.type.startsWith('image/')) {
      toast.error(t`Please select an image file`)
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error(t`Image must be less than 5MB`)
      return
    }
    setFile(f)
    setFileUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
    setCut((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    setCutError(null)
    setSideOverride('auto')
    if (!supported) return
    // Cut straight away so the backdrops tab has something to show by the
    // time the member reaches it. The model download is the slow part, once.
    setCutting(true)
    try {
      const { cutOutPortrait } = await import('../../lib/portrait-cutout')
      const result = await cutOutPortrait(f, { onPhase: setPhase })
      setCut({ blob: result.cutout, analysis: result, url: URL.createObjectURL(result.cutout) })
      if (draft.kind === 'photo') setDraft(withCut({ kind: 'backdrop', id: AVATAR_BACKDROPS[0].id }, result.side, result.frame))
      if (tab === 'photo') setTab('designs')
    } catch (err) {
      setCutError(
        err instanceof CutoutUnavailableError
          ? err.message
          : t`The background could not be removed from that photo.`
      )
      setDraft(PHOTO_STYLE)
      setTab('photo')
    } finally {
      setCutting(false)
      setPhase('idle')
    }
  }

  useEffect(() => {
    if (initialFile) void takeFile(initialFile)
    // The tile hands the file over once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile])

  useEffect(
    () => () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl)
      if (cut) URL.revokeObjectURL(cut.url)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const { isDragging, dropProps } = useFileDrop({
    onFiles: (files) => void takeFile(files[0]),
    accept: IMAGE_ACCEPT,
    disabled: cutting || phase !== 'idle',
  })

  // -------------------------------------------------------------- draft
  function withCut(
    base: { kind: 'backdrop'; id: string } | { kind: 'gradient'; colors: string[]; seed?: number },
    s: SubjectSide,
    f: NonNullable<typeof frame>
  ): CutoutStyle {
    const cutoutRef = cut ? 'pending' : isCutoutStyle(saved) ? saved.cutout : 'pending'
    const animated = isCutoutStyle(draft) ? draft.animated : undefined
    const source = isCutoutStyle(saved) ? saved.source : undefined
    return { ...base, cutout: cutoutRef, side: s, frame: f, animated, source }
  }

  const chooseBackdrop = (id: string) => {
    if (!frame) return
    setDraft(withCut({ kind: 'backdrop', id }, side, frame))
  }
  const gradientDraft =
    draft.kind === 'gradient' ? draft : { colors: DEFAULT_AVATAR_GRADIENT, seed: 1 }
  const setGradient = (colors: string[], seed = gradientDraft.seed ?? 1) => {
    if (!frame) return
    setDraft(withCut({ kind: 'gradient', colors, seed }, side, frame))
  }
  const shuffle = () =>
    setGradient(gradientDraft.colors, ((gradientDraft.seed ?? 1) * 7 + Math.floor(Math.random() * 997)) % 100000)

  const setAnimated = (animated: boolean) =>
    setDraft((d) => (isCutoutStyle(d) ? { ...d, animated: animated || undefined } : d))

  // Keep the side on the draft in step with the override.
  useEffect(() => {
    setDraft((d) => (isCutoutStyle(d) && d.side !== side ? { ...d, side } : d))
  }, [side])

  const choosePhoto = () => {
    setDraft(PHOTO_STYLE)
    setTab('photo')
  }

  // ------------------------------------------------------------ preview
  // The real thing: composite the draft to a 512 square and show it in the
  // same DiamondAvatar the directory uses, at 96 and at 40 — a matte that
  // looks fine large can turn to mush in a directory row.
  const previewSeq = useRef(0)
  useEffect(() => {
    let cancelled = false
    const seq = ++previewSeq.current
    async function run() {
      if (!isCutoutStyle(draft) || !cutoutUrl) {
        setPreview(null)
        return
      }
      try {
        const blob = cut?.blob ?? (await (await fetch(cutoutUrl)).blob())
        const out = await compositeAvatar(blob, draft, { size: 256 })
        if (cancelled || seq !== previewSeq.current) return
        setPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return URL.createObjectURL(out)
        })
      } catch {
        if (!cancelled) setPreview(null)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [draft, cut, cutoutUrl])

  const previewSrc =
    draft.kind === 'photo' ? fileUrl ?? auth.profile?.avatar_url ?? null : preview ?? auth.profile?.avatar_url ?? null

  // --------------------------------------------------------------- save
  const dirty =
    !!file ||
    JSON.stringify(draft) !== JSON.stringify(saved) ||
    // Only counts on the plain photo: the cut-out kinds carry their banner in
    // the style, so a change there is already covered by the line above.
    (draft.kind === 'photo' && JSON.stringify(bannerDraft) !== JSON.stringify(savedBanner))
  const busy = cutting || phase !== 'idle'

  const handleSave = async () => {
    const uid = auth.user?.id
    if (!uid) return
    const keys = avatarKeys(uid)
    try {
      let avatarUrl: string | null = null
      let style: AvatarStyle = draft
      let sourceUrl = isCutoutStyle(saved) ? saved.source : undefined

      if (file) {
        // 1. The real photo, moderated. The only object that needs a verdict.
        setPhase('uploading')
        sourceUrl = await uploadOptimizedImage({
          bucket: 'avatars',
          basePath: keys.source,
          file,
          preset: IMAGE_PRESETS.AVATAR,
          onPhase: (p) => setPhase(p),
        })
      }

      if (isCutoutStyle(style)) {
        if (!frame) throw new Error(t`Upload a photo to cut out first.`)
        setPhase('composing')
        // 2. The cut-out: fresh from this session, or the one already stored.
        let cutoutUrl = style.cutout
        let cutBlob: Blob
        if (cut) {
          cutBlob = cut.blob
          const ext = cutBlob.type === 'image/png' ? 'png' : 'webp'
          cutoutUrl = await uploadOptimizedImage({
            bucket: 'avatars',
            basePath: keys.cutout,
            file: new File([cutBlob], `cutout.${ext}`, { type: cutBlob.type }),
            preset: IMAGE_PRESETS.PORTRAIT,
            // Derived from a source that was just cleared; a second vision call
            // on the same face is wasted money and a second chance to fail open.
            moderate: false,
          })
        } else {
          cutBlob = await (await fetch(cutoutUrl)).blob()
        }
        style = { ...style, cutout: cutoutUrl, side, frame, source: sourceUrl }
        // 3. The composite every avatar reads.
        const composite = await compositeAvatar(cutBlob, style)
        avatarUrl = await uploadOptimizedImage({
          bucket: 'avatars',
          basePath: keys.avatar,
          file: new File([composite], 'avatar.webp', { type: composite.type }),
          preset: IMAGE_PRESETS.AVATAR,
          moderate: false,
        })
      } else {
        // Plain photo. New file: upload it as the avatar (already cleared as
        // the source). No new file: copy the untouched source back.
        setPhase('composing')
        const plain = file ?? (sourceUrl ? await fetchAsFile(sourceUrl) : null)
        if (!plain) throw new Error(t`Upload a photo first.`)
        avatarUrl = await uploadOptimizedImage({
          bucket: 'avatars',
          basePath: keys.avatar,
          file: plain,
          preset: IMAGE_PRESETS.AVATAR,
          moderate: false,
        })
        style = PHOTO_STYLE
      }

      setPhase('saving')
      // The backdrop IS the banner (see bannerFromAvatarStyle): one choice,
      // written to both columns, so the art behind the member on their page,
      // their directory card, the drawer cover and their dashboard hero can
      // never disagree with the art baked into their avatar.
      await auth.updateProfile({
        avatar_url: avatarUrl,
        avatar_style: style,
        // A cut-out's banner IS the backdrop it stands on. A plain photo has no
        // backdrop, so it keeps a banner of its own — picked below the tabs.
        banner: isCutoutStyle(style) ? bannerFromAvatarStyle(style) : bannerDraft,
      } as any)
      toast.success(t`Photo updated!`)
      onSaved?.()
    } catch (err: any) {
      toast.error(err?.message || t`Failed to update photo`)
    } finally {
      setPhase('idle')
    }
  }

  // ---------------------------------------------------------------- UI
  const phaseLabel: Record<Exclude<Phase, 'idle'>, string> = {
    uploading: t`Uploading photo…`,
    checking: t`Checking photo…`,
    'loading-model': t`Loading the background remover — about 12 MB, once…`,
    cutting: t`Cutting out the background…`,
    refining: t`Cleaning up the edges…`,
    composing: t`Composing your avatar…`,
    saving: t`Saving…`,
  }

  const tabs: Array<[Tab, string, boolean]> = [
    ['photo', t`Photo`, true],
    ['designs', t`Backdrops`, hasCutout || cutting],
    ['gradient', t`Gradient`, hasCutout || cutting],
  ]

  return (
    <div>
      <p className="text-caption text-ktip-sand-600">
        <Trans>
          Your photo shows in the directory, on your member page and wherever you post. Cut the
          background out and it sits on a backdrop everywhere — and large on your member page.
        </Trans>
      </p>

      {/* Two columns from `sm` up: everything you touch on the left, what it
          will look like on the right. The preview is the point of this dialog,
          so it holds its own column rather than sitting under a fold. */}
      <div className="mt-5 grid gap-6 sm:grid-cols-[minmax(0,1fr)_15rem] lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0">
          {/* Drop zone / current photo */}
          <label
            {...dropProps}
            className={cn(
              'flex cursor-pointer items-center gap-4 rounded-surface border-2 border-dashed p-3.5 transition-colors',
              isDragging ? 'border-ktip-ocean-400 bg-ktip-ocean-50' : 'border-ktip-sand-300 bg-ktip-sand-50/50 hover:border-ktip-ocean-300',
              busy && 'pointer-events-none opacity-70'
            )}
          >
            <DiamondAvatar src={fileUrl ?? auth.profile?.avatar_url} name={displayName} size={56} />
            <div className="min-w-0 flex-1">
              <p className="text-label font-semibold text-ktip-sand-800">
                {isDragging ? t`Drop to upload` : file ? file.name : t`Click or drop a photo`}
              </p>
              <p className="mt-0.5 text-micro leading-relaxed text-ktip-sand-500">
                {supported ? (
                  <Trans>JPG, PNG or WebP, up to 5MB. The background is removed on your device — nothing is sent anywhere for it.</Trans>
                ) : (
                  <Trans>JPG, PNG or WebP, up to 5MB. This browser cannot remove backgrounds; the photo is used as it is.</Trans>
                )}
              </p>
            </div>
            <Upload size={18} className="shrink-0 text-ktip-sand-500" aria-hidden="true" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void takeFile(f)
              }}
            />
          </label>

          {(cutting || phase !== 'idle') && (
            <p className="mt-2.5 flex items-center gap-2 text-micro text-ktip-ocean-700" role="status">
              <Scissors size={13} className="animate-pulse-soft" aria-hidden="true" />
              {phase === 'idle' ? t`Cutting out the background…` : phaseLabel[phase]}
            </p>
          )}
          {cutError && (
            <p className="mt-2.5 text-micro text-ktip-sand-600" role="status">
              <Trans>Kept the plain photo:</Trans> {cutError}
            </p>
          )}
          {/* The one honest signal that a cut deserves a second look. A photo
              taken against a dark, busy or backlit background is where the
              remover struggles, and the number of stray patches it had to
              throw away is what says so — no quality score does. */}
          {fought && !cutting && (
            <p className="mt-2.5 text-micro leading-relaxed text-ktip-sand-600" role="status">
              <Trans>
                That background put up a fight — check the preview, and try a
                photo against a plainer wall if it does not look right.
              </Trans>
            </p>
          )}

          {/* Source tabs */}
          <div className="mt-5 flex flex-wrap gap-1.5">
            {tabs.map(([key, label, enabled]) => (
              <button
                key={key}
                type="button"
                disabled={!enabled}
                onClick={() => {
                  setTab(key)
                  if (key === 'photo') choosePhoto()
                  if (key === 'designs' && draft.kind !== 'backdrop') chooseBackdrop(AVATAR_BACKDROPS[0].id)
                  if (key === 'gradient' && draft.kind !== 'gradient') setGradient(gradientDraft.colors)
                }}
                className={cn(
                  'rounded-full border-2 px-4 py-1.5 text-label font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40',
                  tab === key
                    ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-700'
                    : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-ocean-300'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === 'photo' && (
              <>
                <p className="text-caption leading-relaxed text-ktip-sand-600">
                  {hasCutout ? (
                    <Trans>The photo exactly as you uploaded it, background and all. Pick Backdrops or Gradient to use the cut-out instead.</Trans>
                  ) : (
                    <Trans>The photo exactly as you uploaded it. Upload one and the background is cut out for you; then Backdrops and Gradient open up.</Trans>
                  )}
                </p>

                {/* The banner, only here. A cut-out gets one from the backdrop
                    it stands on; an uncut photo stands on nothing, so this is
                    the one place the choice has to be asked for separately. */}
                <fieldset className="mt-5 border-t border-ktip-sand-200 pt-4">
                  <legend className="sr-only">{t`Banner`}</legend>
                  <p className="mb-2 text-micro font-bold uppercase tracking-[0.14em] text-ktip-sand-500">
                    <Trans>Behind you on your member page</Trans>
                  </p>
                  <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5">
                    <button
                      type="button"
                      onClick={() => setBannerDraft(null)}
                      title={t`None`}
                      className={cn(
                        'relative flex aspect-square items-center justify-center overflow-hidden rounded-surface border-2 bg-ktip-sand-50 text-micro font-semibold text-ktip-sand-500 transition-all',
                        bannerDraft === null
                          ? 'border-ktip-ocean-500 ring-2 ring-ktip-ocean-500/30'
                          : 'border-ktip-sand-200 hover:border-ktip-ocean-300'
                      )}
                    >
                      <Trans>None</Trans>
                    </button>
                    {PRESET_BANNERS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBannerDraft({ kind: 'preset', id: b.id })}
                        title={b.name}
                        className={cn(
                          'relative aspect-square overflow-hidden rounded-surface border-2 transition-all',
                          bannerDraft?.kind === 'preset' && bannerDraft.id === b.id
                            ? 'border-ktip-ocean-500 ring-2 ring-ktip-ocean-500/30'
                            : 'border-transparent hover:border-ktip-ocean-300'
                        )}
                      >
                        <img src={b.url} alt={b.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-micro leading-relaxed text-ktip-sand-500">
                    <Trans>None uses your own photo, blurred. Cut your background out and this is chosen for you — you stand on it.</Trans>
                  </p>
                </fieldset>
              </>
            )}

            {tab === 'designs' && (
              <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5">
                {AVATAR_BACKDROPS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => chooseBackdrop(b.id)}
                    title={b.name}
                    className={cn(
                      'relative aspect-square overflow-hidden rounded-surface border-2 transition-all',
                      draft.kind === 'backdrop' && draft.id === b.id
                        ? 'border-ktip-ocean-500 ring-2 ring-ktip-ocean-500/30'
                        : 'border-transparent hover:border-ktip-ocean-300'
                    )}
                  >
                    <img src={b.url} alt={b.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
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
                        setGradient(next)
                      }}
                      className="h-9 w-12 cursor-pointer rounded-surface border border-ktip-sand-300 bg-transparent p-0.5"
                    />
                    {gradientDraft.colors.length > 2 && (
                      <button
                        type="button"
                        aria-label={t`Remove colour`}
                        onClick={() => setGradient(gradientDraft.colors.filter((_, j) => j !== i))}
                        className="text-micro text-ktip-sand-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                ))}
                {gradientDraft.colors.length < 4 && (
                  <Button variant="ghost" size="sm" onClick={() => setGradient([...gradientDraft.colors, '#FFC72C'])}>
                    <Trans>+ Colour</Trans>
                  </Button>
                )}
                <Button variant="outline" size="sm" icon={<Dices size={15} />} onClick={shuffle}>
                  <Trans>Shuffle placement</Trans>
                </Button>
              </div>
            )}
          </div>

          {/* Cut-out only controls. One per row: the side buttons and the
              moving-backdrop toggle each carry a sentence of explanation, and
              side by side in a dialog column those two sentences collided. */}
          {isCutoutStyle(draft) && hasCutout && (
            <div className="mt-6 grid gap-5 border-t border-ktip-sand-200 pt-5">
              <fieldset>
                <legend className="mb-2 text-micro font-bold uppercase tracking-[0.14em] text-ktip-sand-500">
                  <Trans>You sit on the</Trans>
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['auto', t`Auto`],
                      ['left', t`Left`],
                      ['center', t`Centre`],
                      ['right', t`Right`],
                    ] as Array<[SubjectSide | 'auto', string]>
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSideOverride(key)}
                      aria-pressed={sideOverride === key}
                      className={cn(
                        'rounded-control border px-3 py-1.5 text-label font-semibold transition-colors',
                        sideOverride === key
                          ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-700'
                          : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-ocean-300'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-micro leading-relaxed text-ktip-sand-500">
                  {sideOverride === 'auto' ? (
                    detectedSide === 'center' ? (
                      <Trans>Auto: you read as centred, so your member page splits the words either side of you.</Trans>
                    ) : detectedSide === 'left' ? (
                      <Trans>Auto: you read as sitting left, so your member page puts your name on the right.</Trans>
                    ) : (
                      <Trans>Auto: you read as sitting right, so your member page puts your name on the left.</Trans>
                    )
                  ) : (
                    <Trans>Your member page puts your name on the other side. Auto reads it from the photo.</Trans>
                  )}
                </p>
              </fieldset>

              <label className="flex items-start gap-2.5 text-caption text-ktip-sand-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-ktip-ocean-500"
                  checked={!!draft.animated}
                  onChange={(e) => setAnimated(e.target.checked)}
                />
                <span className="min-w-0">
                  <span className="font-semibold"><Trans>Moving backdrop</Trans></span>
                  <span className="mt-0.5 block text-micro leading-relaxed text-ktip-sand-500">
                    <Trans>On your member page the colours drift slowly behind you. Still everywhere else.</Trans>
                  </span>
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Live preview: the member page band, then the two avatar sizes that
            matter. A matte that looks fine large turns to mush in a row. */}
        <div className="grid content-start gap-3 rounded-surface-lg bg-ktip-sand-100 p-4 shadow-neu-sm-inset">
          <p className="text-micro font-bold uppercase tracking-[0.14em] text-ktip-sand-500">
            <Trans>Preview</Trans>
          </p>

          {isCutoutStyle(draft) && cutoutUrl && (
            <div>
              <div className="relative aspect-[4/3] overflow-hidden rounded-surface bg-brand-navy">
                {draft.kind === 'gradient' ? (
                  <BannerAurora spec={avatarGradientSpec(draft)} animated={!!draft.animated} />
                ) : (
                  <img
                    src={AVATAR_BACKDROPS.find((b) => b.id === draft.id)?.url}
                    alt=""
                    className={cn(
                      'absolute inset-0 h-full w-full object-cover',
                      draft.animated && 'animate-backdrop-drift'
                    )}
                  />
                )}
                {/* The scrim the real hero paints under its words. */}
                <span
                  className={cn(
                    'absolute inset-y-0 w-3/5',
                    side === 'left'
                      ? 'right-0 bg-gradient-to-l from-black/55 to-transparent'
                      : 'left-0 bg-gradient-to-r from-black/55 to-transparent'
                  )}
                />
                <img
                  src={cutoutUrl}
                  alt=""
                  className={cn(
                    'absolute bottom-0 h-[92%] w-auto object-contain object-bottom [mask-image:linear-gradient(to_bottom,#000_78%,transparent)]',
                    side === 'left' ? 'left-1' : side === 'right' ? 'right-1' : 'left-1/2 -translate-x-1/2'
                  )}
                />
                {/* Where the words go — the whole point of the side control. */}
                <span
                  className={cn(
                    'absolute bottom-3 space-y-1.5',
                    side === 'left' ? 'right-3 flex flex-col items-end' : 'left-3'
                  )}
                >
                  <span className="block h-1.5 w-8 rounded bg-white/45" />
                  <span className="block h-3 w-20 rounded bg-white/85" />
                  <span className="block h-1.5 w-14 rounded bg-white/45" />
                </span>
                {side === 'center' && (
                  <span className="absolute bottom-3 right-3 flex flex-col items-end space-y-1.5">
                    <span className="block h-1.5 w-10 rounded bg-white/45" />
                    <span className="block h-1.5 w-7 rounded bg-white/45" />
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-center text-micro text-ktip-sand-500">
                <Trans>Your member page</Trans>
              </p>
            </div>
          )}

          {/* The plain photo's band. Same mock, different construction: the
              diamond sits ON the banner rather than being cut out of it, and
              with no banner the hero falls back to the photo itself, blurred. */}
          {draft.kind === 'photo' && previewSrc && (
            <div>
              <div className="relative aspect-[4/3] overflow-hidden rounded-surface bg-brand-navy">
                {bannerDraft?.kind === 'gradient' ? (
                  <BannerAurora spec={bannerDraft} />
                ) : bannerImage(bannerDraft) ? (
                  <img
                    src={bannerImage(bannerDraft) ?? undefined}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={previewSrc}
                    alt=""
                    className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 [filter:blur(14px)_saturate(1.15)_brightness(0.55)]"
                  />
                )}
                <span className="absolute inset-y-0 left-0 w-3/5 bg-gradient-to-r from-black/55 to-transparent" />
                {/* Where the real band puts it: to the right, sitting on the
                    bottom edge rather than centred, with the gradient rim. The
                    preview is only worth having if it is placed the same. */}
                <span className="absolute bottom-[12%] right-[6%] block h-[58%] aspect-square">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-[3%] bg-[linear-gradient(160deg,rgba(255,255,255,0.55),rgba(255,255,255,0.08)_45%,rgba(151,215,0,0.5))] [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]"
                  >
                    <span className="absolute inset-[3%] bg-hero-base [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]" />
                  </span>
                  <img
                    src={previewSrc}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]"
                  />
                </span>
                <span className="absolute bottom-3 left-3 space-y-1.5">
                  <span className="block h-1.5 w-8 rounded bg-white/45" />
                  <span className="block h-3 w-20 rounded bg-white/85" />
                  <span className="block h-1.5 w-14 rounded bg-white/45" />
                </span>
              </div>
              <p className="mt-1.5 text-center text-micro text-ktip-sand-500">
                <Trans>Your member page</Trans>
              </p>
            </div>
          )}

          <div>
            <div className="flex items-end justify-center gap-5 rounded-surface bg-ktip-cream py-4">
              <DiamondAvatar src={previewSrc} name={displayName} size={96} />
              <DiamondAvatar src={previewSrc} name={displayName} size={40} />
            </div>
            <p className="mt-1.5 text-center text-micro text-ktip-sand-500">
              <Trans>Your page · a directory row</Trans>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-ktip-sand-200 pt-4">
        {isCutoutStyle(saved) && draft.kind !== 'photo' && (
          <Button variant="ghost" size="sm" icon={<RotateCcw size={15} />} onClick={choosePhoto} disabled={busy}>
            <Trans>Use the plain photo</Trans>
          </Button>
        )}
        <Button size="sm" icon={<Save size={15} />} onClick={handleSave} loading={phase !== 'idle'} disabled={!dirty || busy}>
          <Trans>Save photo</Trans>
        </Button>
      </div>
    </div>
  )
}

async function fetchAsFile(url: string): Promise<File> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not read the stored photo (${res.status})`)
  const blob = await res.blob()
  const ext = blob.type.split('/')[1] || 'webp'
  return new File([blob], `avatar.${ext}`, { type: blob.type })
}

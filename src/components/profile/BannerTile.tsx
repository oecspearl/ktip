import { useState } from 'react'
import { ImagePlus, Pencil } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { useAuth } from '../../contexts/AuthContext'
import { bannerImage, bannerPosition, isGradientBanner, parseBanner } from '../../lib/banner'
import { BannerAurora } from './BannerAurora'
import { BannerStudio } from './BannerStudio'
import { cn } from '../../lib/utils'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * The banner, collapsed to a strip you can click.
 *
 * BannerStudio is a big thing — three source tabs, a ten-design gallery, a
 * colour picker and four live surface previews — and it sat permanently open
 * in the middle of the profile form, pushing every field below it off the
 * screen. It is also the one control here you touch once and then leave alone
 * for months, so it was paying full rent for almost no use.
 *
 * So the page keeps a strip showing the banner you actually have, and the
 * editor opens over the tab in a dialog when you ask for it. Nothing about the
 * editor changes; it just stops being always-on.
 */
export function BannerTile({ className }: { className?: string }) {
  const { t } = useLingui()
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const banner = parseBanner(auth.profile?.banner)
  const image = bannerImage(banner)

  return (
    <>
      {/* Carries the scroll-spy marker that used to live on the studio's own
          Card — see the Shell note in BannerStudio. */}
      <Card
        id="banner"
        data-spy="Banner"
        padding="sm"
        className={cn('scroll-mt-24', className)}
      >
        <div className="flex flex-wrap items-center gap-4">
          {/* The strip is the preview. A named swatch would describe the
              banner; this one just is it. */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t`Banner`}
            className="group relative h-16 w-40 shrink-0 overflow-hidden rounded-control bg-ktip-sand-100 shadow-neu-sm-inset transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500"
          >
            {isGradientBanner(banner) ? (
              <BannerAurora spec={banner} animated={false} />
            ) : image ? (
              <img
                src={image}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: bannerPosition(banner, 'card') }}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-ktip-sand-400">
                <ImagePlus size={20} aria-hidden="true" />
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-brand-navy/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Pencil size={16} aria-hidden="true" />
            </span>
          </button>

          {/* No blurb here on purpose: the strip already shows what the banner
              is, and the sentence explaining where it appears lives in the
              editor, next to the previews it describes. */}
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-body font-bold text-ktip-sand-900">
              <Trans>Banner</Trans>
            </h2>
          </div>

          <Button
            variant="outline"
            size="sm"
            icon={<Pencil size={14} />}
            onClick={() => setOpen(true)}
          >
            <Trans>Edit</Trans>
          </Button>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="xl"
        title={t`Banner`}
      >
        {/* Saving closes the sheet — the strip behind it is already the
            confirmation, so a dialog that stays open after a successful save
            just has to be dismissed a second time. */}
        <BannerStudio bare onSaved={() => setOpen(false)} />
      </Modal>
    </>
  )
}

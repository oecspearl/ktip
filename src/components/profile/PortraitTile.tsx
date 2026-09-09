import { useState } from 'react'
import { Camera, Pencil } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { TileHead } from '../ui/TileHead'
import { DiamondAvatar } from '../ui/DiamondAvatar'
import { useAuth } from '../../contexts/AuthContext'
import { useFileDrop } from '../../hooks/useFileDrop'
import { isCutoutStyle, parseAvatarStyle } from '../../lib/avatar-backdrop'
import { PortraitStudio } from './PortraitStudio'
import { cn } from '../../lib/utils'

const IMAGE_ACCEPT = ['image/*'] as const

/**
 * The photo, collapsed to the tile the settings grid had before — but the
 * click, and a dropped file, now open the Portrait Studio instead of uploading
 * straight away. Same reasoning as BannerTile: the editor is big and touched
 * rarely, so it lives in a dialog.
 */
export function PortraitTile({ className }: { className?: string }) {
  const { t } = useLingui()
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const [initialFile, setInitialFile] = useState<File | null>(null)
  const style = parseAvatarStyle(auth.profile?.avatar_style)
  const displayName = auth.profile?.display_name || t`You`

  const openWith = (file: File | null) => {
    setInitialFile(file)
    setOpen(true)
  }

  const { isDragging, dropProps } = useFileDrop({
    onFiles: (files) => openWith(files[0]),
    accept: IMAGE_ACCEPT,
    disabled: open,
  })

  return (
    <>
      <Card id="photo" data-spy="Photo" padding="sm" className={cn(className)}>
        <TileHead icon={<Camera size={16} />} title={<Trans>Profile Photo</Trans>} />
        <div className="flex items-center gap-4" {...dropProps}>
          <button
            type="button"
            onClick={() => openWith(null)}
            aria-label={t`Edit profile photo`}
            className="shrink-0 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ktip-ocean-500"
          >
            <DiamondAvatar
              src={auth.profile?.avatar_url}
              name={displayName}
              size={64}
              frameClassName={isDragging ? 'ring-2 ring-ktip-ocean-400 ring-offset-2' : undefined}
              overlay={<Pencil size={18} className="text-white" />}
            />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ktip-sand-700">
              {isDragging
                ? t`Drop to open the photo studio`
                : isCutoutStyle(style)
                  ? t`Cut out, on a backdrop`
                  : t`Plain photo`}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ktip-sand-500">
              <Trans>Upload a photo, remove its background on your device, and choose what sits behind you.</Trans>
            </p>
          </div>
          <Button variant="outline" size="sm" icon={<Pencil size={14} />} onClick={() => openWith(null)}>
            <Trans>Edit</Trans>
          </Button>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} size="2xl" title={t`Profile photo`}>
        <PortraitStudio initialFile={initialFile} onSaved={() => setOpen(false)} />
      </Modal>
    </>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { TrophyCard } from './TrophyCard'
import { FireworksOverlay } from './FireworksOverlay'
import { resolveTrophy } from './TrophyImage'
import { useAchievementContext } from '../../contexts/AchievementContext'
import { Trans, useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'

/** How long to wait for trophy art before falling back to the icon card. */
const IMAGE_TIMEOUT_MS = 2000

/**
 * Renders the head of the unlock queue, one at a time.
 *
 * Mounted once near the root so an unlock can surface from anywhere in the app
 * without every page wiring up its own modal.
 */
export function AchievementUnlockModal() {
    const { t } = useLingui()
  const { pendingUnlocks, dismissUnlock, assetMap } = useAchievementContext()
  const navigate = useNavigate()
  const unlock = pendingUnlocks[0]

  // 'pending' blocks rendering entirely. Showing the card first and letting the
  // image pop in produces a visibly empty trophy slot on a slow connection,
  // which is worse than a brief delay before a celebration.
  const [imageState, setImageState] = useState<'pending' | 'ready' | 'failed'>('pending')

  useEffect(() => {
    if (!unlock) return

    setImageState('pending')

    const { url } = resolveTrophy(assetMap, unlock.trophy_type, unlock.tier, unlock.image_url)
    if (!url) {
      // No artwork uploaded for this trophy yet: go straight to the icon card.
      setImageState('failed')
      return
    }

    let settled = false
    const settle = (state: 'ready' | 'failed') => {
      if (settled) return
      settled = true
      setImageState(state)
    }

    const probe = new Image()
    probe.onload = () => settle('ready')
    probe.onerror = () => settle('failed')
    probe.src = url

    // A hung request must not hold the popup forever.
    const timer = setTimeout(() => settle('failed'), IMAGE_TIMEOUT_MS)

    return () => {
      clearTimeout(timer)
      probe.onload = null
      probe.onerror = null
    }
  }, [unlock, assetMap])

  if (!unlock || imageState === 'pending') return null

  return (
    <Modal
      open
      onClose={dismissUnlock}
      title={t`Achievement unlocked`}
      description={
        pendingUnlocks.length > 1
          ? plural(pendingUnlocks.length - 1, { one: '# more to reveal', other: '# more to reveal' })
          : undefined
      }
      size="sm"
    >
      <div className="relative flex flex-col items-center gap-5 py-2">
        <FireworksOverlay runKey={unlock.slug} />

        <div className="relative z-10 w-full">
          <TrophyCard
            name={unlock.name}
            description={unlock.description}
            icon={unlock.icon}
            rarity={unlock.rarity}
            tier={unlock.tier}
            trophyType={unlock.trophy_type}
            // When the probe failed, drop the URL so TrophyCard renders the
            // icon path rather than retrying a broken image inside the popup.
            imageUrl={imageState === 'ready' ? unlock.image_url : null}
            points={unlock.points}
            assetMap={imageState === 'ready' ? assetMap : {}}
            size="lg"
          />
        </div>

        <div className="relative z-10 flex w-full gap-2">
          <Button variant="secondary" className="flex-1" onClick={dismissUnlock}>
            {pendingUnlocks.length > 1 ? t`Next` : t`Nice`}
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              dismissUnlock()
              navigate('/achievements')
            }}
          >
            <Trans>View all</Trans>
          </Button>
        </div>
      </div>
    </Modal>
  )
}

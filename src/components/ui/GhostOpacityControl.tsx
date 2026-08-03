import { useSyncExternalStore } from 'react'
import {
  GHOST_MIN_OPACITY,
  getGhostPrefs,
  setGhostPrefs,
  subscribeGhostPrefs,
} from '../../lib/ghost-mode'
import { Toggle } from './Toggle'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * The one place ghost mode is configured. One preference shared by the
 * messaging panel and every sticky note, so it is offered from wherever the
 * person happens to be looking rather than buried in settings.
 */
export function GhostOpacityControl({ className }: { className?: string }) {
  const { t } = useLingui()
  const prefs = useSyncExternalStore(subscribeGhostPrefs, getGhostPrefs, getGhostPrefs)
  const percent = Math.round(prefs.opacity * 100)

  return (
    <div className={className}>
      <Toggle
        checked={prefs.enabled}
        onChange={(enabled) => setGhostPrefs({ enabled })}
        label={t`Fade when pinned`}
        description={t`Pinned windows go see-through and let clicks pass through`}
      />
      <label className={prefs.enabled ? 'block' : 'block opacity-50'}>
        <span className="flex items-center justify-between text-xs text-ktip-sand-600">
          <Trans>Faded opacity</Trans>
          <span className="font-mono tabular-nums text-ktip-sand-500">{percent}%</span>
        </span>
        <input
          type="range"
          min={GHOST_MIN_OPACITY * 100}
          max={100}
          step={5}
          value={percent}
          disabled={!prefs.enabled}
          aria-label={t`Faded opacity`}
          // Committed on every input rather than on release: the surfaces
          // being described are on screen while the slider moves, so the
          // preview is the control.
          onChange={(e) => setGhostPrefs({ opacity: Number(e.target.value) / 100 })}
          className="mt-1 w-full accent-ktip-ocean-500"
        />
      </label>
    </div>
  )
}

import { ShieldAlert } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import type { WarningState } from '../../hooks/useContentModeration'

interface ContentWarningModalProps {
  /** null closes it. Comes straight from useContentModeration().warning */
  state: WarningState | null
  onClose: () => void
}

/**
 * What the member is told when the filter objects to their draft.
 *
 * Three things it deliberately does not do:
 *   * It never names the rule or the pattern. That is an evasion tutorial.
 *   * It never mentions suspension. moderate_content() auto-suspends on a
 *     high-severity match, and telling someone that invites them to find the
 *     boundary. If it happens, the safety team sends that message, not a form.
 *   * It has no "don't show this again". The hook already acknowledges each
 *     flagged word individually, which is the useful version of that; a global
 *     suppression would defeat the point of the feature.
 */
export function ContentWarningModal({ state, onClose }: ContentWarningModalProps) {
  const { t } = useLingui()
  if (!state) return null

  const hard = state.severity !== 'low'
  const title = hard ? t`This can't be posted` : t`Check your wording`

  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div
          role="alertdialog"
          aria-live="assertive"
          className={
            hard
              ? 'flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3'
              : 'flex items-start gap-2.5 rounded-xl border border-ktip-sun-200 bg-ktip-sun-50 p-3'
          }
        >
          <ShieldAlert
            size={16}
            className={hard ? 'mt-0.5 flex-shrink-0 text-red-600' : 'mt-0.5 flex-shrink-0 text-ktip-sun-700'}
          />
          <div className={hard ? 'text-xs text-red-800' : 'text-xs text-ktip-sun-800'}>
            {state.reason === 'submit' && (
              <p className="mb-1 font-semibold">
                <Trans>Submission stopped.</Trans>
              </p>
            )}
            {state.reason === 'ai' && state.message ? (
              <p>{state.message}</p>
            ) : hard ? (
              <p>
                <Trans>
                  The highlighted text breaks the community guidelines, so this can't be submitted
                  until it's removed.
                </Trans>
              </p>
            ) : (
              <p>
                <Trans>
                  Part of what you've written matches our community guidelines filter and is struck
                  through in the field. You can still post this, but please take a look first.
                </Trans>
              </p>
            )}
          </div>
        </div>

        {state.fieldLabels.length > 0 && (
          <p className="text-caption text-ktip-sand-600">
            <Trans>Affected: {state.fieldLabels.join(', ')}</Trans>
          </p>
        )}

        <div className="flex items-center gap-3">
          {state.onRemoveAll && (
            <Button
              onClick={() => {
                state.onRemoveAll?.()
                onClose()
              }}
            >
              <Trans>Remove it</Trans>
            </Button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-ktip-sand-500 transition-colors hover:text-ktip-sand-700"
          >
            {hard ? t`Close` : t`Post anyway`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default ContentWarningModal

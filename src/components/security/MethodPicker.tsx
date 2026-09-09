import type { ReactNode } from 'react'
import { Mail, Smartphone } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../lib/utils'
import type { MfaMethod } from '../../types'

/**
 * "How do you want to get your code?" — the first step of set-up (150).
 *
 * Two cards, one chosen. The authenticator app is marked recommended because
 * it is the stronger of the two and works offline; the email code is there so
 * that a member with no smartphone, or no wish to install anything, is not
 * turned away at the door. Both are stated in plain words, because the people
 * this exists for are the ones the word "authenticator" has already lost.
 */
export function MethodPicker({
  value,
  onChange,
}: {
  value: MfaMethod | null
  onChange: (method: MfaMethod) => void
}) {
  const { t } = useLingui()
  return (
    <div role="radiogroup" aria-label={t`How to get your code`} className="grid gap-3 sm:grid-cols-2">
      <MethodCard
        selected={value === 'totp'}
        onSelect={() => onChange('totp')}
        icon={<Smartphone size={22} />}
        title={<Trans>Authenticator app</Trans>}
        badge={<Trans>Recommended</Trans>}
        description={
          <Trans>
            A free app on your phone or computer shows a new code every 30 seconds. Works
            offline, and a stolen password is not enough to get in.
          </Trans>
        }
      />
      <MethodCard
        selected={value === 'email'}
        onSelect={() => onChange('email')}
        icon={<Mail size={22} />}
        title={<Trans>Email code</Trans>}
        description={
          <Trans>
            We email you a 6-digit code. Nothing to install. You enter one the first time you
            sign in on a new device, and again every 30 days.
          </Trans>
        }
      />
    </div>
  )
}

function MethodCard({
  selected,
  onSelect,
  icon,
  title,
  badge,
  description,
}: {
  selected: boolean
  onSelect: () => void
  icon: ReactNode
  title: ReactNode
  badge?: ReactNode
  description: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-w-0 flex-col items-start gap-2 rounded-xl border-2 p-4 text-left',
        'transition-[border-color,background-color,box-shadow] duration-200',
        selected
          ? 'border-ktip-ocean-500 bg-ktip-ocean-50 shadow-sm'
          : 'border-ktip-sand-200 hover:border-ktip-ocean-300 hover:bg-ktip-sand-50/60',
      )}
    >
      <span className="flex w-full items-center gap-2">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            selected ? 'bg-ktip-ocean-100 text-ktip-ocean-700' : 'bg-ktip-sand-100 text-ktip-sand-600',
          )}
        >
          {icon}
        </span>
        <span className="text-body font-semibold text-ktip-sand-900">{title}</span>
        {badge && (
          <span className="ml-auto rounded-full bg-ktip-tropical-100 px-2 py-0.5 text-micro font-bold uppercase tracking-wide text-ktip-tropical-800">
            {badge}
          </span>
        )}
      </span>
      <span className="text-body-sm text-ktip-sand-600">{description}</span>
    </button>
  )
}

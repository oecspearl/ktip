import { useRef } from 'react'
import { ShieldCheck } from 'lucide-react'
import { SELECTABLE_ROLES } from '../../lib/constants'
import { cn } from '../../lib/utils'
import { Trans, useLingui } from '@lingui/react/macro'
import { resolveCopy } from '../../i18n/copy'
import { useDisclosureAnimation } from '../../components/ui/useDisclosureAnimation'
import { useFlipChildren } from '../../components/ui/useFlipChildren'

type SelectableRole = (typeof SELECTABLE_ROLES)[number]

/**
 * Shared "I am..." role grid used by the signup and onboarding wizards.
 *
 * Thirteen roles is too many to read as thirteen paragraphs, so a card shows
 * only its name until it is chosen, and opens to its description on selection.
 * Only one is ever open — the one you picked — which is the only one whose
 * description you still need.
 *
 * The cards sit on a two-column grid rather than wrapping to their own widths.
 * Equal cells are what make thirteen of them scan as a list instead of a word
 * cloud, and they give the chosen card somewhere definite to grow to: the full
 * row. Everything around it slides, and the card itself widens, through
 * useFlipChildren; the description folds open through `.disclosure-collapse`.
 *
 * No per-card badge. Gated roles — the ones a reviewer grants rather than the
 * member choosing them — used to carry a shield, but it sat on nine of the
 * thirteen cards and read as decoration rather than as a distinction. The note
 * under the grid says the same thing once, for every role. Selecting a gated
 * role still routes into verification rather than writing the role: a school
 * for student and faculty, a KTIP administrator for the organisations.
 */
export function RolePicker({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const { t } = useLingui()

  const groups = [
    {
      key: 'individual',
      heading: t`Joining as an individual`,
      roles: SELECTABLE_ROLES.filter((r) => r.group === 'individual'),
    },
    {
      key: 'organization',
      heading: t`Joining for an organisation`,
      roles: SELECTABLE_ROLES.filter((r) => r.group === 'organization'),
    },
  ]

  return (
    <div>
      <label className="block text-sm font-medium text-ktip-sand-700 mb-2">
        <Trans>I am...</Trans> <span className="text-red-500">*</span>
      </label>

      <div className="space-y-4">
        {groups.map((group) => (
          <RoleGroup
            key={group.key}
            heading={group.heading}
            roles={group.roles}
            value={value}
            onChange={onChange}
          />
        ))}
      </div>

      <p className="mt-3 flex items-start gap-2 rounded-xl border border-ktip-ocean-100 bg-ktip-ocean-50/60 px-3 py-2.5 text-sm font-semibold text-ktip-ocean-800">
        <ShieldCheck size={16} className="mt-0.5 flex-shrink-0 text-ktip-ocean-600" aria-hidden="true" />
        <span>
          <Trans>Every role is verified before an account gets full access to KTIP.</Trans>
        </span>
      </p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}

function RoleGroup({
  heading,
  roles,
  value,
  onChange,
}: {
  heading: string
  roles: readonly SelectableRole[]
  value: string
  onChange: (value: string) => void
}) {
  const list = useRef<HTMLDivElement>(null)

  // Choosing a role spans one card across the row and shifts the rest into
  // different cells. Without this they would jump there between paints.
  useFlipChildren(list, value)

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ktip-sand-500">
        {heading}
      </p>
      <div
        ref={list}
        role="radiogroup"
        aria-label={heading}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {roles.map((role) => (
          <RoleCard
            key={role.value}
            role={role}
            selected={value === role.value}
            onSelect={() => onChange(role.value)}
          />
        ))}
      </div>
    </div>
  )
}

function RoleCard({
  role,
  selected,
  onSelect,
}: {
  role: SelectableRole
  selected: boolean
  onSelect: () => void
}) {
  const { i18n } = useLingui()
  const detail = useDisclosureAnimation(selected, { keepMounted: true })

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-expanded={selected}
      data-flip-key={role.value}
      onClick={onSelect}
      className={cn(
        'min-w-0 rounded-xl border-2 px-3 py-2.5 text-left',
        'transition-[border-color,background-color,box-shadow] duration-200',
        selected
          ? 'sm:col-span-2 border-ktip-ocean-500 bg-ktip-ocean-50 shadow-sm'
          : 'border-ktip-sand-200 hover:border-ktip-ocean-300 hover:bg-ktip-sand-50/60'
      )}
    >
      <span className="block truncate text-sm font-medium text-ktip-sand-900">
        {resolveCopy(i18n, role.label)}
      </span>

      {/* The fold animates height from content; the paragraph inside fades and
          rises with it so the text arrives rather than being uncovered. */}
      <div className="disclosure-collapse" data-state={detail.state} data-settled={detail.settled}>
        <div>
          <p
            className={cn(
              'mt-1 text-xs text-ktip-sand-600 transition-[opacity,transform] duration-200 ease-out',
              selected ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'
            )}
          >
            {resolveCopy(i18n, role.description)}
          </p>
        </div>
      </div>
    </button>
  )
}

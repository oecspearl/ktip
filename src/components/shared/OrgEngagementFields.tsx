import { Trans, useLingui } from '@lingui/react/macro'

export interface EmployerOption {
  id: string
  label: string
}

interface OrgEngagementFieldsProps {
  /** Organisations the author may publish on behalf of. Empty hides the block. */
  options: EmployerOption[]
  employerId: string | null
  onEmployerChange: (employerId: string | null) => void
  /** NULL inherits the organisation's master switch; TRUE/FALSE override it. */
  override: boolean | null
  onOverrideChange: (override: boolean | null) => void
  /** What is being published — "project", "grant", "event". Already translated. */
  itemNoun: string
}

/**
 * The organisation block on every create/edit form (migration 111).
 *
 * Two settings that only make sense together: which organisation is publishing
 * this, and whether that organisation's own people may take part in it.
 *
 * The second is a radio group rather than a switch because it has three states
 * and NULL is not FALSE — inheriting the organisation's setting is the default
 * and has to stay distinguishable from deliberately closing the item. A switch
 * can only say two of the three.
 *
 * Hidden entirely for authors who manage no organisation, which is almost
 * everyone; the database refuses an override with no employer_id anyway.
 */
export function OrgEngagementFields({
  options,
  employerId,
  onEmployerChange,
  override,
  onOverrideChange,
  itemNoun,
}: OrgEngagementFieldsProps) {
  const { t } = useLingui()

  if (options.length === 0) return null

  const choices: { value: boolean | null; label: string; hint: string }[] = [
    {
      value: null,
      label: t`Follow our organisation setting`,
      hint: t`Whatever the Team page says applies here too.`,
    },
    {
      value: true,
      label: t`Open to our team`,
      hint: t`Our people can take part even if the organisation setting is off.`,
    },
    {
      value: false,
      label: t`Closed to our team`,
      hint: t`Our people cannot take part — for when they would be judging it.`,
    },
  ]

  return (
    <div className="rounded-xl border border-ktip-sand-200 bg-ktip-sand-50 p-4">
      <label className="mb-1 block text-sm font-medium text-ktip-sand-700">
        <Trans>Publishing organisation</Trans>
      </label>
      <select
        value={employerId ?? ''}
        onChange={(e) => {
          const next = e.target.value || null
          onEmployerChange(next)
          // An override with no organisation binds nobody, and the database
          // has a CHECK constraint that refuses the pair outright.
          if (!next) onOverrideChange(null)
        }}
        className="w-full rounded-lg border border-ktip-sand-200 bg-white px-3 py-2 text-sm text-ktip-sand-800"
      >
        <option value="">{t`Just me — not on behalf of an organisation`}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      {employerId && (
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-ktip-sand-700">
            {t`Can our own team take part in this ${itemNoun}?`}
          </legend>
          <div className="space-y-2">
            {choices.map((choice) => (
              <label key={String(choice.value)} className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="allow_member_engagement"
                  checked={override === choice.value}
                  onChange={() => onOverrideChange(choice.value)}
                  className="mt-1 h-4 w-4 accent-ktip-tropical-500"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-ktip-sand-800">{choice.label}</span>
                  <span className="block text-xs text-ktip-sand-500">{choice.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  )
}

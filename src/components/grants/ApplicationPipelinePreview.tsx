import { ChevronDown } from 'lucide-react'
import { GRANT_APPLICATION_STEPS } from '../../lib/grant-application-template'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * What applicants are asked, shown to the funder while they post the call.
 *
 * The feedback that prompted this said the application side shows "the entire
 * application pipeline" with no matching setup on the funder side. Most of
 * that pipeline is fixed — the six wizard steps are a shared template, not
 * per-call configuration — so the honest fix is to say so here rather than
 * leave a funder guessing what their applicants will fill in. The one part
 * that IS theirs to set, the documents checklist, sits directly below this in
 * both forms.
 */
export function ApplicationPipelinePreview() {
  const { i18n } = useLingui()

  return (
    <details className="group border border-ktip-sand-200 rounded-xl bg-ktip-cream/60">
      <summary className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer list-none">
        <span className="text-sm font-medium text-ktip-sand-700">
          <Trans>What applicants will be asked</Trans>
        </span>
        <ChevronDown
          size={16}
          className="text-ktip-sand-400 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="px-3 pb-3 space-y-3">
        <p className="text-xs text-ktip-sand-500">
          <Trans>
            Every call on the platform uses the same application form, so applications can be
            compared side by side. The supporting documents below are the part you set yourself.
          </Trans>
        </p>

        <ol className="space-y-2">
          {GRANT_APPLICATION_STEPS.map((step, index) => (
            <li key={index} className="flex gap-2.5">
              <span className="shrink-0 w-5 h-5 mt-0.5 rounded-full bg-ktip-ocean-100 text-ktip-ocean-700 text-[11px] font-semibold flex items-center justify-center">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-ktip-sand-800">{i18n._(step.title)}</p>
                <p className="text-xs text-ktip-sand-500">
                  {step.fields.map((field) => i18n._(field.label)).join(' · ')}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </details>
  )
}

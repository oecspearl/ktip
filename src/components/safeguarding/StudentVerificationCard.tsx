import { BadgeCheck, Clock, GraduationCap, ShieldCheck } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useMyStudentRecord, useRequestStudentVerification } from '../../hooks/useInstitutions'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * School verification for students.
 *
 * The account's own email domain is the evidence — there is nothing to upload.
 * Requesting only queues the account with whichever verified institution owns
 * that domain; an educator there approves it, and that approval is what grants
 * the student role.
 */
export function StudentVerificationCard() {
    const { t } = useLingui()
  const auth = useAuth()
  const toast = useToast()

  const { record, loading, refetch } = useMyStudentRecord(auth.user?.id)
  const { requestVerification, loading: requesting } = useRequestStudentVerification()

  const isStudent = (auth.profile?.roles || []).includes('student')

  const handleRequest = async () => {
    try {
      await requestVerification()
      toast.success(t`Request sent to your institution for approval`)
      refetch()
    } catch (err: any) {
      toast.error(err.message || t`Could not request verification`)
    }
  }

  if (loading) return null

  // Nothing to show for accounts with no student relationship at all.
  if (!record && !isStudent) {
    return (
      <Card className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap size={18} className="text-ktip-ocean-600" />
          <h2 className="text-lg font-display font-bold text-ktip-sand-900"><Trans>Student verification</Trans></h2>
        </div>
        <p className="text-sm text-ktip-sand-600 mb-4">
          <Trans>If you are studying at a partner school or university, verify with your institutional email address to unlock student features. Your school approves the request.</Trans>
        </p>
        <Button size="sm" loading={requesting} onClick={handleRequest}>
          <Trans>Verify with my school email</Trans>
        </Button>
      </Card>
    )
  }

  return (
    <Card className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <GraduationCap size={18} className="text-ktip-ocean-600" />
        <h2 className="text-lg font-display font-bold text-ktip-sand-900"><Trans>Student verification</Trans></h2>
      </div>

      <div
        className={`flex items-start gap-3 p-4 rounded-xl border mt-3 ${
          isStudent
            ? 'bg-ktip-tropical-50 border-ktip-tropical-200 text-ktip-tropical-800'
            : 'bg-ktip-sun-50 border-ktip-sun-200 text-ktip-sun-800'
        }`}
      >
        {isStudent ? (
          <BadgeCheck size={20} className="mt-0.5 flex-shrink-0" />
        ) : (
          <Clock size={20} className="mt-0.5 flex-shrink-0" />
        )}
        <div>
          <p className="font-medium">
            {isStudent ? t`Verified student` : t`Awaiting approval from your institution`}
          </p>
          <p className="text-sm mt-1">
            {record?.institution?.name
              ? `${record.institution.name}${record.verified_domain ? ` · @${record.verified_domain}` : ''}`
              : t`Your request is with the institution that owns your email domain.`}
          </p>
        </div>
      </div>

      {isStudent && (
        <div className="mt-4 flex items-start gap-2.5 p-3 rounded-xl bg-ktip-sand-50 border border-ktip-sand-200">
          <ShieldCheck size={16} className="text-ktip-tropical-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-ktip-sand-700">
            <Trans>Student accounts have safeguards that cannot be turned off: direct messages are limited to supervised group channels with a designated educator, and grant applications must be sponsored by a faculty member.</Trans>
          </p>
        </div>
      )}

      {/* The "add your year of birth" form that used to live here is gone (091).
          Every account declares a date of birth at signup, and birth_year is now
          a projection of that rather than a second value typed in separately —
          two age records that can disagree is not a thing to have when the
          disagreement decides whether someone is treated as a child. */}
      {record?.birth_year != null && (
        <div className="mt-4 pt-4 border-t border-ktip-sand-100">
          <p className="text-xs text-ktip-sand-600">
            <Trans>Your institution's designated staff can see the year you were born, taken from the date of birth on your account. They see the year only — never the full date. To correct it, contact support.</Trans>
          </p>
        </div>
      )}
    </Card>
  )
}

export default StudentVerificationCard

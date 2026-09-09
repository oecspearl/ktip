import { BadgeCheck, Clock, GraduationCap, ShieldCheck } from 'lucide-react'
import { Card } from '../ui/Card'
import { useAuth } from '../../contexts/AuthContext'
import { useMyStudentRecord } from '../../hooks/useInstitutions'
import { Trans, useLingui } from '@lingui/react/macro'

/**
 * School verification status, for accounts that have one.
 *
 * The account's own email domain is the evidence — there is nothing to upload.
 * Since 145 the request itself is made from InstitutionalEmailCard (one button
 * for every track); this card only reports where a student stands. It renders
 * nothing for an account with no student relationship, which is every
 * entrepreneur, investor and admin — the old "verify with my school email"
 * pitch used to show to all of them.
 */
export function StudentVerificationCard() {
    const { t } = useLingui()
  const auth = useAuth()

  const { record, loading } = useMyStudentRecord(auth.user?.id)

  const isStudent = (auth.profile?.roles || []).includes('student')

  if (loading) return null

  // Nothing to show for accounts with no student relationship at all.
  if (!record && !isStudent) return null

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
            <Trans>Student accounts have safeguards that cannot be turned off: direct messages are limited to supervised group channels with a designated educator, and awarded funds are administered by your institution rather than by you.</Trans>
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

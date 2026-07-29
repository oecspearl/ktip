import { useState } from 'react'
import { BadgeCheck, Clock, GraduationCap, ShieldCheck } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useMyStudentRecord, useRequestStudentVerification } from '../../hooks/useInstitutions'
import { supabase } from '../../lib/supabase'

/**
 * School verification for students.
 *
 * The account's own email domain is the evidence — there is nothing to upload.
 * Requesting only queues the account with whichever verified institution owns
 * that domain; an educator there approves it, and that approval is what grants
 * the student role.
 */
export function StudentVerificationCard() {
  const auth = useAuth()
  const toast = useToast()

  const { record, loading, refetch } = useMyStudentRecord(auth.user?.id)
  const { requestVerification, loading: requesting } = useRequestStudentVerification()

  const [birthYear, setBirthYear] = useState<string>('')
  const [savingYear, setSavingYear] = useState(false)

  const isStudent = (auth.profile?.roles || []).includes('student')

  const handleRequest = async () => {
    try {
      await requestVerification()
      toast.success('Request sent to your institution for approval')
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Could not request verification')
    }
  }

  // Year only — enough to decide minor status without holding a child's full
  // date of birth. Stored on the safeguarding record, not the public profile.
  const handleSaveBirthYear = async () => {
    const year = Number(birthYear)
    if (!year || year < 1900 || year > new Date().getFullYear()) {
      toast.error('Enter a valid year of birth')
      return
    }

    setSavingYear(true)
    try {
      const { error } = await (supabase as any)
        .from('student_safeguarding')
        .update({ birth_year: year })
        .eq('user_id', auth.user!.id)

      if (error) throw error
      toast.success('Saved')
      setBirthYear('')
      refetch()
    } catch (err: any) {
      toast.error(err.message || 'Could not save')
    } finally {
      setSavingYear(false)
    }
  }

  if (loading) return null

  // Nothing to show for accounts with no student relationship at all.
  if (!record && !isStudent) {
    return (
      <Card className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap size={18} className="text-ktip-ocean-600" />
          <h2 className="text-lg font-display font-bold text-ktip-sand-900">Student verification</h2>
        </div>
        <p className="text-sm text-ktip-sand-600 mb-4">
          If you are studying at a partner school or university, verify with your institutional email
          address to unlock student features. Your school approves the request.
        </p>
        <Button size="sm" loading={requesting} onClick={handleRequest}>
          Verify with my school email
        </Button>
      </Card>
    )
  }

  return (
    <Card className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <GraduationCap size={18} className="text-ktip-ocean-600" />
        <h2 className="text-lg font-display font-bold text-ktip-sand-900">Student verification</h2>
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
            {isStudent ? 'Verified student' : 'Awaiting approval from your institution'}
          </p>
          <p className="text-sm mt-1">
            {record?.institution?.name
              ? `${record.institution.name}${record.verified_domain ? ` · @${record.verified_domain}` : ''}`
              : 'Your request is with the institution that owns your email domain.'}
          </p>
        </div>
      </div>

      {isStudent && (
        <div className="mt-4 flex items-start gap-2.5 p-3 rounded-xl bg-ktip-sand-50 border border-ktip-sand-200">
          <ShieldCheck size={16} className="text-ktip-tropical-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-ktip-sand-700">
            Student accounts have safeguards that cannot be turned off: direct messages are limited to
            supervised group channels with a designated educator, and grant applications must be
            sponsored by a faculty member.
          </p>
        </div>
      )}

      {record && record.birth_year == null && (
        <div className="mt-4 pt-4 border-t border-ktip-sand-100">
          <p className="text-sm text-ktip-sand-600 mb-2">
            Add your year of birth so we can apply the right protections for your age. We store the
            year only — never a full date of birth.
          </p>
          <div className="flex items-end gap-3">
            <Input
              type="number"
              label="Year of birth"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              placeholder="2008"
            />
            <Button size="sm" loading={savingYear} onClick={handleSaveBirthYear}>
              Save
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export default StudentVerificationCard

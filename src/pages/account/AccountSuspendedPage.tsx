import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, LogOut } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { AuthSplitShell } from '../../components/auth/AuthSplitShell'
import { RouteSplash } from '../../components/RouteSplash'
import { Button } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Textarea'
import { useCreateFeedback } from '../../hooks/useFeedback'
import { usePageTitle } from '../../hooks/usePageTitle'
import { supabase } from '../../lib/supabase'
import { isSuspendedNow, SUSPENDED_PATH } from '../../lib/suspension'
import { formatDate } from '../../lib/utils'

interface AccountNote {
  id: string
  body: string
  created_at: string
}

/**
 * Notes an administrator addressed to this account (admin_notes, 182). The
 * table may not be deployed yet, and a suspended account may not be able to
 * read it; either way the page shows the reason alone rather than an error.
 */
function useAccountNotes(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin-notes', 'account', userId],
    queryFn: async (): Promise<AccountNote[]> => {
      const { data, error } = await (supabase as any)
        .from('admin_notes')
        .select('id, body, created_at')
        .eq('target_type', 'account')
        .eq('target_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) return []
      return (data as AccountNote[]) ?? []
    },
    enabled: !!userId,
    retry: false,
  })
}

/**
 * Where a suspended session is held (184). MainLayout and ProtectedRoute send
 * every other path here except /legal/*. Bare, outside MainLayout, so it guards
 * itself the way the /security pages do.
 */
export default function AccountSuspendedPage() {
  const { t } = useLingui()
  usePageTitle(t`Account suspended`)
  const auth = useAuth()
  const toast = useToast()
  const location = useLocation()
  const { data: notes } = useAccountNotes(auth.user?.id)
  const { createFeedback, loading: sending } = useCreateFeedback()
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  if (auth.loading || auth.profileLoading || auth.mfaChallengeLoading) {
    return <RouteSplash />
  }

  if (!auth.user) {
    return <Navigate to="/login" replace />
  }

  // The second factor is owed before anything about the account is shown.
  if (auth.mfaChallengeRequired) {
    return <Navigate to="/security/verify" replace state={{ from: location }} />
  }

  // Lifted, or its end date passed while the tab was open.
  if (!isSuspendedNow(auth.suspension)) {
    return <Navigate to="/" replace />
  }

  const reason = auth.suspension?.reason?.trim() || null
  const until = auth.suspension?.until ?? null

  const sendAppeal = async () => {
    const body = message.trim()
    if (!body || !auth.user) return
    try {
      await createFeedback({
        user_id: auth.user.id,
        category: 'appeal',
        subject: t`Appeal against account suspension`,
        message: body,
        page_path: SUSPENDED_PATH,
      })
      setSent(true)
      setMessage('')
    } catch {
      toast.error(t`Your appeal could not be sent. Try again.`)
    }
  }

  const steps = [{ title: t`Suspended`, caption: t`You can still read our policies and ask us to look again.` }]

  return (
    <AuthSplitShell step={1} steps={steps} heading={t`Your account is suspended`} heroOffset={3}>
      <div className="space-y-6">
        <p className="text-body-sm text-ktip-sand-700">
          <Trans>While it is suspended you can't post, message or change anything on KTIP.</Trans>
        </p>

        <dl className="space-y-3 rounded-xl border border-ktip-sand-200 bg-ktip-sand-50 p-4 text-sm">
          <div>
            <dt className="font-semibold text-ktip-sand-900"><Trans>Reason</Trans></dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-ktip-sand-700">
              {reason ?? <Trans>No reason was recorded.</Trans>}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ktip-sand-900"><Trans>Ends</Trans></dt>
            <dd className="mt-0.5 text-ktip-sand-700">
              {until ? formatDate(until, 'PPP p') : <Trans>Until further notice</Trans>}
            </dd>
          </div>
        </dl>

        {notes && notes.length > 0 && (
          <section aria-labelledby="suspension-notes" className="space-y-2">
            <h2 id="suspension-notes" className="text-sm font-semibold text-ktip-sand-900">
              <Trans>Notes from KTIP</Trans>
            </h2>
            <ul className="space-y-2">
              {notes.map((note) => (
                <li key={note.id} className="rounded-xl border border-ktip-sand-200 px-4 py-3">
                  <p className="whitespace-pre-wrap text-sm text-ktip-sand-700">{note.body}</p>
                  <p className="mt-1 text-caption text-ktip-sand-500">{formatDate(note.created_at, 'PP')}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="suspension-appeal" className="space-y-3">
          <h2 id="suspension-appeal" className="text-sm font-semibold text-ktip-sand-900">
            <Trans>Ask us to review this</Trans>
          </h2>
          {sent ? (
            <p role="status" className="flex items-start gap-2 text-sm text-ktip-tropical-800">
              <CheckCircle2 size={16} aria-hidden className="mt-0.5 shrink-0" />
              <Trans>Appeal sent. An administrator will review it.</Trans>
            </p>
          ) : (
            <>
              <Textarea
                label={t`What should we know?`}
                helperText={t`Say what happened and why the suspension should be lifted.`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={4000}
                fullWidth
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={sendAppeal} loading={sending} disabled={!message.trim()}>
                  <Trans>Send appeal</Trans>
                </Button>
              </div>
            </>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ktip-sand-200 pt-4 text-body-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/legal/acceptable-use" className="text-ktip-ocean-700 hover:underline">
              <Trans>Acceptable Use Policy</Trans>
            </Link>
            <Link to="/legal/terms" className="text-ktip-ocean-700 hover:underline">
              <Trans>Terms of Use</Trans>
            </Link>
          </div>
          <Button variant="ghost" size="sm" icon={<LogOut size={16} />} onClick={() => void auth.signOut()}>
            <Trans>Sign out</Trans>
          </Button>
        </div>
      </div>
    </AuthSplitShell>
  )
}

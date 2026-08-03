import { lazy, Suspense } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { useLingui } from '@lingui/react/macro'

const TimelineSection = lazy(() => import('../../../components/dashboard/TimelineSection'))

export default function ProgressTab() {
    const { t } = useLingui()
  usePageTitle(t`My Progress`)
  const auth = useAuth()

  if (!auth.user) return null

  return (
    <Suspense
      fallback={
        <div className="bg-ktip-cream rounded-2xl shadow-card border border-ktip-sand-100 h-48 animate-pulse-soft" />
      }
    >
      <TimelineSection userId={auth.user.id} />
    </Suspense>
  )
}

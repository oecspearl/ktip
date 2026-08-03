import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { clearSupabaseSession } from '../lib/auth-utils'
import { RefreshCw, LogOut, AlertTriangle } from 'lucide-react'
import { cn } from '../lib/utils'
import { Trans } from '@lingui/react/macro'

export function SessionRecoveryBanner() {
  const auth = useAuth()
  const [retrying, setRetrying] = useState(false)

  const handleRetry = () => {
    setRetrying(true)
    window.location.reload()
  }

  const handleSignOut = () => {
    // Force clear everything — don't rely on Supabase client (it may be stuck)
    clearSupabaseSession()
    auth.signOut().finally(() => {
      window.location.href = '/login'
    })
  }

  return (
    <div className="bg-ktip-sun-50 border-b border-ktip-sun-200 px-4 py-3">
      <div className="container mx-auto flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-ktip-sun-800 text-sm">
          <AlertTriangle size={16} className="shrink-0" />
          <span><Trans>Your session may have expired. Profile data couldn't be loaded.</Trans></span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-ktip-sun-700 bg-ktip-sun-100 hover:bg-ktip-sun-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(retrying && 'animate-spin')} />
            Reload
          </button>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

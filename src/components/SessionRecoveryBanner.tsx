import { createSignal } from 'solid-js'
import { useAuth } from '../contexts/AuthContext'
import { clearSupabaseSession } from '../lib/auth-utils'
import { RefreshCw, LogOut, AlertTriangle } from 'lucide-solid'

export function SessionRecoveryBanner() {
  const auth = useAuth()
  const [retrying, setRetrying] = createSignal(false)

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
    <div class="bg-amber-50 border-b border-amber-200 px-4 py-3">
      <div class="container mx-auto flex items-center justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-2 text-amber-800 text-sm">
          <AlertTriangle size={16} class="shrink-0" />
          <span>
            Your session may have expired. Profile data couldn't be loaded.
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            onClick={handleRetry}
            disabled={retrying()}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} class={retrying() ? 'animate-spin' : ''} />
            Reload
          </button>
          <button
            onClick={handleSignOut}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

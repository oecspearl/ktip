import { useAuth } from '../contexts/AuthContext'
import { Navigate } from '@solidjs/router'
import { Show, type ParentComponent } from 'solid-js'
import { ShieldX } from 'lucide-solid'

export const AdminRoute: ParentComponent = (props) => {
  const auth = useAuth()
  const isAdmin = () => auth.profile()?.roles?.includes('oecs')

  return (
    <Show
      when={!auth.loading()}
      fallback={
        <div class="min-h-screen flex items-center justify-center bg-ktip-canvas">
          <div class="text-center">
            <img src="/ktiplogo.png" alt="KTIP Logo" class="w-12 h-12 rounded-xl shadow-soft mx-auto animate-pulse-soft" />
            <p class="mt-4 text-ktip-sand-600">Loading...</p>
          </div>
        </div>
      }
    >
      <Show when={auth.user()} fallback={<Navigate href="/login" />}>
        <Show
          when={isAdmin()}
          fallback={
            <div class="min-h-screen flex items-center justify-center bg-ktip-canvas">
              <div class="text-center max-w-md mx-auto px-4">
                <div class="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <ShieldX size={32} class="text-red-500" />
                </div>
                <h1 class="text-2xl font-bold font-display text-ktip-sand-900 mb-2">Access Denied</h1>
                <p class="text-ktip-sand-600">
                  This area is restricted to OECS administrators. If you believe you should have access, please contact your organization.
                </p>
              </div>
            </div>
          }
        >
          {props.children}
        </Show>
      </Show>
    </Show>
  )
}

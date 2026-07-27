import { useAuth } from '../contexts/AuthContext'
import { Navigate } from '@solidjs/router'
import { Show, type ParentComponent } from 'solid-js'

export const ProtectedRoute: ParentComponent = (props) => {
  const auth = useAuth()

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
        {props.children}
      </Show>
    </Show>
  )
}

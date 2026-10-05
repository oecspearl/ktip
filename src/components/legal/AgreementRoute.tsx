import { useState, type CSSProperties } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { RouteSplash } from '../RouteSplash'
import { useAgreementGate, type ConsentContext } from '../../hooks/useAgreementGate'
import { AgreementGateModal } from './AgreementGate'
import { AgreementBanner, NOTICE_BAR_H, type PageGatedBundle } from './AgreementBanner'

interface AgreementRouteProps {
  bundle: PageGatedBundle
  context: ConsentContext
  /** Where "Go back" lands when the page was opened directly, with no history. */
  leaveTo: string
}

/**
 * Route guard that shows the IP notice every time a create or edit page opens.
 *
 * Unlike the submit-time gate, this ignores whether the member has already
 * agreed: the notice is asked for on every visit, so the pages that publish
 * under a licence say so before anything is typed, not only at the end. The
 * acceptance is still recorded through record_consent, and for a version the
 * member has already accepted that call is a no-op (ON CONFLICT DO NOTHING in
 * 115), so repeat visits add nothing to the consent register.
 *
 * The page itself is not rendered until the member agrees. Showing the form
 * under the dialog would let its own mount effects run, and /projects/new
 * starts a tutorial on mount that sits above every modal.
 *
 * Nested inside PermissionRoute in App.tsx, so a member without the permission
 * is told that first rather than asked to agree to terms for a page they then
 * cannot use.
 */
export function AgreementRoute({ bundle, context, leaveTo }: AgreementRouteProps) {
  const gate = useAgreementGate(bundle)
  const location = useLocation()
  const navigate = useNavigate()
  // Keyed by path rather than a boolean, so moving between two pages under the
  // same guard (/grants/a/edit to /grants/b/edit) asks again. Leaving the
  // guard altogether unmounts it, which resets this too.
  const [agreedOn, setAgreedOn] = useState<string | null>(null)

  if (gate.loading) return <RouteSplash />

  if (agreedOn !== location.pathname) {
    const leave = () => {
      // 'default' is the key of the first entry React Router saw: the page
      // was opened directly, so going back would leave the site.
      if (location.key !== 'default') navigate(-1)
      else navigate(leaveTo, { replace: true })
    }

    return (
      <>
        <div aria-hidden className="min-h-[60svh] bg-ktip-canvas" />
        <AgreementGateModal
          gate={gate}
          bundle={bundle}
          open
          mode="entry"
          context={context}
          onClose={leave}
          onAccepted={() => setAgreedOn(location.pathname)}
        />
      </>
    )
  }

  return (
    <div style={{ '--notice-h': NOTICE_BAR_H } as CSSProperties}>
      <AgreementBanner bundle={bundle} />
      <Outlet />
    </div>
  )
}

export default AgreementRoute

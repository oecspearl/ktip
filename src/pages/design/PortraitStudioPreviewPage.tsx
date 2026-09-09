import { PortraitStudio } from '../../components/profile/PortraitStudio'
import { PortraitTile } from '../../components/profile/PortraitTile'

/**
 * Portrait Studio harness — dev only, never routed in a production build.
 *
 * The studio is a dialog on the settings page, which is behind sign-in and,
 * for an admin, behind the MFA step-up, so its layout cannot be screenshotted
 * headlessly. This renders the same component inside a box the width of the
 * real dialog (Modal `2xl` — 48rem), plus the settings tile that opens it.
 *
 * Signed out there is no profile and no saved style, so the drop zone shows
 * its empty state and the cut-out controls stay closed — which is exactly the
 * state a member sees before they upload, and the one whose spacing is
 * hardest to get right.
 */
export default function PortraitStudioPreviewPage() {
  return (
    <div className="min-h-svh bg-ktip-sand-50 px-6 py-10">
      <div className="mx-auto grid max-w-[48rem] gap-8">
        <div>
          <p className="mb-2 text-micro font-bold uppercase tracking-[0.16em] text-ktip-sand-500">
            The settings tile
          </p>
          <PortraitTile />
        </div>

        <div>
          <p className="mb-2 text-micro font-bold uppercase tracking-[0.16em] text-ktip-sand-500">
            The dialog, at its real width
          </p>
          {/* The Modal's own chrome, restated: the panel fill, the header rule
              and the content padding, so the measurements here are the ones a
              member sees. */}
          <div className="neu-surface rounded-surface-lg bg-ktip-cream shadow-hard">
            <div className="border-b border-ktip-sand-100 p-card-pad">
              <h2 className="font-display text-title font-bold text-ktip-sand-900">Profile photo</h2>
            </div>
            <div className="p-card-pad">
              <PortraitStudio />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

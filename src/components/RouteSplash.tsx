/**
 * Full-page loading state shared by the route guards. Extracted so a guard that
 * has to wait on more than one thing (session, then profile) does not carry two
 * copies of the same markup.
 */
export const RouteSplash = () => (
  <div className="min-h-screen flex items-center justify-center bg-ktip-canvas">
    <div className="text-center">
      <img
        src="/KTIP%20LOGO.png"
        alt="KTIP Logo"
        className="w-12 h-12 object-contain mx-auto animate-pulse-soft"
      />
      <p className="mt-4 text-ktip-sand-600">Loading...</p>
    </div>
  </div>
)

export default RouteSplash

import { useState } from 'react'
import { Video, VideoOff, ExternalLink } from 'lucide-react'

interface JitsiVideoCallProps {
  roomName: string
  displayName?: string
  domain?: string
}

/**
 * Branding note — why the Jitsi watermark is still visible.
 *
 * `meet.jit.si` is Jitsi's free public deployment and it IGNORES the
 * `interfaceConfig.*` and most `config.*` overrides passed in the URL hash;
 * they are enforced server-side (which is also why the pre-join screen still
 * appears despite `prejoinPageEnabled=false`). Their terms require the
 * attribution to stay, so the watermark cannot be removed there.
 *
 * The overrides below DO take effect on a deployment you control:
 *   - JaaS (8x8): set VITE_JITSI_DOMAIN="8x8.vc" and
 *     VITE_JITSI_APP_ID="vpaas-magic-cookie-…" — free tier covers small teams.
 *   - Self-hosted Jitsi Meet: set VITE_JITSI_DOMAIN to your host.
 *
 * Until one of those is configured we brand the frame around the call instead,
 * which is ours to style regardless of the deployment.
 */

const DEFAULT_JITSI_DOMAIN = 'meet.jit.si'
const KTIP_LOGO_PATH = '/ktip-logo-nobg.webp'

const configuredDomain = (import.meta.env.VITE_JITSI_DOMAIN as string | undefined)?.trim()
const jaasAppId = (import.meta.env.VITE_JITSI_APP_ID as string | undefined)?.trim()

/** True once the app points at a deployment whose branding we control. */
export const jitsiBrandingAvailable = !!configuredDomain && configuredDomain !== DEFAULT_JITSI_DOMAIN

function buildJitsiUrl(domain: string, roomName: string, displayName: string): string {
  // Jitsi needs an absolute URL for logo overrides — a relative path resolves
  // against the Jitsi host, not ours.
  const logoUrl = `${window.location.origin}${KTIP_LOGO_PATH}`

  const config = [
    'config.prejoinPageEnabled=false',
    'config.startWithAudioMuted=true',
    'config.startWithVideoMuted=false',
    'config.disableDeepLinking=true',
    'config.enableLobbyChat=false',
    'config.hideLobbyButton=true',
    'config.requireDisplayName=false',
    'config.enableInsecureRoomNameWarning=false',
    'config.notifications=[]',
    'interfaceConfig.SHOW_JITSI_WATERMARK=false',
    'interfaceConfig.SHOW_WATERMARK_FOR_GUESTS=false',
    'interfaceConfig.SHOW_POWERED_BY=false',
    'interfaceConfig.DISABLE_JOIN_LEAVE_NOTIFICATIONS=true',
    // Honoured on JaaS / self-hosted; ignored by meet.jit.si.
    'interfaceConfig.SHOW_BRAND_WATERMARK=true',
    `interfaceConfig.BRAND_WATERMARK_LINK="${encodeURIComponent(window.location.origin)}"`,
    `interfaceConfig.DEFAULT_LOGO_URL="${encodeURIComponent(logoUrl)}"`,
    `interfaceConfig.DEFAULT_WELCOME_PAGE_LOGO_URL="${encodeURIComponent(logoUrl)}"`,
    'interfaceConfig.APP_NAME="KTIP"',
    'interfaceConfig.NATIVE_APP_NAME="KTIP"',
    'interfaceConfig.PROVIDER_NAME="KTIP"',
    `userInfo.displayName="${encodeURIComponent(displayName)}"`,
  ]

  // JaaS namespaces every room under the tenant's app id.
  const path = jaasAppId
    ? `${jaasAppId}/${encodeURIComponent(roomName)}`
    : encodeURIComponent(roomName)

  return `https://${domain}/${path}#${config.join('&')}`
}

export function JitsiVideoCall({ roomName, displayName, domain }: JitsiVideoCallProps) {
  const [status, setStatus] = useState<'idle' | 'joined'>('idle')

  const jitsiDomain = domain || configuredDomain || DEFAULT_JITSI_DOMAIN
  const jitsiDisplayName = displayName || 'KTIP User'

  const joinCall = () => {
    if (!roomName.trim()) return
    setStatus('joined')
  }

  const leaveCall = () => {
    setStatus('idle')
  }

  const jitsiUrl = buildJitsiUrl(jitsiDomain, roomName.trim(), jitsiDisplayName)

  return (
    <div className="w-full">
      {status === 'idle' && (
        <div className="flex flex-col items-center justify-center py-16 bg-ktip-sand-50 rounded-2xl border border-ktip-sand-200">
          <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mb-4">
            <VideoOff size={28} className="text-ktip-sand-400" />
          </div>
          <p className="text-ktip-sand-600 font-medium mb-1">No active call</p>
          <p className="text-sm text-ktip-sand-400 mb-6">Enter a room name or create one, then click Join</p>
          <button
            type="button"
            onClick={joinCall}
            disabled={!roomName.trim()}
            className="inline-flex items-center gap-2 px-6 py-2.5 btn-brand rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Video size={18} />
            Join Video Call
          </button>
        </div>
      )}

      {status === 'joined' && (
        <div className="rounded-xl border border-ktip-sand-200 overflow-hidden bg-ktip-cream">
          {/* KTIP-branded call chrome. The iframe below is cross-origin, so
              this bar is the branding we can control on any deployment. */}
          <div className="flex items-center justify-between gap-3 px-3 py-2 bg-ktip-sand-50 border-b border-ktip-sand-200">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={KTIP_LOGO_PATH}
                alt=""
                className="w-7 h-7 object-contain shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ktip-sand-900 leading-tight">
                  KTIP Video
                </p>
                <p className="text-xs text-ktip-sand-500 truncate">{roomName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={jitsiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium text-ktip-sand-600 hover:bg-ktip-sand-100 hover:text-ktip-sand-900 transition-colors"
              >
                <ExternalLink size={14} />
                <span className="hidden sm:inline">Open in new tab</span>
              </a>
              <button
                type="button"
                onClick={leaveCall}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-md text-sm font-medium transition-colors"
              >
                <VideoOff size={14} />
                Leave Call
              </button>
            </div>
          </div>

          {/* Bare feature names delegate to the frame's own src origin, so this
              follows VITE_JITSI_DOMAIN automatically. It can only narrow what
              the top-level page already holds — the Permissions-Policy header
              in vercel.json must list the Jitsi origin too, or the browser
              denies camera/mic without ever prompting the user. */}
          <iframe
            src={jitsiUrl}
            allow="camera; microphone; display-capture; screen-wake-lock; autoplay; clipboard-write"
            className="w-full block"
            style={{ height: 'calc(100svh - 22rem)', border: 'none' }}
            title={`Video call: ${roomName}`}
          />
        </div>
      )}
    </div>
  )
}

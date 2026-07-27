import { useState } from 'react'
import { Video, VideoOff, ExternalLink } from 'lucide-react'

interface JitsiVideoCallProps {
  roomName: string
  displayName?: string
  domain?: string
}

const DEFAULT_JITSI_DOMAIN = 'meet.jit.si'

function buildJitsiUrl(domain: string, roomName: string, displayName: string): string {
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
    'interfaceConfig.DISABLE_JOIN_LEAVE_NOTIFICATIONS=true',
    `userInfo.displayName="${encodeURIComponent(displayName)}"`,
  ]
  return `https://${domain}/${encodeURIComponent(roomName)}#${config.join('&')}`
}

export function JitsiVideoCall({ roomName, displayName, domain }: JitsiVideoCallProps) {
  const [status, setStatus] = useState<'idle' | 'joined'>('idle')

  const jitsiDomain = domain || DEFAULT_JITSI_DOMAIN
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
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-ktip-ocean-600 hover:bg-ktip-ocean-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Video size={18} />
            Join Video Call
          </button>
        </div>
      )}

      {status === 'joined' && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <a
              href={jitsiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-ktip-ocean-600 hover:text-ktip-ocean-700 hover:bg-ktip-ocean-50 rounded-lg text-sm font-medium transition-colors"
            >
              <ExternalLink size={16} />
              Open in new tab
            </a>
            <button
              type="button"
              onClick={leaveCall}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
            >
              <VideoOff size={16} />
              Leave Call
            </button>
          </div>

          <iframe
            src={jitsiUrl}
            allow="camera; microphone; display-capture; autoplay; clipboard-write"
            className="w-full rounded-xl border border-ktip-sand-200"
            style={{ height: 'calc(100vh - 20rem)' }}
          />
        </>
      )}
    </div>
  )
}

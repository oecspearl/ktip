import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Mic } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import { Button } from '../../ui/Button'

type CheckId = 'camera' | 'mic' | 'screen'
type CheckState = 'todo' | 'testing' | 'ok' | 'failed'

const stopAll = (stream: MediaStream | null) => stream?.getTracks().forEach((track) => track.stop())

/**
 * "Before you go on": a speaker tries their camera, microphone and screen share
 * here, before the stage does it for them in front of everybody.
 *
 * Each test asks the browser for the device, shows that it works, and lets go
 * of it again. Nothing is sent anywhere and nothing joins the call; the room's
 * own call keeps its own devices. The fourth check, subtitles, is the panel
 * under this one.
 */
export function SetupChecksPanel() {
  const { t } = useLingui()
  const [state, setState] = useState<Record<CheckId, CheckState>>({ camera: 'todo', mic: 'todo', screen: 'todo' })
  const [level, setLevel] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  const camera = useRef<MediaStream | null>(null)
  const mic = useRef<{ stream: MediaStream; context: AudioContext; frame: number } | null>(null)
  const set = (id: CheckId, next: CheckState) => setState((current) => ({ ...current, [id]: next }))

  const stopCamera = useCallback(() => {
    stopAll(camera.current)
    camera.current = null
    if (video.current) video.current.srcObject = null
  }, [])
  const stopMic = useCallback(() => {
    const current = mic.current
    if (!current) return
    mic.current = null
    window.cancelAnimationFrame(current.frame)
    stopAll(current.stream)
    void current.context.close().catch(() => undefined)
    setLevel(0)
  }, [])
  // Leaving the room lets go of every device.
  useEffect(
    () => () => {
      stopCamera()
      stopMic()
    },
    [stopCamera, stopMic]
  )

  const testCamera = async () => {
    if (camera.current) {
      stopCamera()
      set('camera', 'ok')
      return
    }
    set('camera', 'testing')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      camera.current = stream
      if (video.current) video.current.srcObject = stream
    } catch {
      set('camera', 'failed')
    }
  }

  const testMic = async () => {
    if (mic.current) {
      stopMic()
      return
    }
    set('mic', 'testing')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      context.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const entry = { stream, context, frame: 0 }
      mic.current = entry
      const read = () => {
        analyser.getByteTimeDomainData(data)
        let peak = 0
        for (const value of data) peak = Math.max(peak, Math.abs(value - 128))
        const heard = Math.min(100, Math.round((peak / 64) * 100))
        setLevel(heard)
        // Speech, not room hum: one clear peak is enough to pass.
        if (heard > 35) setState((current) => (current.mic === 'ok' ? current : { ...current, mic: 'ok' }))
        entry.frame = window.requestAnimationFrame(read)
      }
      read()
    } catch {
      set('mic', 'failed')
    }
  }

  const testScreen = async () => {
    set('screen', 'testing')
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      stopAll(stream)
      set('screen', 'ok')
    } catch {
      set('screen', 'failed')
    }
  }

  const cameraLive = state.camera === 'testing'
  const micLive = state.mic === 'testing' || (state.mic === 'ok' && !!mic.current)
  const canShare = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia

  const failedNote = t`The browser did not allow it. Check the site's permissions and try again.`

  return (
    <section className="overflow-hidden rounded-surface border border-ktip-sand-100 bg-ktip-cream shadow-card" aria-label={t`Before you go on`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ktip-sand-100 px-4 py-3">
        <Mic size={20} className="shrink-0 text-ktip-sand-600" aria-hidden="true" />
        <h2 className="text-sm font-extrabold text-ktip-sand-900">
          <Trans>Before you go on</Trans>
        </h2>
        <span className="text-xs text-ktip-sand-500">
          <Trans>These tests stay on this device</Trans>
        </span>
      </header>

      <ul className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <CheckTile
          state={state.camera}
          title={t`Camera`}
          hint={t`Front-lit, framed from the chest up`}
          failed={failedNote}
          action={
            <Button size="sm" variant="secondary" onClick={testCamera}>
              {cameraLive ? <Trans>Looks good</Trans> : state.camera === 'ok' ? <Trans>Test again</Trans> : <Trans>Test camera</Trans>}
            </Button>
          }
        >
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            className={cn('aspect-video w-full -scale-x-100 rounded-control bg-ktip-ink object-cover', !cameraLive && 'hidden')}
          />
        </CheckTile>

        <CheckTile
          state={state.mic}
          title={t`Microphone`}
          hint={t`Say a few words. The bar should move.`}
          failed={failedNote}
          action={
            <Button size="sm" variant="secondary" onClick={testMic}>
              {micLive ? <Trans>Stop</Trans> : state.mic === 'ok' ? <Trans>Test again</Trans> : <Trans>Test microphone</Trans>}
            </Button>
          }
        >
          {micLive && (
            <span className="block h-2 w-full overflow-hidden rounded-full bg-ktip-sand-100" role="meter" aria-label={t`Microphone level`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}>
              <span className="block h-full rounded-full bg-ktip-tropical-600 transition-[width] duration-75" style={{ width: `${level}%` }} />
            </span>
          )}
        </CheckTile>

        <CheckTile
          state={state.screen}
          title={t`Screen share`}
          hint={canShare ? t`Share once here to test it. Nobody sees it.` : t`This browser cannot share a screen. Use a laptop to present.`}
          failed={t`Sharing was cancelled or blocked. Try again and pick a window.`}
          action={
            canShare ? (
              <Button size="sm" variant="secondary" onClick={testScreen} loading={state.screen === 'testing'}>
                {state.screen === 'ok' ? <Trans>Test again</Trans> : <Trans>Test screen share</Trans>}
              </Button>
            ) : null
          }
        />
      </ul>
    </section>
  )
}

function CheckTile({
  state,
  title,
  hint,
  failed,
  action,
  children,
}: {
  state: CheckState
  title: string
  hint: string
  failed: string
  action: ReactNode
  children?: ReactNode
}) {
  const { t } = useLingui()
  const ok = state === 'ok'
  return (
    <li className="flex min-w-0 flex-col gap-2.5 rounded-surface border border-ktip-sand-200 p-3.5">
      <span className="flex min-w-0 items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 grid h-5.5 w-5.5 shrink-0 place-items-center rounded-full text-micro font-extrabold',
            ok ? 'bg-ktip-tropical-700 text-white' : 'bg-ktip-sun-100 text-ktip-sun-800'
          )}
          role="img"
          aria-label={ok ? t`Checked` : t`Not checked yet`}
        >
          {ok ? <Check size={13} aria-hidden="true" /> : '!'}
        </span>
        <span className="min-w-0">
          <b className="block text-sm font-extrabold text-ktip-sand-900">{title}</b>
          <span className="block break-words text-xs text-ktip-sand-500">{hint}</span>
        </span>
      </span>
      {children}
      {state === 'failed' && (
        <p role="status" className="break-words text-xs text-ktip-sun-800">
          {failed}
        </p>
      )}
      {action && <span className="mt-auto flex">{action}</span>}
    </li>
  )
}

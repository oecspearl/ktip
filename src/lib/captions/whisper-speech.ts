import { supabase } from '../supabase'
import type { UiLang } from '../i18n/protocol'
import type { SpeechRecognizer, SpeechSegment } from './speech'
import {
  createUtteranceDetector,
  pickMimeType,
  rms,
  transcribeError,
  type WhisperCaptionError,
} from './whisper-speech-core'

export type { WhisperCaptionError } from './whisper-speech-core'

/**
 * Captions through Groq's free Whisper, for browsers with no speech recognition
 * of their own (Firefox). Migration 203.
 *
 * The microphone level is watched locally. When someone starts talking a
 * recording starts, and when they pause it stops and the phrase goes to
 * api/speech/transcribe.ts. Silence is never sent, so it costs nothing, and
 * the text comes back a few seconds after the phrase ends. Phrases are sent
 * one at a time, in order, which also keeps one speaker well inside Groq's
 * per-minute limit.
 */

const LEVEL_POLL_MS = 50

export interface WhisperRecognizerOptions {
  lang: UiLang
  /** The LiveKit room name: a venue room, coffee table or call id. */
  roomId: string
  onSegment: (segment: SpeechSegment) => void
  /** fatal: captions cannot continue (allowance used up, not allowed, no mic). */
  onError?: (error: WhisperCaptionError, fatal: boolean) => void
}

export function createWhisperRecognizer(options: WhisperRecognizerOptions): SpeechRecognizer {
  let wanted = false
  let running = false
  let teardown: (() => void) | null = null
  let queue: Promise<void> = Promise.resolve()

  const fail = (code: WhisperCaptionError, fatal: boolean) => {
    options.onError?.(code, fatal)
    if (fatal) {
      wanted = false
      teardown?.()
    }
  }

  const send = async (blob: Blob) => {
    if (!wanted) return
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return fail('speech-error', true)

    const form = new FormData()
    form.append('audio', blob, blob.type.includes('ogg') ? 'phrase.ogg' : 'phrase.webm')
    form.append('lang', options.lang)
    form.append('roomId', options.roomId)

    try {
      const res = await fetch('/api/speech/transcribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      })
      const body = (await res.json().catch(() => ({}))) as { text?: string; reason?: string }
      if (!res.ok) {
        const { code, fatal } = transcribeError(res.status, body.reason)
        fail(code, fatal)
        options.onSegment({ text: '', final: true })
        return
      }
      // Empty text still clears the speaker's "listening" line.
      options.onSegment({ text: (body.text ?? '').trim(), final: true })
    } catch {
      fail('speech-error', false)
      options.onSegment({ text: '', final: true })
    }
  }

  const open = async () => {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
    } catch {
      return fail('speech-no-mic', true)
    }
    if (!wanted) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }

    const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type))
    if (!mimeType) {
      stream.getTracks().forEach((track) => track.stop())
      return fail('speech-unavailable', true)
    }

    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    context.createMediaStreamSource(stream).connect(analyser)
    const frame = new Float32Array(analyser.fftSize)
    const detector = createUtteranceDetector()

    // Each phrase carries its own keep flag: onstop fires later, and by then
    // the next phrase may already have started.
    let phrase: { recorder: MediaRecorder; keep: boolean } | null = null

    const startPhrase = () => {
      const chunks: Blob[] = []
      const current = { recorder: new MediaRecorder(stream, { mimeType }), keep: false }
      current.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      current.recorder.onstop = () => {
        if (!current.keep || chunks.length === 0) return
        const blob = new Blob(chunks, { type: mimeType })
        queue = queue.then(() => send(blob))
      }
      current.recorder.start()
      phrase = current
      options.onSegment({ text: '…', final: false })
    }

    const endPhrase = (keepIt: boolean) => {
      if (!phrase) return
      phrase.keep = keepIt
      if (phrase.recorder.state !== 'inactive') phrase.recorder.stop()
      phrase = null
      if (!keepIt) options.onSegment({ text: '', final: true })
    }

    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(frame)
      const event = detector.feed(rms(frame), performance.now())
      if (event === 'start') startPhrase()
      else if (event === 'end') endPhrase(true)
      else if (event === 'split') {
        endPhrase(true)
        startPhrase()
      }
      else if (event === 'cancel') endPhrase(false)
    }, LEVEL_POLL_MS)

    running = true
    teardown = () => {
      teardown = null
      clearInterval(timer)
      endPhrase(false)
      stream.getTracks().forEach((track) => track.stop())
      void context.close().catch(() => {})
      running = false
    }
  }

  return {
    start() {
      if (wanted) return
      wanted = true
      void open()
    },
    stop() {
      wanted = false
      teardown?.()
    },
    isRunning: () => running,
  }
}

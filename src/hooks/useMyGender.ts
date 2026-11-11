import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isCallVoice, type CallVoice } from '../lib/captions/voice'

/**
 * The member's gender, as they set it in Preferences, and the voice a call
 * uses for them because of it (migration 209).
 *
 * Optional and private: the column is readable only through my_gender(), and
 * a call is told one word (woman, man, girl, boy) worked out by the server
 * from the gender and whether the account is a minor's. That word is cached
 * on the device so a call has it the moment it connects.
 *
 * Before 209 is applied the functions do not exist: every read fails quietly
 * and calls use the device's default voice, as they always did.
 */

export type Gender = 'woman' | 'man'

const VOICE_CACHE_KEY = 'ktip.call.voice.v1'
const CHANGED = 'ktip:call-voice-changed'

const isGender = (value: unknown): value is Gender => value === 'woman' || value === 'man'

function readVoiceCache(): CallVoice | undefined {
  try {
    const raw = localStorage.getItem(VOICE_CACHE_KEY)
    return isCallVoice(raw) ? raw : undefined
  } catch {
    return undefined
  }
}

function writeVoiceCache(voice: CallVoice | undefined) {
  try {
    if (voice) localStorage.setItem(VOICE_CACHE_KEY, voice)
    else localStorage.removeItem(VOICE_CACHE_KEY)
  } catch {
    // Storage blocked: the next call asks the server again.
  }
  // A call open in this tab picks the change up at once.
  try {
    window.dispatchEvent(new Event(CHANGED))
  } catch {
    // No window: nothing is listening.
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase as any).rpc(name, args)

/** The voice a call should use for me, or undefined when I have not said. */
export function useMyCallVoice(): CallVoice | undefined {
  const [voice, setVoice] = useState<CallVoice | undefined>(readVoiceCache)

  useEffect(() => {
    let cancelled = false
    void rpc('my_call_voice').then(
      ({ data, error }: { data: unknown; error: unknown }) => {
        if (cancelled || error) return
        const next = isCallVoice(data) ? data : undefined
        setVoice(next)
        writeVoiceCache(next)
      },
      () => {}
    )
    const onChanged = () => setVoice(readVoiceCache())
    window.addEventListener(CHANGED, onChanged)
    return () => {
      cancelled = true
      window.removeEventListener(CHANGED, onChanged)
    }
  }, [])

  return voice
}

/** The gender on my profile, for the Preferences form. */
export function useMyGender(): {
  gender: Gender | null
  /** False until the server has answered, and when it cannot (209 not applied). */
  available: boolean
  setGender: (next: Gender | null) => Promise<boolean>
} {
  const [gender, setGenderState] = useState<Gender | null>(null)
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    void rpc('my_gender').then(
      ({ data, error }: { data: unknown; error: unknown }) => {
        if (cancelled || error) return
        setGenderState(isGender(data) ? data : null)
        setAvailable(true)
      },
      () => {}
    )
    return () => {
      cancelled = true
    }
  }, [])

  const setGender = useCallback(
    async (next: Gender | null): Promise<boolean> => {
      const before = gender
      setGenderState(next)
      try {
        const { data, error } = await rpc('set_my_gender', { p_gender: next })
        if (error) throw error
        writeVoiceCache(isCallVoice(data) ? data : undefined)
        return true
      } catch {
        setGenderState(before)
        return false
      }
    },
    [gender]
  )

  return { gender, available, setGender }
}

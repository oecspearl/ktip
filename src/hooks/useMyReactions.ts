import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ROOM_REACTIONS } from './useRoomSignals'
import { MAX_OWN_REACTIONS, cleanOwnReactions } from '../lib/own-reactions'

/**
 * The three reactions a member added for themselves (migration 208).
 *
 * Read and written through RPCs, because the column is private (168 grants no
 * new profile column). A copy is kept in localStorage so the fan shows the
 * member's picks at once, before the round trip, and still works on a database
 * without 208, where the RPCs do not exist yet.
 */

const CACHE_KEY = 'ktip.reactions.mine'

function readCache(): string[] {
  try {
    return cleanOwnReactions(JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'), ROOM_REACTIONS)
  } catch {
    return []
  }
}

function writeCache(list: string[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list))
  } catch {
    // Storage blocked: the profile still has them.
  }
}

export function useMyReactions() {
  const [mine, setMine] = useState<string[]>(readCache)

  useEffect(() => {
    let cancelled = false
    void (supabase as any).rpc('my_reaction_emojis').then(
      ({ data, error }: { data: unknown; error: unknown }) => {
        if (cancelled || error) return
        const list = cleanOwnReactions(data, ROOM_REACTIONS)
        setMine(list)
        writeCache(list)
      },
      () => {}
    )
    return () => {
      cancelled = true
    }
  }, [])

  const save = useCallback((next: string[]) => {
    const list = cleanOwnReactions(next, ROOM_REACTIONS)
    setMine(list)
    writeCache(list)
    void (supabase as any).rpc('set_my_reaction_emojis', { p_emojis: list }).then(
      () => {},
      () => {}
    )
  }, [])

  const add = useCallback(
    (emoji: string) => {
      if (mine.includes(emoji) || mine.length >= MAX_OWN_REACTIONS) return
      save([...mine, emoji])
    },
    [mine, save]
  )

  const remove = useCallback((emoji: string) => save(mine.filter((item) => item !== emoji)), [mine, save])

  return { mine, add, remove, full: mine.length >= MAX_OWN_REACTIONS }
}

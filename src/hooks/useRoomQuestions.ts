import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { uniqueTopic } from '../lib/realtime'
import { keys } from '../queries/keys'

export interface RoomQuestion {
  id: string
  room_id: string
  author_id: string | null
  body: string
  lang: string | null
  answered_at: string | null
  created_at: string
  author: { id: string; display_name: string | null; avatar_url: string | null } | null
  votes: number
  /** This reader has upvoted it. */
  mine: boolean
}

/**
 * Questions for the speaker in one room, most wanted first (migration 210).
 *
 * `available` is false when the tables are not there yet, so a room switched
 * on before the migration says so plainly instead of showing an error.
 *
 * The author embed names its foreign key: the table points at profiles twice
 * (author and whoever marked it answered), and a bare embed is ambiguous.
 */
export function useRoomQuestions(roomId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient()
  const key = keys.sub('venue', 'questions', roomId)

  const query = useQuery({
    queryKey: key,
    enabled: !!roomId,
    retry: false,
    queryFn: async (): Promise<{ available: boolean; rows: any[] }> => {
      const { data, error } = await (supabase as any)
        .from('venue_room_questions')
        .select(
          'id, room_id, author_id, body, lang, answered_at, created_at, author:profiles!venue_room_questions_author_id_fkey(id, display_name, avatar_url), votes:venue_room_question_votes(user_id)'
        )
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(200)
      if (error) return { available: false, rows: [] }
      return { available: true, rows: data || [] }
    },
  })

  useEffect(() => {
    if (!roomId) return
    const refresh = () => queryClient.invalidateQueries({ queryKey: keys.sub('venue', 'questions', roomId) })
    const channel = supabase
      .channel(uniqueTopic(`venue_room_questions:${roomId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_room_questions', filter: `room_id=eq.${roomId}` }, refresh)
      // Votes carry no room, so every vote in the venue nudges this list. A
      // refetch of one room's questions is cheap, and votes are not frequent.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_room_question_votes' }, refresh)
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roomId, queryClient])

  const questions: RoomQuestion[] = (query.data?.rows ?? [])
    .map((row: any) => ({
      id: row.id,
      room_id: row.room_id,
      author_id: row.author_id,
      body: row.body,
      lang: row.lang,
      answered_at: row.answered_at,
      created_at: row.created_at,
      author: row.author ?? null,
      votes: (row.votes ?? []).length,
      mine: !!userId && (row.votes ?? []).some((v: any) => v.user_id === userId),
    }))
    // Waiting questions first, most wanted first, oldest first among equals.
    .sort(
      (a: RoomQuestion, b: RoomQuestion) =>
        Number(!!a.answered_at) - Number(!!b.answered_at) ||
        b.votes - a.votes ||
        a.created_at.localeCompare(b.created_at)
    )

  const refresh = () => queryClient.invalidateQueries({ queryKey: key })
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { error } = await (supabase as any).rpc(name, args)
    if (error) throw error
  }

  const ask = useMutation({
    mutationFn: ({ body, lang }: { body: string; lang: string | null }) =>
      rpc('ask_room_question', { p_room_id: roomId, p_body: body, p_lang: lang }),
    onSuccess: refresh,
  })
  const vote = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => rpc('vote_room_question', { p_question_id: id, p_on: on }),
    onSuccess: refresh,
  })
  const setAnswered = useMutation({
    mutationFn: ({ id, answered }: { id: string; answered: boolean }) =>
      rpc('set_room_question_answered', { p_question_id: id, p_answered: answered }),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => rpc('remove_room_question', { p_question_id: id }),
    onSuccess: refresh,
  })

  return {
    questions,
    loading: query.isPending,
    available: query.data?.available ?? true,
    ask,
    vote,
    setAnswered,
    remove,
  }
}

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Trash2, Upload } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { supabase } from '../../../../lib/supabase'
import { keys } from '../../../../queries/keys'
import { useToast } from '../../../../contexts/ToastContext'
import { Button } from '../../../ui/Button'

const BUCKET = 'team-files'
const MAX_BYTES = 25 * 1024 * 1024

interface Props {
  teamId: string
  ping: () => void
}

const sizeOf = (n: number | undefined) =>
  !n ? '' : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`

/**
 * Team files (migration 190): a private folder in the team-files bucket that
 * only the team and the hosts can read. Downloads are short-lived signed
 * links, so a file link pasted outside the team stops working within minutes.
 */
export function TeamFiles({ teamId, ping }: Props) {
  const { t } = useLingui()
  const toast = useToast()
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const key = keys.sub('venue', 'team-files', teamId)

  const { data: files = [], isPending } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(teamId, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } })
      if (error) throw error
      return (data || []).filter((f) => f.name && !f.name.startsWith('.'))
    },
  })

  const upload = useMutation({
    mutationFn: async (list: File[]) => {
      for (const file of list) {
        if (file.size > MAX_BYTES) throw new Error(t`${file.name} is over 25 MB.`)
        // A timestamp prefix keeps two uploads of "notes.pdf" from colliding.
        const safe = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120)
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(`${teamId}/${Date.now().toString(36)}-${safe}`, file, { contentType: file.type || undefined })
        if (error) throw error
      }
      return list.length
    },
    onSuccess: (n) => {
      toast.success(n === 1 ? t`File added` : t`${n} files added`)
      queryClient.invalidateQueries({ queryKey: key })
      ping()
    },
    onError: (err: any) => toast.error(err?.message || t`Upload failed`),
  })

  const remove = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.storage.from(BUCKET).remove([`${teamId}/${name}`])
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key })
      ping()
    },
    onError: (err: any) => toast.error(err?.message || t`Could not delete the file`),
  })

  const open = async (name: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(`${teamId}/${name}`, 300)
    if (error || !data?.signedUrl) {
      toast.error(t`Could not open the file`)
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const display = (name: string) => name.replace(/^[a-z0-9]+-/, '')

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const list = Array.from(e.dataTransfer.files)
          if (list.length) upload.mutate(list)
        }}
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-dashed p-4 text-sm ${
          over ? 'border-ktip-ocean-500 bg-ktip-ocean-50' : 'border-ktip-sand-200 text-ktip-sand-600'
        }`}
      >
        <p>
          <Trans>Drop files here. Up to 25 MB each. Only your team and the organisers can open them.</Trans>
        </p>
        <input
          ref={input}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            const list = Array.from(e.target.files || [])
            if (list.length) upload.mutate(list)
            e.target.value = ''
          }}
        />
        <Button size="sm" icon={<Upload size={14} aria-hidden="true" />} loading={upload.isPending} onClick={() => input.current?.click()}>
          <Trans>Choose files</Trans>
        </Button>
      </div>

      {isPending ? (
        <div className="h-24 animate-pulse-soft rounded-xl bg-ktip-sand-100" />
      ) : files.length === 0 ? (
        <p className="rounded-xl border border-ktip-sand-200 p-4 text-center text-sm text-ktip-sand-500">
          <Trans>No files yet. Put your datasets and pitch deck here.</Trans>
        </p>
      ) : (
        <ul className="divide-y divide-ktip-sand-100 rounded-xl border border-ktip-sand-200 bg-white">
          {files.map((f: any) => (
            <li key={f.name} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <FileText size={16} className="shrink-0 text-ktip-sand-400" aria-hidden="true" />
              <button
                type="button"
                onClick={() => open(f.name)}
                className="min-w-0 flex-1 truncate text-left font-medium text-ktip-sand-900 hover:underline"
              >
                {display(f.name)}
              </button>
              <span className="shrink-0 text-xs text-ktip-sand-500">{sizeOf(f.metadata?.size)}</span>
              <button
                type="button"
                aria-label={t`Download ${display(f.name)}`}
                onClick={() => open(f.name)}
                className="rounded p-1 text-ktip-sand-500 hover:bg-ktip-sand-100"
              >
                <Download size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t`Delete ${display(f.name)}`}
                onClick={() => remove.mutate(f.name)}
                className="rounded p-1 text-ktip-sand-400 hover:bg-ktip-sand-100 hover:text-red-600"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

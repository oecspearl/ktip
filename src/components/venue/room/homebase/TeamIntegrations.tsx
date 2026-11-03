import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleX, ExternalLink, GitBranch, GitPullRequest, Loader2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { supabase } from '../../../../lib/supabase'
import { keys } from '../../../../queries/keys'
import { useAuth } from '../../../../contexts/AuthContext'
import { useToast } from '../../../../contexts/ToastContext'
import { Button } from '../../../ui/Button'
import { EMPTY_LINKS, cleanLink, parseGithubRepo, type TeamLinks } from '../../../../lib/team-links'

interface Props {
  teamId: string
  ping: () => void
}

interface Commit {
  sha: string
  message: string
  author: string
  at: string
  url: string
}
interface Pull {
  number: number
  title: string
  url: string
  author: string
}
interface RepoFeed {
  commits: Commit[]
  pulls: Pull[]
  ci: 'success' | 'failure' | 'pending' | null
  branch: string
}

/**
 * Read straight from GitHub's public API in the browser. No token, so public
 * repos only, and GitHub allows 60 requests an hour per visitor; three calls
 * every two minutes stays well inside that.
 */
async function fetchRepo(repo: string): Promise<RepoFeed> {
  const gh = (path: string) =>
    fetch(`https://api.github.com/repos/${repo}${path}`, { headers: { Accept: 'application/vnd.github+json' } }).then((r) => {
      if (!r.ok) throw new Error(String(r.status))
      return r.json()
    })
  const meta = await gh('')
  const branch: string = meta.default_branch || 'main'
  const [commits, pulls, status] = await Promise.all([
    gh(`/commits?per_page=5&sha=${encodeURIComponent(branch)}`),
    gh('/pulls?state=open&per_page=5'),
    gh(`/commits/${encodeURIComponent(branch)}/check-runs?per_page=20`).catch(() => null),
  ])
  let ci: RepoFeed['ci'] = null
  const runs: any[] = status?.check_runs || []
  if (runs.length) {
    if (runs.some((r) => r.status !== 'completed')) ci = 'pending'
    else ci = runs.every((r) => ['success', 'neutral', 'skipped'].includes(r.conclusion)) ? 'success' : 'failure'
  }
  return {
    branch,
    ci,
    commits: (commits || []).map((c: any) => ({
      sha: c.sha,
      message: String(c.commit?.message || '').split('\n')[0],
      author: c.author?.login || c.commit?.author?.name || '',
      at: c.commit?.author?.date || '',
      url: c.html_url,
    })),
    pulls: (pulls || []).map((p: any) => ({ number: p.number, title: p.title, url: p.html_url, author: p.user?.login || '' })),
  }
}

/**
 * Homebase integrations (migration 195): the team's GitHub repo, with its
 * latest commits, open pull requests and test status, and links to where else
 * the team works. Every link is checked to be the service it claims to be.
 */
export function TeamIntegrations({ teamId, ping }: Props) {
  const { t, i18n } = useLingui()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const key = keys.sub('venue', 'team-links', teamId)

  const { data: links = EMPTY_LINKS } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<TeamLinks> => {
      const { data, error } = await (supabase as any)
        .from('team_links')
        .select('github_repo, discord_url, zoom_url, notion_url')
        .eq('team_id', teamId)
        .maybeSingle()
      if (error || !data) return EMPTY_LINKS
      return data
    },
  })

  const [form, setForm] = useState({ github: '', discord: '', zoom: '', notion: '' })
  useEffect(() => {
    setForm({
      github: links.github_repo || '',
      discord: links.discord_url || '',
      zoom: links.zoom_url || '',
      notion: links.notion_url || '',
    })
  }, [links])

  const save = useMutation({
    mutationFn: async () => {
      const repo = form.github.trim() ? parseGithubRepo(form.github) : null
      if (form.github.trim() && !repo) throw new Error(t`That is not a GitHub repository. Use owner/name or the repo's URL.`)
      const discord = cleanLink('discord_url', form.discord)
      const zoom = cleanLink('zoom_url', form.zoom)
      const notion = cleanLink('notion_url', form.notion)
      if (discord === false) throw new Error(t`The Discord link must start with https://discord.gg/ or https://discord.com/`)
      if (zoom === false) throw new Error(t`The Zoom link must be an https zoom.us link.`)
      if (notion === false) throw new Error(t`The Notion link must be an https notion.so or notion.site link.`)
      const { error } = await (supabase as any).from('team_links').upsert({
        team_id: teamId,
        github_repo: repo,
        discord_url: discord,
        zoom_url: zoom,
        notion_url: notion,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t`Links saved`)
      queryClient.invalidateQueries({ queryKey: key })
      ping()
    },
    onError: (err: any) => toast.error(err?.message || t`Could not save the links`),
  })

  const repo = links.github_repo
  const feed = useQuery({
    queryKey: ['github', 'repo-feed', repo],
    enabled: !!repo,
    staleTime: 2 * 60_000,
    refetchInterval: 2 * 60_000,
    retry: false,
    queryFn: () => fetchRepo(repo as string),
  })

  const field = (id: keyof typeof form, label: string, placeholder: string) => (
    <label className="text-xs font-medium text-ktip-sand-700">
      {label}
      <input
        value={form[id]}
        onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-ktip-sand-200 px-2.5 py-1.5 text-sm"
      />
    </label>
  )

  const linkCard = (url: string | null, label: string) =>
    url ? (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-2 rounded-xl border border-ktip-sand-200 bg-white px-3 py-2.5 text-sm font-semibold text-ktip-sand-900 hover:border-ktip-ocean-400"
      >
        {label}
        <ExternalLink size={14} className="text-ktip-sand-400" aria-hidden="true" />
      </a>
    ) : null

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section className="space-y-3 rounded-xl border border-ktip-sand-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 font-display text-base font-bold text-ktip-sand-900">
            <GitBranch size={16} aria-hidden="true" />
            {repo ? (
              <a href={`https://github.com/${repo}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {repo}
              </a>
            ) : (
              <Trans>GitHub</Trans>
            )}
          </h4>
          {feed.data?.ci === 'success' && (
            <span className="flex items-center gap-1 rounded-full bg-ktip-tropical-50 px-2 py-0.5 text-xs font-semibold text-ktip-tropical-800">
              <CircleCheck size={12} aria-hidden="true" /> <Trans>Checks passing</Trans>
            </span>
          )}
          {feed.data?.ci === 'failure' && (
            <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
              <CircleX size={12} aria-hidden="true" /> <Trans>Checks failing</Trans>
            </span>
          )}
          {feed.data?.ci === 'pending' && (
            <span className="flex items-center gap-1 rounded-full bg-ktip-sand-100 px-2 py-0.5 text-xs font-semibold text-ktip-sand-700">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" /> <Trans>Checks running</Trans>
            </span>
          )}
        </div>

        {!repo ? (
          <p className="text-sm text-ktip-sand-600">
            <Trans>Link your repository below to see commits, pull requests and test results here.</Trans>
          </p>
        ) : feed.isPending ? (
          <div className="h-32 animate-pulse-soft rounded-lg bg-ktip-sand-100" />
        ) : feed.isError ? (
          <p className="text-sm text-ktip-sand-600">
            <Trans>GitHub didn't answer. The repo may be private, or the hourly limit is used up. It tries again in two minutes.</Trans>
          </p>
        ) : (
          <>
            <ul className="divide-y divide-ktip-sand-100">
              {feed.data!.commits.map((c) => (
                <li key={c.sha} className="flex items-baseline gap-2 py-1.5 text-sm">
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-mono text-xs text-ktip-ocean-700 hover:underline">
                    {c.sha.slice(0, 7)}
                  </a>
                  <span className="min-w-0 flex-1 truncate text-ktip-sand-900">{c.message}</span>
                  <span className="shrink-0 text-xs text-ktip-sand-500">
                    {c.author} · {c.at ? i18n.date(c.at, { hour: '2-digit', minute: '2-digit', weekday: 'short' }) : ''}
                  </span>
                </li>
              ))}
            </ul>
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ktip-sand-700">
                <GitPullRequest size={13} aria-hidden="true" />
                {t`${feed.data!.pulls.length} open pull requests`}
              </p>
              <ul className="space-y-1">
                {feed.data!.pulls.map((p) => (
                  <li key={p.number} className="truncate text-sm">
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-ktip-sand-900 hover:underline">
                      #{p.number} {p.title}
                    </a>
                    <span className="ml-1 text-xs text-ktip-sand-500">{p.author}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>

      <section className="space-y-3">
        <div className="grid gap-2">
          {linkCard(links.discord_url, t`Team Discord`)}
          {linkCard(links.zoom_url, t`Backup Zoom room`)}
          {linkCard(links.notion_url, t`Notion page`)}
        </div>
        <form
          className="space-y-2 rounded-xl border border-ktip-sand-200 bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          {field('github', t`GitHub repository`, 'owner/name')}
          {field('discord', t`Discord invite or channel`, 'https://discord.gg/…')}
          {field('zoom', t`Backup Zoom link (for when the venue call is full)`, 'https://zoom.us/j/…')}
          {field('notion', t`Notion page`, 'https://….notion.site/…')}
          <Button type="submit" size="sm" loading={save.isPending}>
            <Trans>Save links</Trans>
          </Button>
        </form>
      </section>
    </div>
  )
}

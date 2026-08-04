import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { ImageUpload } from '../../../components/ui/ImageUpload'
import { Button } from '../../../components/ui/Button'
import { TrophyImage } from '../../../components/achievements/TrophyImage'
import { useAllBadges } from '../../../hooks/useBadges'
import { useTrophyAssets } from '../../../hooks/useAchievements'
import { useAdminBadgeMutations } from '../../../hooks/useAdminAchievements'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { useToast } from '../../../contexts/ToastContext'
import { IMAGE_PRESETS } from '../../../lib/constants'
import { RARITY_LABEL, RARITY_POINTS, TIER_ORDER } from '../../../lib/achievement-style'
import { resolveCopy } from '../../../i18n/copy'
import { useLingui } from '@lingui/react/macro'
import { cn } from '../../../lib/utils'
import type { BadgeTier } from '../../../types'

/**
 * Runtime editing for badge definitions and trophy artwork.
 *
 * Both tabs write through SECURITY DEFINER RPCs that check
 * has_permission('org:manage'); the tables have no client write policy, so
 * this screen has no privileged path of its own — an admin who bypassed the UI
 * would hit exactly the same check.
 */
export default function AdminAchievementsPage() {
  usePageTitle('Achievements — Admin')
  const [tab, setTab] = useState<'definitions' | 'art'>('definitions')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ktip-sand-900">Achievements</h1>
        <p className="mt-1 text-sm text-ktip-sand-600">
          Badge definitions and the shared trophy artwork behind them.
        </p>
      </header>

      <div className="flex gap-1.5">
        <TabButton active={tab === 'definitions'} onClick={() => setTab('definitions')}>
          Definitions
        </TabButton>
        <TabButton active={tab === 'art'} onClick={() => setTab('art')}>
          Trophy art
        </TabButton>
      </div>

      {tab === 'definitions' ? <DefinitionsTab /> : <TrophyArtTab />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-ktip-ocean-300 bg-ktip-ocean-50 text-ktip-ocean-700'
          : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-ocean-300'
      )}
    >
      {children}
    </button>
  )
}

// ============================================================
// Definitions
// ============================================================

function DefinitionsTab() {
  // RARITY_LABEL holds message descriptors, so it needs the catalog to render.
  const { i18n } = useLingui()
  const { badges, loading } = useAllBadges()
  const { assetMap } = useTrophyAssets()
  const { upsertBadge } = useAdminBadgeMutations()
  const toast = useToast()

  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ description: string; check_value: string }>({
    description: '',
    check_value: '',
  })

  const rows = useMemo(
    () => [...(badges || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [badges]
  )

  const save = async (slug: string) => {
    const badge = rows.find((b) => b.slug === slug)
    if (!badge) return

    try {
      await upsertBadge.mutateAsync({
        ...badge,
        description: draft.description,
        check_value: draft.check_value === '' ? null : Number(draft.check_value),
      })
      toast.success('Badge updated')
      setEditing(null)
    } catch (err: any) {
      toast.error(err?.message || 'Could not update badge')
    }
  }

  if (loading) {
    return <div className="h-96 animate-pulse-soft rounded-2xl bg-ktip-sand-100" />
  }

  return (
    <div className="space-y-4">
      {/* This is the single most surprising property of the system, so it is
          stated on the screen rather than only in the migration comment. */}
      <p className="flex items-start gap-2 rounded-xl border border-ktip-ocean-200 bg-ktip-ocean-50/60 px-4 py-3 text-sm text-ktip-sand-700">
        <Info size={16} className="mt-0.5 shrink-0 text-ktip-ocean-600" aria-hidden="true" />
        <span>
          Earned achievements are permanent. Lowering a threshold awards it to more members on
          their next check; <strong>raising one takes it away from nobody</strong>. Points are set
          by rarity and cannot be edited directly.
        </span>
      </p>

      <div className="overflow-x-auto rounded-2xl border border-ktip-sand-200 bg-ktip-cream">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-ktip-sand-200 text-left text-xs uppercase tracking-wider text-ktip-sand-500">
              <th scope="col" className="px-4 py-3">Trophy</th>
              <th scope="col" className="px-4 py-3">Badge</th>
              <th scope="col" className="px-4 py-3">Category</th>
              <th scope="col" className="px-4 py-3">Rarity</th>
              <th scope="col" className="px-4 py-3">Rule</th>
              <th scope="col" className="px-4 py-3 text-right">Points</th>
              <th scope="col" className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((badge) => {
              const isEditing = editing === badge.slug
              return (
                <tr key={badge.id} className="border-b border-ktip-sand-100 last:border-0 align-top">
                  <td className="px-4 py-3">
                    <TrophyImage
                      icon={badge.icon}
                      trophyType={badge.trophy_type}
                      tier={badge.tier}
                      imageUrl={badge.image_url}
                      rarity={badge.rarity}
                      assetMap={assetMap}
                      name={badge.name}
                      size={40}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ktip-sand-900">
                      {badge.name}
                      {badge.is_hidden && (
                        <span className="ml-1.5 text-xs font-normal text-ktip-sand-500">
                          (hidden)
                        </span>
                      )}
                    </p>
                    {isEditing ? (
                      <input
                        value={draft.description}
                        onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                        aria-label={`${badge.name} description`}
                        className="mt-1 w-full rounded-lg border border-ktip-sand-300 px-2 py-1 text-xs focus:border-ktip-ocean-500 focus:outline-none"
                      />
                    ) : (
                      <p className="text-xs text-ktip-sand-600">{badge.description}</p>
                    )}
                    <p className="mt-0.5 font-mono text-[11px] text-ktip-sand-400">{badge.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-ktip-sand-600">
                    {badge.category}
                    {badge.tier && <span className="block text-xs text-ktip-sand-400">{badge.tier}</span>}
                  </td>
                  <td className="px-4 py-3 text-ktip-sand-600">
                    {resolveCopy(i18n, RARITY_LABEL[badge.rarity || 'common'])}
                  </td>
                  <td className="px-4 py-3">
                    {badge.check_key ? (
                      <span className="font-mono text-xs text-ktip-sand-600">
                        {badge.check_key} ≥{' '}
                        {isEditing ? (
                          <input
                            type="number"
                            min={1}
                            value={draft.check_value}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, check_value: e.target.value }))
                            }
                            aria-label={`${badge.name} threshold`}
                            className="w-20 rounded border border-ktip-sand-300 px-1.5 py-0.5 focus:border-ktip-ocean-500 focus:outline-none"
                          />
                        ) : (
                          badge.check_value
                        )}
                      </span>
                    ) : (
                      <span className="text-xs italic text-ktip-sand-400">trigger only</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ktip-sand-600">
                    {badge.points ?? RARITY_POINTS[badge.rarity || 'common']}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isEditing ? (
                      <span className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => save(badge.slug)}
                          loading={upsertBadge.isPending}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(badge.slug)
                          setDraft({
                            description: badge.description,
                            check_value: badge.check_value?.toString() ?? '',
                          })
                        }}
                      >
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================
// Trophy art
// ============================================================

function TrophyArtTab() {
  const { assets, assetMap, loading, refetch } = useTrophyAssets()
  const { upsertTrophyAsset } = useAdminBadgeMutations()
  const toast = useToast()

  // Types come from the rows themselves rather than a hard-coded list, so
  // adding a type is a data change in a migration, not a code change here.
  const types = useMemo(() => {
    const seen: string[] = []
    for (const asset of assets || []) {
      if (!seen.includes(asset.type)) seen.push(asset.type)
    }
    return seen
  }, [assets])

  const handleUpload = async (type: string, tier: BadgeTier, url: string) => {
    try {
      await upsertTrophyAsset.mutateAsync({
        type,
        tier,
        imageUrl: url,
        altText: assetMap[type]?.[tier]?.alt_text || `${tier} ${type} trophy`,
      })
      toast.success('Trophy art updated')
      refetch()
    } catch (err: any) {
      toast.error(err?.message || 'Could not save trophy art')
    }
  }

  const handleAltText = async (type: string, tier: BadgeTier, altText: string) => {
    const existing = assetMap[type]?.[tier]
    if (!existing || existing.alt_text === altText) return
    try {
      await upsertTrophyAsset.mutateAsync({
        type,
        tier,
        imageUrl: existing.image_url,
        altText,
      })
    } catch {
      toast.error('Could not save alt text')
    }
  }

  if (loading) {
    return <div className="h-96 animate-pulse-soft rounded-2xl bg-ktip-sand-100" />
  }

  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-ktip-ocean-200 bg-ktip-ocean-50/60 px-4 py-3 text-sm text-ktip-sand-700">
        <Info size={16} className="mt-0.5 shrink-0 text-ktip-ocean-600" aria-hidden="true" />
        <span>
          Art is shared: one gold rocket is used by every gold project badge. Empty cells fall back
          to an icon, so the system works with no artwork at all. Use transparent backgrounds and
          keep the silhouette consistent across a row so the four tiers read as one set.
        </span>
      </p>

      {types.map((type) => (
        <section key={type}>
          <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wider text-ktip-sand-700">
            {type}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TIER_ORDER.map((tier) => {
              const asset = assetMap[type]?.[tier]
              return (
                <div
                  key={tier}
                  className="space-y-2 rounded-2xl border border-ktip-sand-200 bg-ktip-cream p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium capitalize text-ktip-sand-600">{tier}</span>
                    {!asset?.image_url && (
                      <span className="text-[11px] text-ktip-sand-400">icon fallback</span>
                    )}
                  </div>

                  <ImageUpload
                    bucket="trophy-assets"
                    // Stable key: replacing art keeps the same public URL, and
                    // uploadOptimizedImage cache-busts it for us.
                    path={`trophies/${type}/${tier}`}
                    currentUrl={asset?.image_url || undefined}
                    onUpload={(url) => handleUpload(type, tier, url)}
                    preset={IMAGE_PRESETS.TROPHY}
                    placeholder={`Upload ${tier} ${type}`}
                  />

                  <input
                    defaultValue={asset?.alt_text || ''}
                    onBlur={(e) => handleAltText(type, tier, e.target.value)}
                    placeholder="Alt text"
                    aria-label={`Alt text for ${tier} ${type} trophy`}
                    className="w-full rounded-lg border border-ktip-sand-300 px-2 py-1 text-xs focus:border-ktip-ocean-500 focus:outline-none"
                  />
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

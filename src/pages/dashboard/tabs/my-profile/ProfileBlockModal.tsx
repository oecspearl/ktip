import { useState } from 'react'
import { Save, X, Plus, ShieldCheck } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Modal } from '../../../../components/ui/Modal'
import { Button } from '../../../../components/ui/Button'
import { Input } from '../../../../components/ui/Input'
import { TagInput } from '../../../../components/ui/TagInput'
import { CollabSelect } from '../../../../components/ui/CollabSelect'
import { IndustrySelect } from '../../../../components/ui/IndustrySelect'
import { CountrySelect } from '../../../../components/ui/CountrySelect'
import { ModeratedTextarea } from '../../../../components/moderation/ModeratedField'
import { ContentWarningModal } from '../../../../components/moderation/ContentWarningModal'
import { useContentModeration } from '../../../../hooks/useContentModeration'
import { PortraitStudio } from '../../../../components/profile/PortraitStudio'
import type { ProfileBlock } from '../../../../components/profile/ProfileCanvas'
import type { ProfileDraft } from '../../../../lib/profile-visibility'
import type { ProfileDraftApi } from './useProfileDraft'
import {
  SELECTABLE_ROLES,
  SKILL_SUGGESTIONS,
  INTEREST_SUGGESTIONS,
  LIMITS,
} from '../../../../lib/constants'
import { ROLE_BY_SLUG, ROLE_DEFINITIONS } from '../../../../lib/permissions'
import { resolveCopy } from '../../../../i18n/copy'
import type { UserRole } from '../../../../types'

/** Roles a member may grant themselves; everything else needs a reviewer. */
const SELF_ASSIGNABLE_SLUGS = new Set<string>(
  ROLE_DEFINITIONS.filter((r) => r.selfAssignable).map((r) => r.slug)
)

/** What each block writes. Nothing else is sent, so nothing else can fail. */
const KEYS: Record<Exclude<ProfileBlock, 'banner' | 'photo'>, readonly (keyof ProfileDraft)[]> = {
  identity: ['display_name', 'roles'],
  about: ['bio'],
  details: ['organization', 'industry', 'country', 'phone', 'website'],
  skills: ['skills'],
  interests: ['interests'],
  languages: ['languages'],
  openTo: ['open_to'],
}

interface ProfileBlockModalProps {
  /** Which block is being edited, or null for none. */
  block: ProfileBlock | null
  onClose: () => void
  draft: ProfileDraftApi
}

/**
 * The editor for one block of the profile preview.
 *
 * Everything here writes through the shared draft, so the preview behind the
 * dialog updates as the member types — which is why the dialog asks for a
 * sheer scrim rather than the usual half-black blur. Cancel, Escape and the
 * backdrop all put the block's own keys back; nothing else in the draft is
 * touched either way.
 *
 * The photo and the banner are the exception: their studios are complete
 * editors that own their own upload pipeline and write on their own Save, so
 * they are not part of the draft. Their edits therefore appear in the preview
 * after that save rather than as you go.
 */
export function ProfileBlockModal({ block, onClose, draft }: ProfileBlockModalProps) {
  if (!block) return null

  if (block === 'photo' || block === 'banner') {
    return <AppearanceModal onClose={onClose} />
  }

  if (block === 'about') return <AboutModal onClose={onClose} draft={draft} />

  return <FieldModal block={block} onClose={onClose} draft={draft} />
}

interface EditorProps {
  onClose: () => void
  draft: ProfileDraftApi
}

/**
 * The band: the portrait and what sits behind it — one dialog, one choice.
 *
 * There is no banner picker here, and that is the point. A member's backdrop
 * and their banner were always the same ten pieces of artwork under two names
 * (AVATAR_BACKDROPS is PRESET_BANNERS), asked for twice; the only thing the
 * second question could add was the chance to answer it differently and end up
 * standing in front of a cover that fights the one baked behind your face. The
 * backdrop you pick here is written to both — see bannerFromAvatarStyle.
 *
 * The studio keeps its own Save. It owns an upload pipeline (optimize,
 * moderate, promote) that has nothing to do with the profile draft, so it is
 * not part of it and writes nothing until you tell it to.
 */
function AppearanceModal({ onClose }: { onClose: () => void }) {
  const { t } = useLingui()

  return (
    <Modal open onClose={onClose} size="3xl" title={t`Photo and backdrop`}>
      <PortraitStudio onSaved={onClose} />
    </Modal>
  )
}

/** Cancel / Save, in the order and the copy every dialog on this screen uses. */
function EditorFooter({
  onCancel,
  onSave,
  saving,
  disabled,
}: {
  onCancel: () => void
  onSave: () => void
  saving: boolean
  disabled?: boolean
}) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <Button variant="ghost" onClick={onCancel}>
        <Trans>Cancel</Trans>
      </Button>
      <Button onClick={onSave} loading={saving} disabled={disabled} icon={<Save size={16} />}>
        <Trans>Save</Trans>
      </Button>
    </div>
  )
}

/**
 * The bio, and only the bio.
 *
 * Split out because it is the one field on the profile that is checked before
 * it is stored — a bio follows a member around the whole platform — and
 * useContentModeration is a hook, so it can only be mounted for the dialog
 * that actually needs it.
 */
function AboutModal({ onClose, draft }: EditorProps) {
  const { t } = useLingui()
  const [snap] = useState(() => draft.snapshot(KEYS.about))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const moderation = useContentModeration(
    [{ name: 'bio', value: draft.draft.bio || '', label: t`Bio`, ai: true }],
    { surface: 'profile', onChange: (_field, next) => draft.set('bio', next) }
  )

  const cancel = () => {
    draft.restore(snap)
    onClose()
  }

  const save = async () => {
    setErrors({})
    const gate = await moderation.checkBeforeSubmit()
    if (!gate.ok) {
      setErrors((prev) => ({ ...prev, ...gate.errors }))
      return
    }
    const result = await draft.commit(KEYS.about)
    if (result.ok) onClose()
    else setErrors(result.errors)
  }

  return (
    <Modal open onClose={cancel} scrim="sheer" size="lg" title={t`About you`}>
      <ModeratedTextarea
        label={t`Bio`}
        value={draft.draft.bio || ''}
        onChange={(e) => draft.set('bio', e.target.value)}
        error={errors.bio}
        rows={5}
        placeholder={t`Tell us about yourself...`}
        moderation={moderation.fields.bio}
        fullWidth
      />
      <ContentWarningModal state={moderation.warning} onClose={moderation.dismissWarning} />
      <EditorFooter
        onCancel={cancel}
        onSave={save}
        saving={draft.saving || moderation.checking}
        disabled={moderation.blocked}
      />
    </Modal>
  )
}

function FieldModal({
  block,
  onClose,
  draft,
}: EditorProps & { block: Exclude<ProfileBlock, 'banner' | 'photo' | 'about'> }) {
  const { t, i18n } = useLingui()
  const keys = KEYS[block]
  const [snap] = useState(() => draft.snapshot(keys))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const cancel = () => {
    draft.restore(snap)
    onClose()
  }

  const save = async () => {
    setErrors({})
    const result = await draft.commit(keys)
    if (result.ok) onClose()
    else setErrors(result.errors)
  }

  const toggleRole = (role: UserRole) => {
    draft.set(
      'roles',
      draft.draft.roles.includes(role)
        ? draft.draft.roles.filter((r) => r !== role)
        : [...draft.draft.roles, role]
    )
  }

  const verifiedRoles = draft.draft.roles.filter((r) => !SELF_ASSIGNABLE_SLUGS.has(r))

  const TITLES: Record<typeof block, string> = {
    identity: t`Name and roles`,
    details: t`Details`,
    skills: t`Skills`,
    interests: t`Interests`,
    languages: t`Languages`,
    openTo: t`Open to collaborate`,
  }

  return (
    <Modal
      open
      onClose={cancel}
      scrim="sheer"
      size={block === 'details' ? 'lg' : 'md'}
      title={TITLES[block]}
    >
      {block === 'identity' && (
        <div className="grid gap-4">
          <Input
            label={t`Display Name`}
            value={draft.draft.display_name || ''}
            onChange={(e) => draft.set('display_name', e.target.value)}
            error={errors.display_name}
            fullWidth
          />
          <div>
            <p className="mb-2 text-caption text-ktip-sand-600">
              <Trans>Select the roles that describe you. You can choose multiple.</Trans>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SELECTABLE_ROLES.filter((role) => SELF_ASSIGNABLE_SLUGS.has(role.value)).map(
                (role) => {
                  const isSelected = draft.draft.roles.includes(role.value)
                  return (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => toggleRole(role.value)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-xs font-medium transition-all ${
                        isSelected
                          ? 'border-ktip-ocean-500 bg-ktip-ocean-50 text-ktip-ocean-700'
                          : 'border-ktip-sand-200 text-ktip-sand-600 hover:border-ktip-ocean-300'
                      }`}
                    >
                      {isSelected ? <X size={13} /> : <Plus size={13} />}
                      {resolveCopy(i18n, role.label)}
                    </button>
                  )
                }
              )}
            </div>
            {verifiedRoles.length > 0 && (
              <div className="mt-3 border-t border-ktip-sand-100 pt-3">
                <p className="mb-2 text-xs leading-relaxed text-ktip-sand-600">
                  <Trans>
                    Granted by verification. These can only be changed by your institution, your
                    Chamber of Commerce, or an OECS administrator.
                  </Trans>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {verifiedRoles.map((slug) => (
                    <span
                      key={slug}
                      className="inline-flex items-center gap-1.5 rounded-full border-2 border-ktip-tropical-200 bg-ktip-tropical-50 px-3 py-1.5 text-xs font-medium text-ktip-tropical-800"
                    >
                      <ShieldCheck size={13} />
                      {ROLE_BY_SLUG[slug]?.label
                        ? resolveCopy(i18n, ROLE_BY_SLUG[slug].label)
                        : slug}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {block === 'details' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t`Organisation`}
            value={draft.draft.organization || ''}
            onChange={(e) => draft.set('organization', e.target.value)}
            error={errors.organization}
            placeholder={t`Company, university, or institution`}
            fullWidth
          />
          <IndustrySelect
            value={draft.draft.industry || ''}
            onChange={(value) => draft.set('industry', value)}
          />
          <CountrySelect
            value={draft.draft.country || ''}
            onChange={(value) => draft.set('country', value)}
          />
          <Input
            label={t`Website`}
            type="url"
            value={draft.draft.website || ''}
            onChange={(e) => draft.set('website', e.target.value)}
            error={errors.website}
            placeholder="https://example.org"
            fullWidth
          />
          {/* The one field in this dialog that does not appear in the preview
              beside it, which is exactly why the helper text says so. */}
          <div className="sm:col-span-2">
            <Input
              label={t`Phone`}
              type="tel"
              value={draft.draft.phone || ''}
              onChange={(e) => draft.set('phone', e.target.value)}
              error={errors.phone}
              placeholder="+1 758 000 0000"
              helperText={t`Shown on your CV. Never shown on your profile or in the member directory.`}
              fullWidth
            />
          </div>
        </div>
      )}

      {block === 'skills' && (
        <TagInput
          description={t`Add skills to help others find you in the directory.`}
          values={draft.draft.skills}
          onChange={(values) => draft.set('skills', values)}
          suggestions={SKILL_SUGGESTIONS}
          max={LIMITS.MAX_SKILLS}
          placeholder={t`Type a skill and press Enter...`}
        />
      )}

      {block === 'interests' && (
        <TagInput
          description={t`Topics you care about — used to surface relevant people and opportunities.`}
          values={draft.draft.interests}
          onChange={(values) => draft.set('interests', values)}
          suggestions={INTEREST_SUGGESTIONS}
          max={LIMITS.MAX_INTERESTS}
          placeholder={t`Type an interest and press Enter...`}
        />
      )}

      {block === 'languages' && (
        <TagInput
          description={t`Languages you speak. These appear on your CV — without them it can only guess one from your Virtual Campus locale.`}
          values={draft.draft.languages || []}
          onChange={(values) => draft.set('languages', values)}
          max={12}
          placeholder={t`Type a language and press Enter...`}
        />
      )}

      {block === 'openTo' && (
        <CollabSelect
          values={draft.draft.open_to}
          onChange={(values) => draft.set('open_to', values)}
        />
      )}

      <EditorFooter onCancel={cancel} onSave={save} saving={draft.saving} />
    </Modal>
  )
}

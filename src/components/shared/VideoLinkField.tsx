import { Trans, useLingui } from '@lingui/react/macro'
import { Input } from '../ui/Input'
import { VideoLinkButton } from './VideoViewer'
import { isSupportedVideoLink } from '../../lib/video-embed'

interface VideoLinkFieldProps {
  value: string
  onChange: (value: string) => void
  error?: string
  /** Heading for the preview dialog — the project title, once there is one. */
  title?: string
}

/**
 * The project form's optional video link. Once the link is one KTIP accepts,
 * a preview button opens the same player readers will see, so the owner finds
 * a private or broken link before anyone else does.
 */
export function VideoLinkField({ value, onChange, error, title }: VideoLinkFieldProps) {
  const { t } = useLingui()

  return (
    <div className="flex flex-col gap-1.5">
      <Input
        type="url"
        inputMode="url"
        label={t`Video link (optional)`}
        placeholder={t`https://www.loom.com/share/...`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
        helperText={t`A short demo or pitch video, if you have one. Paste a Loom, Google Drive, YouTube or Vimeo link, with sharing set to "Anyone with the link can view".`}
        maxLength={500}
        fullWidth
      />
      {!error && isSupportedVideoLink(value) && (
        <VideoLinkButton
          url={value}
          title={title}
          label={<Trans>Preview the video</Trans>}
          className="self-start"
        />
      )}
    </div>
  )
}

import { useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Check, Copy, Download, Printer, ShieldAlert } from 'lucide-react'
import { Button } from '../ui/Button'
import { backupCodesFileContents, formatBackupCode } from '../../lib/mfa'

interface BackupCodesSheetProps {
  codes: string[]
  accountEmail?: string | null
  /** Rendered as the confirm action once the member ticks the box. */
  confirmLabel: string
  onConfirm: () => void
  confirming?: boolean
}

/**
 * The one-time recovery sheet (118).
 *
 * These codes exist once, in this response, and are never retrievable again.
 * The checkbox gating the finish button is the point of the whole component: a
 * blocking second factor with no acknowledged recovery path is a lockout
 * generator, and this is the only moment we can make someone stop and save it.
 */
export function BackupCodesSheet({
  codes,
  accountEmail,
  confirmLabel,
  onConfirm,
  confirming,
}: BackupCodesSheetProps) {
  const { t } = useLingui()
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const download = () => {
    const blob = new Blob([backupCodesFileContents(codes, accountEmail)], {
      type: 'text/plain;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'ktip-recovery-codes.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const copyAll = async () => {
    await navigator.clipboard.writeText(codes.map(formatBackupCode).join('\n'))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-control border border-amber-300/70 bg-amber-50/60 p-4 print:hidden">
        <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-body-sm text-amber-900">
          <Trans>
            Save these now — this is the only time they are shown. Each code works once, and
            they are how you get back in if you lose your phone.
          </Trans>
        </p>
      </div>

      {/* The grid itself survives printing; everything around it does not. */}
      <ul className="grid grid-cols-2 gap-2 font-mono text-body-sm tabular-nums rounded-control border border-ktip-sand-200 bg-ktip-sand-50/50 p-4">
        {codes.map((code) => (
          <li key={code} className="tracking-wider text-ktip-sand-800">
            {formatBackupCode(code)}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button type="button" variant="secondary" size="sm" icon={<Download size={16} />} onClick={download}>
          <Trans>Download</Trans>
        </Button>
        <Button type="button" variant="secondary" size="sm" icon={<Printer size={16} />} onClick={() => window.print()}>
          <Trans>Print</Trans>
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={copied ? <Check size={16} /> : <Copy size={16} />}
          onClick={copyAll}
        >
          {copied ? t`Copied` : t`Copy all`}
        </Button>
      </div>

      <label className="flex items-start gap-3 cursor-pointer print:hidden">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
          className="mt-1 w-4 h-4 accent-ktip-ocean-600"
        />
        <span className="text-body-sm text-ktip-sand-700">
          <Trans>I have saved these codes somewhere I can reach without my phone.</Trans>
        </span>
      </label>

      <Button
        type="button"
        fullWidth
        disabled={!saved}
        loading={confirming}
        onClick={onConfirm}
        className="print:hidden"
      >
        {confirmLabel}
      </Button>
    </div>
  )
}

import {
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  File,
  Lock,
  KeyRound,
  Users,
  Globe,
  Download,
  Settings2,
  Trash2,
  Sparkles,
  Clock,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { formatFileSize } from '../../lib/document-extract'
import { formatRelativeTime } from '../../lib/utils'
import type { DocumentVisibility, EntityDocumentSummary } from '../../types'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

interface DocumentCardProps {
  document: EntityDocumentSummary
  onOpen: () => void
  onRequestAccess: () => void
  onManageAccess: () => void
  onDownload: () => void
  onDelete: () => void
  deleting?: boolean
}

const VISIBILITY_CHIP: Record<DocumentVisibility, { label: MessageDescriptor; icon: typeof Lock; className: string }> = {
  private: { label: msg`Private`, icon: Lock, className: 'bg-ktip-sand-100 text-ktip-sand-600' },
  restricted: { label: msg`Restricted`, icon: KeyRound, className: 'bg-ktip-sun-100 text-ktip-sun-800' },
  members: { label: msg`Members`, icon: Users, className: 'bg-ktip-ocean-100 text-ktip-ocean-700' },
  public: { label: msg`Public`, icon: Globe, className: 'bg-ktip-tropical-100 text-ktip-tropical-700' },
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return ImageIcon
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') {
    return FileSpreadsheet
  }
  if (mimeType === 'application/pdf' || mimeType.includes('word') || mimeType.startsWith('text/')) {
    return FileText
  }
  return File
}

export function DocumentCard({
  document,
  onOpen,
  onRequestAccess,
  onManageAccess,
  onDownload,
  onDelete,
  deleting,
}: DocumentCardProps) {
  const { t, i18n } = useLingui()
  const Icon = fileIcon(document.mime_type)
  const chip = VISIBILITY_CHIP[document.visibility]
  const ChipIcon = chip.icon

  const hasAccess = document.my_role !== null
  const isOwner = document.my_role === 'owner'

  return (
    <div className="flex flex-col gap-3 p-4 border border-ktip-sand-200 rounded-xl hover:border-ktip-sand-300 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-ktip-sand-100 flex items-center justify-center shrink-0">
          <Icon size={18} className="text-ktip-ocean-600" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium text-ktip-sand-900 break-words">{document.title}</h4>
            <span
              className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded ${chip.className}`}
            >
              <ChipIcon size={11} />
              {i18n._(chip.label)}
            </span>
            {isOwner && document.open_request_count > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                <Plural value={document.open_request_count} one="# request" other="# requests" />
              </span>
            )}
            {hasAccess && document.extracted_field_count > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-ktip-ocean-100 text-ktip-ocean-700">
                <Sparkles size={11} />
                <Plural value={document.extracted_field_count} one="# field found" other="# fields found" />
              </span>
            )}
          </div>

          {document.description && (
            <p className="mt-1 text-sm text-ktip-sand-600 break-words">{document.description}</p>
          )}

          <p className="mt-1 text-xs text-ktip-sand-500">
            {document.owner_name || t`A member`} · {formatFileSize(document.file_size)} ·{' '}
            {formatRelativeTime(document.created_at)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {hasAccess ? (
          <>
            <Button size="sm" variant="outline" onClick={onOpen}>
              {document.has_content ? t`Open document` : t`Details`}
            </Button>
            <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={onDownload}>
              <Trans>Download</Trans>
            </Button>
            {isOwner && (
              <>
                <Button size="sm" variant="ghost" icon={<Settings2 size={14} />} onClick={onManageAccess}>
                  <Trans>Manage access</Trans>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={14} />}
                  onClick={onDelete}
                  loading={deleting}
                  className="text-red-600 hover:bg-red-50"
                >
                  <Trans>Delete</Trans>
                </Button>
              </>
            )}
          </>
        ) : document.pending_request ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-ktip-sand-500">
            <Clock size={14} />
            <Trans>Waiting on the owner</Trans>
          </span>
        ) : (
          <Button size="sm" variant="outline" icon={<KeyRound size={14} />} onClick={onRequestAccess}>
            <Trans>Request access</Trans>
          </Button>
        )}
      </div>
    </div>
  )
}

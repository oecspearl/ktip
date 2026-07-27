import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { useCreateGrant, useUpdateGrant } from '../../../hooks/useGrants'
import { useToast } from '../../../contexts/ToastContext'
import type { Grant } from '../../../types'
import { Save } from 'lucide-react'

interface AdminGrantFormModalProps {
  open: boolean
  grant: Grant | null
  onClose: () => void
  onSaved: () => void
}

const inputClass =
  'w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors'

export default function AdminGrantFormModal({ open, grant, onClose, onSaved }: AdminGrantFormModalProps) {
  const toast = useToast()
  const { createGrant, loading: createLoading } = useCreateGrant()
  const { updateGrant, loading: updateLoading } = useUpdateGrant()

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [grantType, setGrantType] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [deadline, setDeadline] = useState('')
  const [eligibility, setEligibility] = useState('')
  const [applicationUrl, setApplicationUrl] = useState('')
  const [isClimateAction, setIsClimateAction] = useState(false)

  const isEditing = grant !== null

  const resetForm = () => {
    setTitle('')
    setSummary('')
    setDescription('')
    setGrantType('')
    setAmountMin('')
    setAmountMax('')
    setCurrency('USD')
    setDeadline('')
    setEligibility('')
    setApplicationUrl('')
    setIsClimateAction(false)
  }

  useEffect(() => {
    if (grant) {
      setTitle(grant.title)
      setSummary(grant.summary || '')
      setDescription(grant.description || '')
      setGrantType(grant.grant_type || '')
      setAmountMin(grant.amount_min != null ? String(grant.amount_min) : '')
      setAmountMax(grant.amount_max != null ? String(grant.amount_max) : '')
      setCurrency(grant.currency || 'USD')
      setDeadline(grant.deadline ? grant.deadline.split('T')[0] : '')
      setEligibility(grant.eligibility || '')
      setApplicationUrl(grant.application_url || '')
      setIsClimateAction(grant.is_climate_action ?? false)
    } else {
      resetForm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grant])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      toast.error('Title is required')
      return
    }

    const grantData: Record<string, any> = {
      title: title.trim(),
      is_climate_action: isClimateAction,
    }

    grantData.summary = summary.trim() || null
    if (description.trim()) grantData.description = description.trim()
    if (grantType) grantData.grant_type = grantType
    if (amountMin) grantData.amount_min = Number(amountMin)
    if (amountMax) grantData.amount_max = Number(amountMax)
    if (currency.trim()) grantData.currency = currency.trim()
    if (deadline) grantData.deadline = deadline
    if (eligibility.trim()) grantData.eligibility = eligibility.trim()
    if (applicationUrl.trim()) grantData.application_url = applicationUrl.trim()

    try {
      if (isEditing) {
        await updateGrant(grant!.id, grantData as any)
        toast.success('Grant updated successfully')
      } else {
        await createGrant(grantData as any)
        toast.success('Grant created successfully')
      }
      onSaved()
      onClose()
      resetForm()
    } catch (err: any) {
      toast.error(err.message || `Failed to ${isEditing ? 'update' : 'create'} grant`)
    }
  }

  const loading = createLoading || updateLoading

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Grant' : 'Create Grant'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            placeholder="Enter grant title"
            required
            className={inputClass}
          />
        </div>

        {/* Summary */}
        <div>
          <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
            Summary
          </label>
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.currentTarget.value)}
            placeholder="One short sentence shown on the homepage hero (optional)"
            maxLength={180}
            className={inputClass}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            placeholder="Describe the grant opportunity"
            rows={3}
            className={inputClass}
          />
        </div>

        {/* Grant Type */}
        <div>
          <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
            Grant Type
          </label>
          <select
            value={grantType}
            onChange={(e) => setGrantType(e.currentTarget.value)}
            className={inputClass}
          >
            <option value="">Select type</option>
            <option value="startup">Startup</option>
            <option value="research">Research</option>
            <option value="innovation">Innovation</option>
            <option value="development">Development</option>
            <option value="education">Education</option>
          </select>
        </div>

        {/* Amount Min / Amount Max */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
              Amount Min
            </label>
            <input
              type="number"
              value={amountMin}
              onChange={(e) => setAmountMin(e.currentTarget.value)}
              placeholder="e.g. 1000"
              min="0"
              step="any"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
              Amount Max
            </label>
            <input
              type="number"
              value={amountMax}
              onChange={(e) => setAmountMax(e.currentTarget.value)}
              placeholder="e.g. 50000"
              min="0"
              step="any"
              className={inputClass}
            />
          </div>
        </div>

        {/* Currency */}
        <div>
          <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
            Currency
          </label>
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.currentTarget.value)}
            placeholder="USD"
            className={inputClass}
          />
        </div>

        {/* Deadline */}
        <div>
          <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
            Deadline
          </label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.currentTarget.value)}
            className={inputClass}
          />
        </div>

        {/* Eligibility */}
        <div>
          <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
            Eligibility
          </label>
          <textarea
            value={eligibility}
            onChange={(e) => setEligibility(e.currentTarget.value)}
            placeholder="Describe eligibility requirements"
            rows={3}
            className={inputClass}
          />
        </div>

        {/* Application URL */}
        <div>
          <label className="block text-sm font-medium text-ktip-sand-700 mb-1">
            Application URL
          </label>
          <input
            type="url"
            value={applicationUrl}
            onChange={(e) => setApplicationUrl(e.currentTarget.value)}
            placeholder="https://example.com/apply"
            className={inputClass}
          />
        </div>

        {/* Climate Action */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isClimateAction}
              onChange={(e) => setIsClimateAction(e.currentTarget.checked)}
              className="w-5 h-5 text-emerald-600 border-ktip-sand-300 rounded focus:ring-emerald-500"
            />
            <span className="text-sm text-ktip-sand-700">
              Climate Action grant
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-ktip-sand-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            icon={<Save size={16} />}
            loading={loading}
          >
            {isEditing ? 'Update Grant' : 'Create Grant'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

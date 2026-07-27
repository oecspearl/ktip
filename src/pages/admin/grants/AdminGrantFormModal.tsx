import { createSignal, createEffect, on } from 'solid-js'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { useCreateGrant, useUpdateGrant } from '../../../hooks/useGrants'
import { useToast } from '../../../contexts/ToastContext'
import type { Grant } from '../../../types'
import { Save } from 'lucide-solid'

interface AdminGrantFormModalProps {
  open: boolean
  grant: Grant | null
  onClose: () => void
  onSaved: () => void
}

const inputClass =
  'w-full px-3 py-2.5 border border-ktip-sand-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ktip-ocean-500/20 focus:border-ktip-ocean-500 transition-colors'

export default function AdminGrantFormModal(props: AdminGrantFormModalProps) {
  const toast = useToast()
  const { createGrant, loading: createLoading } = useCreateGrant()
  const { updateGrant, loading: updateLoading } = useUpdateGrant()

  const [title, setTitle] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [grantType, setGrantType] = createSignal('')
  const [amountMin, setAmountMin] = createSignal('')
  const [amountMax, setAmountMax] = createSignal('')
  const [currency, setCurrency] = createSignal('USD')
  const [deadline, setDeadline] = createSignal('')
  const [eligibility, setEligibility] = createSignal('')
  const [applicationUrl, setApplicationUrl] = createSignal('')
  const [isClimateAction, setIsClimateAction] = createSignal(false)

  const isEditing = () => props.grant !== null

  const resetForm = () => {
    setTitle('')
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

  createEffect(
    on(
      () => props.grant,
      (g) => {
        if (g) {
          setTitle(g.title)
          setDescription(g.description || '')
          setGrantType(g.grant_type || '')
          setAmountMin(g.amount_min != null ? String(g.amount_min) : '')
          setAmountMax(g.amount_max != null ? String(g.amount_max) : '')
          setCurrency(g.currency || 'USD')
          setDeadline(g.deadline ? g.deadline.split('T')[0] : '')
          setEligibility(g.eligibility || '')
          setApplicationUrl(g.application_url || '')
          setIsClimateAction(g.is_climate_action ?? false)
        } else {
          resetForm()
        }
      }
    )
  )

  const handleSubmit = async (e: Event) => {
    e.preventDefault()

    if (!title().trim()) {
      toast.error('Title is required')
      return
    }

    const grantData: Record<string, any> = {
      title: title().trim(),
      is_climate_action: isClimateAction(),
    }

    if (description().trim()) grantData.description = description().trim()
    if (grantType()) grantData.grant_type = grantType()
    if (amountMin()) grantData.amount_min = Number(amountMin())
    if (amountMax()) grantData.amount_max = Number(amountMax())
    if (currency().trim()) grantData.currency = currency().trim()
    if (deadline()) grantData.deadline = deadline()
    if (eligibility().trim()) grantData.eligibility = eligibility().trim()
    if (applicationUrl().trim()) grantData.application_url = applicationUrl().trim()

    try {
      if (isEditing()) {
        await updateGrant(props.grant!.id, grantData as any)
        toast.success('Grant updated successfully')
      } else {
        await createGrant(grantData as any)
        toast.success('Grant created successfully')
      }
      props.onSaved()
      props.onClose()
      resetForm()
    } catch (err: any) {
      toast.error(err.message || `Failed to ${isEditing() ? 'update' : 'create'} grant`)
    }
  }

  const loading = () => createLoading() || updateLoading()

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={isEditing() ? 'Edit Grant' : 'Create Grant'}
      size="lg"
    >
      <form onSubmit={handleSubmit} class="space-y-4">
        {/* Title */}
        <div>
          <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
            Title <span class="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
            placeholder="Enter grant title"
            required
            class={inputClass}
          />
        </div>

        {/* Description */}
        <div>
          <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
            Description
          </label>
          <textarea
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
            placeholder="Describe the grant opportunity"
            rows={3}
            class={inputClass}
          />
        </div>

        {/* Grant Type */}
        <div>
          <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
            Grant Type
          </label>
          <select
            value={grantType()}
            onChange={(e) => setGrantType(e.currentTarget.value)}
            class={inputClass}
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
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
              Amount Min
            </label>
            <input
              type="number"
              value={amountMin()}
              onInput={(e) => setAmountMin(e.currentTarget.value)}
              placeholder="e.g. 1000"
              min="0"
              step="any"
              class={inputClass}
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
              Amount Max
            </label>
            <input
              type="number"
              value={amountMax()}
              onInput={(e) => setAmountMax(e.currentTarget.value)}
              placeholder="e.g. 50000"
              min="0"
              step="any"
              class={inputClass}
            />
          </div>
        </div>

        {/* Currency */}
        <div>
          <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
            Currency
          </label>
          <input
            type="text"
            value={currency()}
            onInput={(e) => setCurrency(e.currentTarget.value)}
            placeholder="USD"
            class={inputClass}
          />
        </div>

        {/* Deadline */}
        <div>
          <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
            Deadline
          </label>
          <input
            type="date"
            value={deadline()}
            onInput={(e) => setDeadline(e.currentTarget.value)}
            class={inputClass}
          />
        </div>

        {/* Eligibility */}
        <div>
          <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
            Eligibility
          </label>
          <textarea
            value={eligibility()}
            onInput={(e) => setEligibility(e.currentTarget.value)}
            placeholder="Describe eligibility requirements"
            rows={3}
            class={inputClass}
          />
        </div>

        {/* Application URL */}
        <div>
          <label class="block text-sm font-medium text-ktip-sand-700 mb-1">
            Application URL
          </label>
          <input
            type="url"
            value={applicationUrl()}
            onInput={(e) => setApplicationUrl(e.currentTarget.value)}
            placeholder="https://example.com/apply"
            class={inputClass}
          />
        </div>

        {/* Climate Action */}
        <div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isClimateAction()}
              onChange={(e) => setIsClimateAction(e.currentTarget.checked)}
              class="w-5 h-5 text-emerald-600 border-ktip-sand-300 rounded focus:ring-emerald-500"
            />
            <span class="text-sm text-ktip-sand-700">
              Climate Action grant
            </span>
          </label>
        </div>

        {/* Actions */}
        <div class="flex justify-end gap-3 pt-4 border-t border-ktip-sand-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={props.onClose}
            disabled={loading()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            icon={<Save size={16} />}
            loading={loading()}
          >
            {isEditing() ? 'Update Grant' : 'Create Grant'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

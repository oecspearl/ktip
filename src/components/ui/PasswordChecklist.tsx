import { Check, X } from 'lucide-react'
import { PASSWORD_REQUIREMENTS } from '../../lib/validation'

interface PasswordChecklistProps {
  password: string
}

// Live password requirement feedback, driven by the same
// PASSWORD_REQUIREMENTS array as the signup schema.
export function PasswordChecklist({ password }: PasswordChecklistProps) {
  return (
    <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
      {PASSWORD_REQUIREMENTS.map((req) => {
        const met = req.test(password)
        return (
          <li
            key={req.id}
            className={`flex items-center gap-2 text-xs ${
              met ? 'text-ktip-tropical-600' : 'text-ktip-sand-500'
            }`}
          >
            {met ? <Check size={14} /> : <X size={14} />}
            {req.label}
          </li>
        )
      })}
    </ul>
  )
}

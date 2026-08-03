import { GraduationCap } from 'lucide-react'
import { RoleTabStub } from './RoleTabStub'
import { useLingui } from '@lingui/react/macro'

export default function MenteesTab() {
    const { t } = useLingui()
  return (
    <RoleTabStub
      title={t`Mentees`}
      blurb={t`The innovators you're guiding — their projects, milestones and the sessions you have scheduled.`}
      icon={GraduationCap}
      roles={['mentor', 'faculty']}
    />
  )
}

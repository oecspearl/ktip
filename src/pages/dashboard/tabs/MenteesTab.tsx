import { GraduationCap } from 'lucide-react'
import { RoleTabStub } from './RoleTabStub'

export default function MenteesTab() {
  return (
    <RoleTabStub
      title="Mentees"
      blurb="The innovators you're guiding — their projects, milestones and the sessions you have scheduled."
      icon={GraduationCap}
      roles={['mentor']}
    />
  )
}

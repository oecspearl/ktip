import { FlaskConical } from 'lucide-react'
import { RoleTabStub } from './RoleTabStub'

export default function ResearchTab() {
  return (
    <RoleTabStub
      title="Research"
      blurb="Your publications, student projects and the research collaborations you're part of."
      icon={FlaskConical}
      roles={['faculty', 'researcher']}
    />
  )
}

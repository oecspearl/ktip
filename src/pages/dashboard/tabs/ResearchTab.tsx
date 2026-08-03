import { FlaskConical } from 'lucide-react'
import { RoleTabStub } from './RoleTabStub'
import { useLingui } from '@lingui/react/macro'

export default function ResearchTab() {
    const { t } = useLingui()
  return (
    <RoleTabStub
      title={t`Research`}
      blurb={t`Your publications, student projects and the research collaborations you're part of.`}
      icon={FlaskConical}
      roles={['faculty', 'researcher']}
    />
  )
}

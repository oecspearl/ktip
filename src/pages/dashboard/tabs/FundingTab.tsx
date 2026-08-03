import { Wallet } from 'lucide-react'
import { RoleTabStub } from './RoleTabStub'
import { useLingui } from '@lingui/react/macro'

export default function FundingTab() {
    const { t } = useLingui()
  return (
    <RoleTabStub
      title={t`Funding`}
      blurb={t`Your deal flow — projects seeking investment, applications you're reviewing and the grants you've backed.`}
      icon={Wallet}
      roles={['investor']}
    />
  )
}

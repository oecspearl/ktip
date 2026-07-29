import { Wallet } from 'lucide-react'
import { RoleTabStub } from './RoleTabStub'

export default function FundingTab() {
  return (
    <RoleTabStub
      title="Funding"
      blurb="Your deal flow — projects seeking investment, applications you're reviewing and the grants you've backed."
      icon={Wallet}
      roles={['investor']}
    />
  )
}

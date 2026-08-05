import { CalendarDays } from 'lucide-react'
import { DashboardCalendar } from '../../../components/calendar/DashboardCalendar'
import { OverviewStats } from '../../../components/dashboard/stats/OverviewStats'
import { ForYouRail } from '../../../components/personalization/ForYouRail'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { Trans, useLingui } from '@lingui/react/macro'

export default function OverviewTab() {
    const { t } = useLingui()
  usePageTitle(t`Dashboard`)

  return (
    <>
      {/* Numbers first — this is the one tab that should answer "how am I
          doing" before it answers "what next" */}
      <OverviewStats />

      {/* Renders nothing when personalization is off or there is no signal */}
      <ForYouRail title={t`For You`} />

      <div className="flex items-center gap-2 mb-4">
        <CalendarDays size={18} className="text-ktip-ocean-600" />
        <h2 className="font-display font-bold text-xl text-ktip-sand-900"><Trans>My Calendar</Trans></h2>
      </div>
      <DashboardCalendar scope="personal" />
    </>
  )
}

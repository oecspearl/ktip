import { Link } from 'react-router'
import { CalendarDays, Plus } from 'lucide-react'
import { PageHero } from '../../components/layout/PageHero'
import { Button } from '../../components/ui/Button'
import { DashboardCalendar } from '../../components/calendar/DashboardCalendar'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function DashboardPage() {
  usePageTitle('Dashboard')

  return (
    <>
      <PageHero
        eyebrow="Your Hub"
        title="Dashboard"
        subtitle="Everything on your plate — events, registrations and grant deadlines"
        imageSeed="dashboard"
        breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Dashboard' }]}
        actions={
          <Link to="/events/new">
            <Button
              icon={<Plus size={16} />}
              size="sm"
              className="bg-ktip-ocean-600 text-white hover:bg-ktip-ocean-700 text-sm"
            >
              Create Event
            </Button>
          </Link>
        }
      />

      <div className="bg-ktip-sand-50 py-8 pb-12">
        <div className="max-w-[calc(50vw+32rem)] mx-auto px-4">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays size={18} className="text-ktip-ocean-600" />
            <h2 className="font-display font-bold text-xl text-ktip-sand-900">My Calendar</h2>
          </div>
          <DashboardCalendar scope="personal" />
        </div>
      </div>
    </>
  )
}

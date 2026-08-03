import { Link } from 'react-router'
import { Calendar, Plus } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { EventCard } from '../../../components/events/EventCard'
import { useUserEvents } from '../../../hooks/useProfile'
import { useAuth } from '../../../contexts/AuthContext'
import { usePageTitle } from '../../../hooks/usePageTitle'
import { Trans, useLingui } from '@lingui/react/macro'

export default function EventsTab() {
    const { t } = useLingui()
  usePageTitle(t`My Events`)
  const auth = useAuth()
  const { events } = useUserEvents(auth.user?.id)

  if (!events?.length) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-ktip-sand-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Calendar size={32} className="text-ktip-sand-400" />
        </div>
        <p className="text-ktip-sand-600 mb-4"><Trans>No events organized yet.</Trans></p>
        <Link to="/events/new">
          <Button icon={<Plus size={18} />}><Trans>Create an event</Trans></Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr stagger-children">
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  )
}

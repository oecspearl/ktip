import type { HelpCategory } from './types'

export const EVENTS_CATEGORY: HelpCategory = {
  id: 'events',
  title: 'Events',
  description: 'Find, join and organise hackathons, workshops and conferences.',
  icon: 'Calendar',
  articles: [
    {
      id: 'browse-events',
      title: 'How do I find events?',
      content: `Click "Events" in the navigation bar.\n\nThe page offers two views. The calendar shows a month grid where multi-day events stretch across the days they cover, and clicking a day opens a panel listing everything on it. The grid view shows cards grouped by when they happen.\n\nEach card carries the title, date, location and type, so you can scan quickly.\n\nA sort control at the top lets you order by date or by "For You", which ranks events against the topics you chose in your personalization settings.`,
      tags: ['browse', 'events', 'find', 'search', 'calendar', 'upcoming'],
    },
    {
      id: 'filter-events',
      title: 'How do I filter the events list?',
      content: `Filters sit above the events list.\n\nSearch matches titles and descriptions. The type filter narrows to Hackathon, Workshop, Meetup, Conference or Demo Day. The Climate Action toggle shows only events flagged as climate work.\n\nTopic chips below the filters come from the tags organisers actually used, so a chip never returns an empty list.\n\n"Clear all filters" resets everything at once.`,
      tags: ['filter', 'events', 'search', 'type', 'climate', 'tags'],
    },
    {
      id: 'event-register',
      title: 'How do I register for an event?',
      content: `Open the event and use the button in the details panel.\n\nMost events take a simple RSVP. Where the organiser has built a registration form, you fill that in instead — it can ask anything the organiser needs, and your answers are kept with your registration.\n\nIf the event has a capacity and it is full, you are told so up front. You can cancel an RSVP from the same place you made it.\n\nSubmitting a registration form also files a permanent copy under Submissions on your Dashboard.`,
      tags: ['register', 'rsvp', 'attend', 'sign up', 'capacity', 'waitlist'],
    },
    {
      id: 'create-event',
      title: 'How do I create an event?',
      content: `Go to the Events page and click "Create Event".\n\nRequired: a title of at least 3 characters, a type (Hackathon, Workshop, Meetup, Conference or Demo Day) and a start date and time.\n\nOptional: a description, a short summary, an end date and time, tags, a Climate Action flag, a registration deadline, and a capacity.\n\nChoose whether the event is virtual or in person; in-person events take a location. Administrators can additionally save an event as a draft and publish it later.`,
      tags: ['create', 'event', 'organize', 'new', 'host', 'draft'],
    },
    {
      id: 'event-types',
      title: 'What types of events can I create?',
      content: `There are five types.\n\nHackathon — a time-boxed build competition, often with a challenge brief and a venue.\n\nWorkshop — a hands-on session on one skill or topic.\n\nMeetup — an informal gathering for networking and discussion.\n\nConference — a larger event with speakers, panels and a schedule.\n\nDemo Day — a showcase where innovators present to an audience of funders and partners.\n\nThe type drives how the event is badged and filtered, so pick the closest fit.`,
      tags: ['hackathon', 'workshop', 'meetup', 'conference', 'demo day', 'types'],
    },
    {
      id: 'virtual-events',
      title: 'How do virtual events work?',
      content: `Tick "This is a virtual event" when creating it. Virtual events need no physical location.\n\nYou can point attendees at KTIP's own Video Conference tool, add a link to your preferred platform in the description, or — for larger events — set up a full virtual venue with rooms.\n\nVirtual events are the practical way to bring in participants from across all the member states at once.`,
      tags: ['virtual', 'online', 'remote', 'video', 'event'],
    },
    {
      id: 'event-schedule-speakers',
      title: 'Schedule, speakers, updates and recap articles',
      content: `Published events can carry a lot more than a description.\n\nSchedule — a timeline of sessions, keynotes, workshops, breaks and networking slots with times.\n\nSpeakers — a grid of the people presenting, with their roles and bios.\n\nUpdates — announcements, schedule changes and reminders posted by the organiser as the event runs. These reach registered attendees.\n\nArticles — recaps, resource round-ups, summaries and blog posts published after the event, so the material outlives the day.\n\nOrganisers manage all four from the event workspace in the admin console.`,
      tags: ['schedule', 'speakers', 'updates', 'articles', 'recap', 'agenda'],
    },
    {
      id: 'challenge-brief',
      title: 'How do I read a challenge brief?',
      content: `Competition events carry a challenge brief on the event page.\n\nObjectives say what you are being asked to achieve. Constraints set the boundaries — technology, time, budget, data you may use. Deliverables list exactly what you must hand in. Judging criteria show how entries are scored and weighted.\n\nRead the judging criteria first. They tell you where the marks actually are, which is not always where the objectives suggest.`,
      tags: ['challenge', 'brief', 'judging', 'criteria', 'deliverables', 'hackathon'],
    },
    {
      id: 'edit-event',
      title: 'How do I edit or update my event?',
      content: `Open your event and click "Edit". The organiser can edit their own event; OECS administrators can edit any event from the admin console, which also gives them the registration list, speakers, schedule, updates, articles, the challenge brief, form and page builders and the venue.\n\nYou can change the title, summary, description, type, dates, location, capacity and registration deadline.\n\nChanges are visible to attendees immediately. For anything attendees need to notice — a time or room change — post an Update as well, because that reaches their notifications.`,
      tags: ['edit', 'update', 'event', 'change', 'modify', 'organizer'],
    },
  ],
}

export const HACKATHONS_CATEGORY: HelpCategory = {
  id: 'hackathons',
  title: 'Hackathons & Venues',
  description: 'Enter virtual hackathon venues, rooms and presence.',
  icon: 'Trophy',
  articles: [
    {
      id: 'what-is-hackathon',
      title: 'What is the Virtual Hackathon?',
      content: `A Virtual Hackathon is a hackathon event with a virtual venue attached — a set of rooms you move between instead of a single video link.\n\nThe Hackathons page is the front door. It splits into what is live now, what is coming up, and what has already happened.\n\nLive hackathons show an "Enter the venue" action. Upcoming ones show the event page so you can register in advance; past ones keep their recap articles and schedule.`,
      tags: ['hackathon', 'virtual', 'competition', 'live', 'venue'],
    },
    {
      id: 'enter-venue',
      title: 'How do I enter an event venue?',
      content: `From the Hackathons page or the event page, click through to the venue.\n\nThe venue is a floorplan of rooms. Each room shows who is currently in it, updated live, so you can see where people are before you commit to joining. Click a room to enter it.\n\nYou must be registered for the event to enter its venue. If you are not, register on the event page first.\n\nVenues only exist for events where the organiser has set one up.`,
      tags: ['venue', 'enter', 'floorplan', 'rooms', 'presence'],
    },
    {
      id: 'venue-availability',
      title: 'Setting your availability in a venue',
      content: `Inside a venue you carry a status so other participants know whether to interrupt you.\n\nWorking — heads down but present. Away — stepped out. Do not disturb — please do not ping me. Needs help — actively asking for a mentor or organiser. Offline — not in the venue.\n\n"Needs help" is the one to use when you are stuck: help-desk staff and mentors watch for it.\n\nIf you go idle for about five minutes your status flips to Away automatically, so the floorplan stays honest without you having to manage it.`,
      tags: ['availability', 'status', 'presence', 'away', 'help', 'busy'],
    },
    {
      id: 'venue-room',
      title: 'What can I do inside a venue room?',
      content: `A room gives you a text chat and a list of everyone currently in it, with their availability.\n\nChat history loads in pages of about fifty messages, so you can scroll back through what you missed.\n\nLive audio and video inside rooms is a later phase and is not switched on yet — the room page says so where the call controls will go. For voice or video now, use the Video Conference tool and share the room link in the chat.`,
      tags: ['room', 'chat', 'occupants', 'audio', 'video', 'venue'],
    },
    {
      id: 'venue-room-types',
      title: 'What kinds of rooms will I see?',
      content: `Main Hall — the default landing room for announcements and general presence.\n\nNetworking — open mingling.\n\nWorkshop — a scheduled hands-on session.\n\nHelp Desk — where mentors and organisers wait for anyone flagged as needing help.\n\nSponsor Booth — a sponsor's own space.\n\nTeam Space — a room for one team to work in.\n\nJudging — where entries are reviewed.\n\nStage — presentations to the whole event.\n\nBreakout — an ad-hoc side room.\n\nOrganisers choose which of these to create, so not every venue has all nine.`,
      tags: ['rooms', 'types', 'main hall', 'help desk', 'judging', 'stage'],
    },
    {
      id: 'setup-venue',
      title: 'How do I set up a venue for my event? (organisers)',
      content: `Open your event in the admin console and go to the Venue tab.\n\nTurn the venue on, then use "Create starter rooms" to get a sensible default set rather than building each room by hand.\n\nYou can optionally upload a floorplan graphic. Each room has a zone identifier that must match the corresponding zone in the artwork; rooms whose identifier does not match anything appear in a "Not on the map" list so you can spot the mismatch.\n\nStaff your Help Desk before the event opens. It is the room participants reach for when they are stuck.`,
      tags: ['venue', 'setup', 'organizer', 'rooms', 'floorplan', 'admin'],
    },
  ],
}

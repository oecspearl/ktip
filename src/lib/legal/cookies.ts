import type { LegalDocument } from './types'

/**
 * Named "Cookie & Storage Notice" rather than "Cookie Policy" because KTIP
 * barely uses cookies — the session lives in localStorage. A notice that only
 * describes cookies would be accurate and useless.
 */
export const COOKIES: LegalDocument = {
  key: 'cookies',
  version: 1,
  effectiveDate: '2026-09-01',
  bundle: 'informational',
  title: 'Cookie & Storage Notice',
  summary:
    'Everything KTIP stores on your device, what each item is for, which ones you can refuse, and how to change your mind.',
  relatedKeys: ['privacy', 'terms'],
  sections: [
    {
      id: 'what-we-store',
      heading: 'What we store on your device',
      railLabel: 'What we store',
      body: [
        {
          kind: 'para',
          text: 'KTIP uses very few cookies. Almost everything it keeps on your device is in your browser’s local storage, which does not travel with every request the way a cookie does. Both are covered here.',
        },
        {
          kind: 'table',
          columns: ['What', 'Why', 'Can you refuse it?'],
          rows: [
            {
              cells: [
                'Session token',
                'Keeps you signed in between page loads. Without it you would sign in on every navigation.',
                'No — refusing it means no account',
              ],
            },
            {
              cells: [
                'Language and content-language choice',
                'Remembers which language to show the interface and member content in.',
                'No — but you can change the value',
              ],
            },
            {
              cells: [
                'Theme and accessibility preferences',
                'Dark mode, reduced motion, text scale.',
                'No — but you can change the value',
              ],
            },
            {
              cells: ['Recent searches', 'Offers your last few searches back to you.', 'No — clearable in your browser'],
            },
            {
              cells: [
                'Tutorial and coachmark progress',
                'Stops the same walkthrough appearing every visit.',
                'No — clearable in your browser',
              ],
            },
            {
              cells: [
                'Your analytics choice',
                'Remembers that you allowed or declined analytics, so you are not asked again on this device.',
                'No — it is the record of your answer',
              ],
            },
            {
              cells: [
                'Dismissed notices',
                'Remembers which non-essential notices you have closed.',
                'No — clearable in your browser',
              ],
            },
            {
              cells: [
                'Analytics session identifier',
                'Groups your page views into one visit so we can see which pages help people.',
                'Yes — this is the one you choose',
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'analytics',
      heading: 'The one you choose',
      railLabel: 'Analytics',
      summary: 'Optional, first-party, and nothing is written unless you allow it.',
      body: [
        {
          kind: 'para',
          text: 'Analytics is the only optional item. When you allow it, we record which pages are visited, which features are used, and how far people get through flows like sign-up — with a session identifier and, when you are signed in, your user ID.',
        },
        {
          kind: 'list',
          items: [
            'It is first-party. The data goes into our own database, not to an advertising network.',
            'We never record the content of a message, a proposal, a document or a search result.',
            'If you decline, no analytics identifier is written and no events are sent. Declining costs you nothing on the site.',
            'The choice is per device and per browser, because that is where it is stored.',
          ],
        },
        {
          kind: 'para',
          text: 'Analytics events are kept for %analyticsRetention%.',
        },
      ],
    },
    {
      id: 'no-tracking',
      heading: 'What we do not do',
      railLabel: 'Not used',
      body: [
        {
          kind: 'list',
          items: [
            'No advertising cookies, and no advertising network.',
            'No cross-site tracking, and no third-party trackers embedded in our pages.',
            'No selling or sharing of your data with data brokers.',
            'No fingerprinting to identify you when you have declined analytics.',
          ],
        },
      ],
    },
    {
      id: 'third-party',
      heading: 'Storage set by other services',
      railLabel: 'Third parties',
      body: [
        {
          kind: 'para',
          text: 'A few things you use on KTIP are run by other organisations and set their own storage while you use them: Google and Microsoft during sign-in, Supabase for the authentication session, and the video service during a call. Error monitoring sends telemetry but does not store an identifier on your device for advertising.',
        },
        {
          kind: 'para',
          text: 'Embedded content — a video, a map, a slide deck someone linked — can set storage under its own provider’s terms once you play or open it.',
        },
      ],
      actions: [{ label: 'Processors we use', href: '/legal/privacy#processors' }],
    },
    {
      id: 'changing-your-mind',
      heading: 'Changing your mind',
      railLabel: 'Change it',
      body: [
        {
          kind: 'para',
          text: 'Your analytics choice can be changed at any time in Settings, and it takes effect immediately — turning it off stops events being sent and drops the session identifier.',
        },
        {
          kind: 'para',
          text: 'Clearing your browser’s storage for this site removes everything in the table above, including your session, so you will be signed out and asked about analytics again.',
        },
      ],
      actions: [{ label: 'Change your analytics choice', href: '/settings?tab=legal' }],
    },
  ],
}

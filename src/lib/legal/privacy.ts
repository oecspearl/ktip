import type { LegalDocument } from './types'

/**
 * Written to the stricter of the applicable OECS national data-protection acts
 * and the GDPR standard, because members are spread across several
 * jurisdictions and writing to the lowest bar would mean writing a different
 * policy for each.
 */
export const PRIVACY: LegalDocument = {
  key: 'privacy',
  version: 1,
  effectiveDate: '2026-09-01',
  bundle: 'account',
  title: 'Privacy Policy',
  summary:
    'What personal data KTIP collects, why, who it reaches, how long it is kept, and the rights you can exercise over it.',
  relatedKeys: ['cookies', 'safeguarding', 'ai-disclosure', 'partner-api', 'terms'],
  sections: [
    {
      id: 'who-we-are',
      heading: 'Who we are',
      railLabel: 'Who we are',
      body: [
        {
          kind: 'para',
          text: 'KTIP — the Knowledge, Technology and Innovation Platform — is operated by %entity%, %address%, acting as the data controller for personal data processed on the platform.',
        },
        {
          kind: 'para',
          text: 'Privacy questions and data-rights requests go to %privacyEmail%, handled by %dpo%.',
        },
        {
          kind: 'para',
          text: 'KTIP serves the OECS region and its members live in several countries, so this policy is written to the stricter of the applicable national data-protection acts and the GDPR standard rather than to the lowest common bar.',
        },
      ],
    },
    {
      id: 'what-you-give-us',
      heading: 'What you give us directly',
      railLabel: 'You give us',
      body: [
        {
          kind: 'table',
          columns: ['Data', 'Where it comes from', 'Required?'],
          rows: [
            { cells: ['Display name, email address, password (stored hashed)', 'Sign-up step 1', 'Yes'] },
            { cells: ['Selected role or roles', 'Sign-up step 1', 'Yes'] },
            { cells: ['Date of birth', 'Sign-up or onboarding age declaration', 'Yes'] },
            { cells: ['Organisation, industry, country, biography', 'Sign-up step 2', 'Optional'] },
            { cells: ['Skills, interests, collaboration preferences', 'Sign-up step 3', 'Optional'] },
            { cells: ['Avatar and cover images', 'Profile settings', 'Optional'] },
            {
              cells: [
                'Projects, events, grant applications, forum posts, comments, reactions, whiteboards, documents, code snippets, sticky notes',
                'Your use of the platform',
                'Optional',
              ],
            },
            { cells: ['Direct and group messages, and message attachments', 'Messaging', 'Optional'] },
            { cells: ['Uploaded documents and CVs', 'Uploads and CV parsing', 'Optional'] },
            {
              cells: [
                'Verification evidence for student, faculty or organisational status',
                'Institution or chamber verification flow',
                'Only if you request a gated role',
              ],
            },
            {
              cells: [
                'Support, feedback, testing and grievance submissions',
                'Help and feedback forms',
                'Optional',
              ],
            },
            {
              cells: [
                'A record of which legal documents you accepted, when, and in which language you read them',
                'Sign-up, onboarding, publishing and settings',
                'Yes',
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'what-we-collect',
      heading: 'What we collect automatically',
      railLabel: 'Collected',
      body: [
        {
          kind: 'defs',
          items: [
            {
              term: 'Product analytics',
              def: 'Page views, feature events, funnel and conversion events, a session identifier, the page path, timestamps, and your user ID when you are signed in. Optional, and only collected if you allow it — see the Cookie & Storage Notice.',
            },
            {
              term: 'Error and performance telemetry',
              def: 'Stack traces, browser and operating system, route and release version, sent to Sentry so that failures can be diagnosed.',
            },
            {
              term: 'Security and operational logs',
              def: 'Authentication events, administrative actions, moderation actions and rate-limit counters.',
            },
            {
              term: 'Rate-limit records',
              def: 'Caller IP addresses are hashed with a secret salt before storage, so the throttle table cannot be read back as a record of who viewed what.',
            },
            {
              term: 'Local storage on your device',
              def: 'Your session token, theme and accessibility preferences, recent searches, tutorial progress, and your analytics choice. Listed in full in the Cookie & Storage Notice.',
            },
          ],
        },
      ],
      actions: [{ label: 'Cookie & Storage Notice', href: '/legal/cookies' }],
    },
    {
      id: 'from-third-parties',
      heading: 'What we receive from other services',
      railLabel: 'Third parties',
      body: [
        {
          kind: 'list',
          items: [
            'Google and Microsoft sign-in — your name, email address, profile picture and provider account identifier.',
            'OECS Virtual Campus single sign-on — a verified subject identifier, email address and the campus attributes the Virtual Campus asserts.',
            'OECS Commons and catalogue APIs — course and catalogue records linked to your account where you use those integrations.',
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'No sign-in provider supplies a date of birth. Accounts created that way are still asked to declare one before the account is usable.',
        },
      ],
    },
    {
      id: 'minors',
      heading: 'Date of birth and minors',
      railLabel: 'Minors',
      summary: 'Restricted data, stored apart from your profile, and write-once by design.',
      body: [
        {
          kind: 'para',
          text: 'Your declared date of birth is treated as restricted data: it is stored in its own table behind its own access rules, it is never copied onto your public profile, and ordinary application queries cannot read it back. Everything downstream consumes a derived yes-or-no answer to "is this account a minor?" rather than the date itself.',
        },
        {
          kind: 'para',
          text: 'The declaration is write-once. Correcting it is an administrative action taken by staff, because an account that can edit its own date of birth is an account that can leave supervised mode.',
        },
        {
          kind: 'para',
          text: 'The full picture — what supervised mode restricts, and how guardian requests are handled — is in the Minor Safeguarding Statement.',
        },
      ],
      actions: [{ label: 'Minor Safeguarding Statement', href: '/legal/safeguarding' }],
    },
    {
      id: 'legal-bases',
      heading: 'Why we process it',
      railLabel: 'Legal bases',
      body: [
        {
          kind: 'table',
          columns: ['Purpose', 'Basis'],
          rows: [
            { cells: ['Creating and running your account; delivering the platform', 'Performance of a contract'] },
            {
              cells: [
                'Age declaration, minor detection and safeguarding of young members',
                'Legal obligation, and substantial public interest',
              ],
            },
            {
              cells: [
                'Verification of student, faculty and organisational status',
                'Performance of a contract; legitimate interests in trust and safety',
              ],
            },
            {
              cells: [
                'Content moderation, abuse and fraud prevention, security logging',
                'Legitimate interests; legal obligation',
              ],
            },
            { cells: ['Product analytics', 'Consent — withdrawable at any time in Settings'] },
            { cells: ['Optional email notifications and digests', 'Consent — withdrawable in Settings'] },
            {
              cells: [
                'AI features — search, chat assistance, field extraction, CV parsing, moderation assistance',
                'Legitimate interests; consent where the feature is opt-in',
              ],
            },
            { cells: ['Machine translation of member content', 'Legitimate interests in regional accessibility'] },
            {
              cells: [
                'Reporting to programme funders and regional partners',
                'Legitimate interests — in aggregate or de-identified form',
              ],
            },
            {
              cells: [
                'Recording your acceptance of these policies',
                'Legal obligation, and legitimate interests in being able to evidence it',
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'visibility',
      heading: 'What other people can see',
      railLabel: 'Visibility',
      summary: 'KTIP is a collaboration platform, so some data is deliberately public.',
      body: [
        {
          kind: 'defs',
          items: [
            {
              term: 'Public by default',
              def: 'Display name, avatar, declared roles, organisation, country, biography, skills, interests, badges, published projects, public events and forum posts.',
            },
            {
              term: 'Controlled by your settings',
              def: 'Profile visibility, leaderboard participation and connection counts. Note that a private profile is not an invisible one — a limited teaser may still appear in the directory.',
            },
            {
              term: 'Never public',
              def: 'Date of birth, password, email address unless you publish it yourself, private messages, verification evidence, grant applications, grievance and moderation records, and analytics rows.',
            },
          ],
        },
        {
          kind: 'para',
          text: 'Administrators and moderators can reach non-public data where that is necessary to operate the platform, investigate a report, or meet a safeguarding duty. Those accesses are logged.',
        },
      ],
    },
    {
      id: 'processors',
      heading: 'Who we share it with',
      railLabel: 'Processors',
      body: [
        { kind: 'para', text: 'We do not sell personal data. We use the following processors:' },
        {
          kind: 'table',
          columns: ['Provider', 'Purpose', 'What reaches them'],
          rows: [
            { cells: ['Supabase', 'Database, authentication, file storage, realtime', 'All stored platform data'] },
            { cells: ['Vercel', 'Hosting and serverless execution', 'Request data, IP addresses, logs'] },
            { cells: ['Sentry', 'Error and performance monitoring', 'Telemetry, user ID, route, browser context'] },
            {
              cells: [
                'OpenAI',
                'AI search, chat assistance, field and CV extraction, moderation assistance',
                'Only the content submitted to those features',
              ],
            },
            {
              cells: [
                'OpenRouter and Azure AI Translator',
                'Machine translation of member content',
                'Text submitted for translation',
              ],
            },
            { cells: ['LiveKit', 'Video and audio collaboration, recording where enabled', 'Media and chat during a call'] },
            { cells: ['Resend', 'Transactional email', 'Email address, message content'] },
            { cells: ['Google and Microsoft', 'Sign-in', 'The authentication exchange'] },
            {
              cells: [
                'OECS Virtual Campus and Commons',
                'Single sign-on and catalogue integration',
                'Identity assertions, linked catalogue activity',
              ],
            },
          ],
        },
        {
          kind: 'para',
          text: 'Verified employer and organisation data is also made available to approved partners through our partner API, where you have consented to appear in it. The rules those partners are bound by are published in the Partner API Terms.',
        },
        {
          kind: 'para',
          text: 'We also disclose data where the law requires it, to protect the rights and safety of members — particularly minors — and to programme funders in aggregate or de-identified form.',
        },
      ],
      actions: [{ label: 'Partner API Terms', href: '/legal/partner-api' }],
    },
    {
      id: 'transfers',
      heading: 'International transfers',
      railLabel: 'Transfers',
      body: [
        {
          kind: 'para',
          text: 'Data is hosted outside the OECS, primarily in the United States and the European Union depending on the provider. Those transfers rely on the providers’ standard contractual clauses and equivalent safeguards. Ask at %privacyEmail% for the specific hosting regions in use.',
        },
      ],
    },
    {
      id: 'retention',
      heading: 'How long we keep it',
      railLabel: 'Retention',
      body: [
        {
          kind: 'table',
          columns: ['Data', 'Kept'],
          rows: [
            { cells: ['Account and profile', 'While your account is active'] },
            { cells: ['Date of birth', 'While your account is active; deleted with the account'] },
            {
              cells: [
                'Published content — projects, events, forum posts',
                'May remain after account deletion, attributed to a deleted member, where others rely on it',
              ],
            },
            { cells: ['Messages', 'Retained in recipients’ threads after your account is deleted'] },
            { cells: ['Analytics events', '%analyticsRetention%'] },
            { cells: ['Error telemetry', 'Per Sentry retention, typically 90 days'] },
            {
              cells: [
                'Moderation, copyright, grievance and safeguarding records',
                '%caseRetention%, for legal-defence and safeguarding purposes',
              ],
            },
            {
              cells: [
                'Records of which policies you accepted',
                '%caseRetention% after the account closes — the record is the evidence that consent was given',
              ],
            },
            { cells: ['Hashed rate-limit records', 'A rolling window of hours'] },
          ],
        },
      ],
    },
    {
      id: 'your-rights',
      heading: 'Your rights',
      railLabel: 'Your rights',
      summary: 'Access, correction, deletion, restriction, objection, portability, withdrawal of consent.',
      body: [
        {
          kind: 'para',
          text: 'You can request access to your data, correction of it, deletion, restriction of processing, and portability; you can object to processing based on legitimate interests; and you can withdraw consent at any time without affecting what was done before you withdrew it.',
        },
        {
          kind: 'list',
          items: [
            'Self-service deletion is available in Settings. It removes your profile and authentication record; content that has cascaded into other members’ contexts is handled as described in the retention table above.',
            'Analytics consent can be changed at any time in Settings, on each device.',
            'Correcting your date of birth requires contacting support, by design.',
            'Anything else: %privacyEmail%. We respond within %rightsResponsePeriod%.',
          ],
        },
        {
          kind: 'para',
          text: 'You may also complain to the data-protection authority in the country where you live. We would rather you came to us first, but that is your right and not a step you have to take second.',
        },
      ],
      actions: [
        { label: 'Your privacy settings', href: '/settings?tab=legal' },
        { label: 'Delete your account', href: '/settings?tab=security' },
      ],
    },
    {
      id: 'security',
      heading: 'Security',
      railLabel: 'Security',
      body: [
        {
          kind: 'para',
          text: 'Row-level security on every table, role-based access control scoped to your active role, encrypted transport, hashed passwords, service keys held server-side only, hashed IP addresses for throttling, audit logging on administrative and moderation actions, and sensitive fields such as date of birth quarantined away from ordinary queries.',
        },
        {
          kind: 'para',
          text: 'No system is perfectly secure. If you find a vulnerability, report it to %privacyEmail% rather than demonstrating it against other members’ data.',
        },
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to this policy',
      railLabel: 'Changes',
      body: [
        {
          kind: 'para',
          text: 'Material changes are announced in the application and by email at least %noticePeriod% before they take effect. The version number and effective date at the top of this page always reflect what is currently in force, and every version you have accepted is listed in your settings.',
        },
      ],
    },
  ],
}

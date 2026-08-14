import type { LegalDocument } from './types'

/**
 * Published rather than contractual-only on purpose: the members whose data
 * moves through the partner feed are not parties to the partner agreement, and
 * the Privacy Policy points here so they can read what the recipient is bound by.
 */
export const PARTNER_API: LegalDocument = {
  key: 'partner-api',
  version: 1,
  effectiveDate: '2026-09-01',
  bundle: 'informational',
  title: 'Partner API Terms',
  summary:
    'The rules binding organisations that read KTIP data through the partner API — what they may use it for, what they may never do, and how a member withdraws.',
  relatedKeys: ['privacy', 'terms', 'acceptable-use'],
  sections: [
    {
      id: 'who-this-is-for',
      heading: 'Who this is for',
      railLabel: 'Scope',
      body: [
        {
          kind: 'para',
          text: 'These terms bind any organisation granted programmatic access to KTIP data through the partner API. Accepting them is a condition of holding a partner key.',
        },
        {
          kind: 'para',
          text: 'They are published rather than kept in the partner contract because the members whose data flows through the feed are not parties to that contract, and are entitled to know what the recipient may do.',
        },
      ],
      actions: [{ label: 'Privacy Policy', href: '/legal/privacy' }],
    },
    {
      id: 'consent-first',
      heading: 'Only data members chose to share',
      railLabel: 'Consent',
      summary: 'The feed carries opt-in data, and withdrawal removes it.',
      body: [
        {
          kind: 'para',
          text: 'The partner feed carries verified employer and organisation records, and member records only where that member has opted in to appear. Nothing enters the feed by default.',
        },
        {
          kind: 'para',
          text: 'A member can withdraw at any time in their settings. Withdrawal removes them from subsequent responses immediately, and the partner must delete previously received records for that member within 30 days.',
        },
      ],
    },
    {
      id: 'permitted-use',
      heading: 'What a partner may use it for',
      railLabel: 'Permitted',
      body: [
        {
          kind: 'para',
          text: 'Only the purpose named in the partner’s agreement — typically matching opportunities to members, or reporting on regional programme outcomes. A partner may:',
        },
        {
          kind: 'list',
          ordered: true,
          items: [
            'Display records to its own authorised users for that purpose.',
            'Store records for as long as the purpose requires, and no longer.',
            'Produce aggregate statistics from them.',
          ],
        },
      ],
    },
    {
      id: 'prohibited',
      heading: 'What a partner may never do',
      railLabel: 'Prohibited',
      body: [
        {
          kind: 'list',
          ordered: true,
          items: [
            'Sell, rent, sublicense or otherwise transfer the data to anyone else, including within a corporate group, unless the agreement names them.',
            'Combine it with other datasets to re-identify a member who is present in aggregate form, or to build a profile beyond the stated purpose.',
            'Use it for advertising, for credit or risk scoring, or for any automated decision that materially affects a person.',
            'Use it to train a machine-learning model.',
            'Contact members using details from the feed for anything other than the stated purpose.',
            'Retain data after the agreement ends, or after a member withdraws.',
            'Present the data as endorsed, verified or warranted by %entityShort% beyond what the record itself states.',
          ],
        },
      ],
    },
    {
      id: 'security',
      heading: 'Security obligations',
      railLabel: 'Security',
      body: [
        {
          kind: 'list',
          ordered: true,
          items: [
            'Keep partner keys secret, server-side, and out of client applications and source control.',
            'Rotate a key immediately on suspicion of exposure, and tell us.',
            'Encrypt the data in transit and at rest, and restrict access to staff who need it.',
            'Report any breach affecting KTIP data to %privacyEmail% within 72 hours of becoming aware of it.',
            'Keep a record of what was received and when, sufficient to satisfy a deletion request.',
          ],
        },
      ],
    },
    {
      id: 'limits',
      heading: 'Rate limits and fair use',
      railLabel: 'Limits',
      body: [
        {
          kind: 'para',
          text: 'Requests are rate-limited and paginated. Do not attempt to enumerate the whole dataset, run parallel keys to raise your effective limit, or retry aggressively against an error. Ask for a higher limit instead — there is usually a good reason to say yes.',
        },
        {
          kind: 'para',
          text: 'The API is provided as is. Endpoints and fields may change with notice; breaking changes are versioned.',
        },
      ],
    },
    {
      id: 'audit',
      heading: 'Audit and suspension',
      railLabel: 'Audit',
      body: [
        {
          kind: 'para',
          text: 'We log partner access and may ask a partner to demonstrate compliance, including how records are stored and deleted. Access can be suspended immediately where we reasonably believe these terms have been breached or member data is at risk, and we will explain why.',
        },
        {
          kind: 'para',
          text: 'On termination, the partner deletes all data received and confirms the deletion in writing within 30 days.',
        },
      ],
    },
    {
      id: 'for-members',
      heading: 'If you are a member, not a partner',
      railLabel: 'For members',
      body: [
        {
          kind: 'para',
          text: 'You control whether you appear in the partner feed, in your settings. You can ask which partners currently hold your data at %privacyEmail%, and you can require deletion.',
        },
        {
          kind: 'para',
          text: 'If you believe a partner has used your data outside these terms, tell us at %privacyEmail%. We can suspend their access, and we will tell you what we found.',
        },
      ],
      actions: [{ label: 'Your privacy settings', href: '/settings?tab=legal' }],
    },
  ],
}

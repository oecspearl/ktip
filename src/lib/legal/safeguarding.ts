import type { LegalDocument } from './types'

/**
 * Written to be read by a fourteen-year-old and by their parent, which is why it
 * explains the mechanism rather than only asserting the policy: "we store it
 * separately and never copy it to your profile" is checkable, "we take your
 * privacy seriously" is not.
 */
export const SAFEGUARDING: LegalDocument = {
  key: 'safeguarding',
  version: 1,
  effectiveDate: '2026-09-01',
  bundle: 'account',
  title: 'Minor Safeguarding Statement',
  summary:
    'How KTIP protects members under 18 — what supervised mode restricts, how the date of birth is handled, and how a parent or guardian can act.',
  relatedKeys: ['privacy', 'acceptable-use', 'terms'],
  sections: [
    {
      id: 'minimum-age',
      heading: 'Minimum age',
      railLabel: 'Minimum age',
      body: [
        {
          kind: 'para',
          text: 'You must be at least %minimumAge% years old to hold a KTIP account, or older if the law of the country you live in sets a higher minimum age for online services.',
        },
        {
          kind: 'para',
          text: 'We do not knowingly maintain accounts for children below that age. If you believe one exists, tell us at %privacyEmail% and it will be removed.',
        },
      ],
    },
    {
      id: 'declaring-age',
      heading: 'Declaring your date of birth',
      railLabel: 'Declaration',
      summary: 'Asked once, stored apart from your profile, and not editable by you afterwards.',
      body: [
        {
          kind: 'para',
          text: 'Every account declares a date of birth — at sign-up, or during onboarding if the account was created through Google, Microsoft or Virtual Campus sign-in, because none of those providers supplies one.',
        },
        {
          kind: 'list',
          items: [
            'It is stored in its own table with its own access rules, and it is never copied onto your public profile.',
            'The rest of the platform reads a derived yes-or-no answer — is this account a minor? — rather than the date itself.',
            'The declaration is write-once. You cannot change it yourself, because an account that can edit its own date of birth is an account that can leave supervised mode.',
            'To correct a genuine mistake, contact %supportEmail%. Staff can change it; the change is logged.',
          ],
        },
        {
          kind: 'note',
          tone: 'warn',
          text: 'Declaring a false date of birth — in particular one that presents a minor as an adult — is grounds for immediate suspension. It is also the single thing most likely to put a young member in a situation the safeguards were built to prevent.',
        },
      ],
    },
    {
      id: 'supervised-mode',
      heading: 'What supervised mode does',
      railLabel: 'Supervised mode',
      body: [
        {
          kind: 'para',
          text: 'An account belonging to a member under 18 is placed in supervised mode automatically. It cannot be switched off by the member, and it is not visible to other members as a badge or label — protection should not double as a marker.',
        },
        {
          kind: 'defs',
          items: [
            {
              term: 'Messaging',
              def: 'Adults outside a shared, supervised context cannot start a direct conversation with a minor. Conversations a minor starts are subject to the same restriction in reverse.',
            },
            {
              term: 'Collaboration',
              def: 'Access to open collaboration surfaces is narrowed to contexts a minor has been invited into by their institution or an event they joined.',
            },
            {
              term: 'Visibility',
              def: 'Profile fields that would identify a minor outside the platform are restricted, and directory exposure is reduced.',
            },
            {
              term: 'Moderation',
              def: 'Reports involving a minor are triaged ahead of the ordinary queue and can be acted on before review.',
            },
          ],
        },
        {
          kind: 'para',
          text: 'These restrictions lift automatically when the account reaches 18. Nobody has to ask.',
        },
      ],
    },
    {
      id: 'guardians',
      heading: 'Parents and guardians',
      railLabel: 'Guardians',
      body: [
        {
          kind: 'para',
          text: 'Where the law of the country a member lives in sets a minimum age for consenting to online services, and the member is below it, a parent or guardian must consent and may exercise the member’s data-protection rights on their behalf.',
        },
        {
          kind: 'para',
          text: 'To make a guardian request — access, correction, deletion, or a question about an account — contact %privacyEmail%. We will ask for enough information to establish the relationship before acting, which is a protection for the young person rather than an obstacle to you.',
        },
        {
          kind: 'para',
          text: 'Institutions enrolling students have their own safeguarding route through their KTIP institution contact, including a guardian-consent record held against the enrolment.',
        },
      ],
    },
    {
      id: 'concerns',
      heading: 'If you are worried about a young member',
      railLabel: 'Concerns',
      body: [
        {
          kind: 'note',
          tone: 'warn',
          text: 'If a child is in immediate danger, contact your local emergency services first. Then tell us, so we can act on the account.',
        },
        {
          kind: 'para',
          text: 'Report through the in-app report control and email %privacyEmail%. Safeguarding reports are triaged ahead of everything else, may be acted on immediately without notice to the account holder, and are reported to the relevant authorities where the law requires it.',
        },
        {
          kind: 'para',
          text: 'Safeguarding records are kept for %caseRetention%, longer than ordinary moderation records, because that is what a later investigation needs.',
        },
      ],
    },
  ],
}

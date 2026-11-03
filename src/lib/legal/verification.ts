import type { LegalDocument } from './types'

/**
 * How an account earns the verified badge, how long it lasts, and how it is
 * taken away. Mirrors migrations 139 (the gate), 145 (email tracks), 174
 * (revoke, hold, history), 175 (term and renewal) and 176 (organisation
 * codes). If one of those changes what a member experiences, this changes
 * with it and the version goes up.
 *
 * Informational: published, never prompted. The reviewer procedure behind it
 * is docs/VERIFICATION-SOP.md, kept out of the repository.
 */
export const VERIFICATION: LegalDocument = {
  key: 'verification',
  version: 1,
  effectiveDate: '2026-11-02',
  bundle: 'informational',
  title: 'Verification Policy',
  summary:
    'What the verified badge means, the ways to earn it, how long it lasts, and what happens when it is removed.',
  relatedKeys: ['privacy', 'acceptable-use', 'funding-disclaimer', 'safeguarding'],
  sections: [
    {
      id: 'what-it-means',
      heading: 'What verification means',
      railLabel: 'What it means',
      summary: 'Anyone can read KTIP. Posting, applying and messaging need a verified account.',
      body: [
        {
          kind: 'para',
          text: 'A verified badge means we hold evidence that the account belongs to a real person, and, where it says so, that they work or study where they claim. You can browse KTIP without it.',
        },
        {
          kind: 'para',
          text: 'You need it to post or sponsor a funding call, apply for funding, create a project or an event, post or comment in the forums, submit a resource, offer mentorship, or start a conversation with someone new.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'The two administrator seats are exempt, so that somebody can always work through the review queue.',
        },
      ],
    },
    {
      id: 'ways-to-verify',
      heading: 'Ways to get verified',
      railLabel: 'Ways to verify',
      summary: 'A work or school email, your institution, a code from your organisation, or an identity document.',
      body: [
        {
          kind: 'para',
          text: 'Open Settings, then Verification. The page offers the routes that fit your account. They are listed here from the quickest to the slowest.',
        },
        {
          kind: 'defs',
          items: [
            {
              term: 'A work or school email address',
              def: 'If your address is at an organisation we trust, such as oecs.int or a member-state ministry, confirming it verifies you straight away. If it is not the address you signed up with, we email it a link and you press Confirm on the page that opens. Gmail, Outlook, Yahoo and other free email services never count.',
            },
            {
              term: 'Your school or college',
              def: 'At a partner institution, students are approved automatically, from a list of addresses the institution gave us, or by one of its educators. Teaching staff are added by the institution.',
            },
            {
              term: 'A code from your organisation',
              def: 'If your organisation has no email domain we trust, an administrator of a verified business, school or college can give you a one-time code. Type it into the Verification page.',
            },
            {
              term: 'An identity document',
              def: 'Upload it, and a KTIP reviewer checks it. Reviewers are told as soon as a document arrives.',
            },
          ],
        },
        {
          kind: 'para',
          text: 'Some roles need more than the badge. Government, intergovernmental, NGO, research institution and diaspora roles are confirmed by a trusted email domain or by a reviewer. Student and faculty roles are confirmed by the institution. Administrator roles are only ever given by hand.',
        },
      ],
    },
    {
      id: 'documents',
      heading: 'Identity documents',
      railLabel: 'Documents',
      body: [
        {
          kind: 'list',
          items: [
            'A passport, a national identity card or a driving licence, valid on the day you upload it.',
            'For an organisation role, a letter on the organisation’s letterhead, dated in the last three months, saying what you do there and giving a contact who can confirm it.',
            'PDF, JPEG, PNG or WebP files, up to 10 MB each, and up to three files per request.',
          ],
        },
        {
          kind: 'para',
          text: 'The reviewer checks that the name matches your profile, that the document is readable and current, and that it supports the role you asked for. You can cover your document number and anything else the reviewer does not need. Never upload bank details or card numbers.',
        },
      ],
    },
    {
      id: 'how-long',
      heading: 'How long it lasts',
      railLabel: 'How long',
      summary: 'A badge from an email address, institution or code lasts 12 months and can be renewed.',
      body: [
        {
          kind: 'para',
          text: 'A badge earned through a work or school address, an institution or a code depends on you still being there, so it lasts 12 months. We remind you 30 days and 7 days before it ends.',
        },
        {
          kind: 'para',
          text: 'To renew, confirm the same address again. If you are no longer there, verify another way. A code-based badge renews with a new code.',
        },
        {
          kind: 'para',
          text: 'If the badge ends, nothing you published is removed. You can keep reading, but the actions listed above are locked until you verify again.',
        },
        {
          kind: 'para',
          text: 'A badge earned with an identity document, or given by a reviewer, does not expire. It can still be reviewed.',
        },
      ],
    },
    {
      id: 'organisation-codes',
      heading: 'Codes from your organisation',
      railLabel: 'Codes',
      summary: 'An organisation that issues a code is vouching for the person who uses it.',
      body: [
        {
          kind: 'para',
          text: 'Only a business, school or college that is itself verified can issue codes. Within it, only its owners and administrators can do so, or its educators, for students. Each code works once, lasts up to 30 days and can be tied to one email address.',
        },
        {
          kind: 'para',
          text: 'When you issue a code, you are telling KTIP that the person who uses it works or studies with you. In return:',
        },
        {
          kind: 'list',
          items: [
            'Give each code to one person you know, directly. Never post codes in public.',
            'Withdraw the badge from the Verification page when someone leaves.',
            'Cancel any code that was given to the wrong person or never used.',
          ],
        },
        {
          kind: 'para',
          text: 'We record who issued each code and who used it. An organisation whose codes are misused can lose the ability to issue them, and its own verification may be reviewed.',
        },
      ],
    },
    {
      id: 'removal',
      heading: 'When verification is removed',
      railLabel: 'Removal',
      body: [
        {
          kind: 'para',
          text: 'A reviewer can remove a badge if the evidence was false or given in error, if the person has left the organisation the badge relied on, or if the account breaks the Acceptable Use Policy. An organisation can withdraw a badge that rests on its own code.',
        },
        {
          kind: 'para',
          text: 'Whoever removes a badge must record a reason, and we send that reason to you. A reviewer can also pause the automatic routes, so that the same email address or code cannot verify the account again until a reviewer lifts the pause.',
        },
        {
          kind: 'para',
          text: 'If we stop trusting an email domain, people already verified through it keep their badge until it next needs renewing.',
        },
      ],
      actions: [{ label: 'Acceptable Use Policy', href: '/legal/acceptable-use' }],
    },
    {
      id: 'review',
      heading: 'Asking for a decision to be reviewed',
      railLabel: 'Review',
      body: [
        {
          kind: 'para',
          text: 'If you think a refusal or a removal is wrong, email %supportEmail% from the address on your account. Say which decision you mean and why. A reviewer who did not make the original decision will look at it, and we will reply within %verificationReviewPeriod%.',
        },
      ],
    },
    {
      id: 'records',
      heading: 'What we keep',
      railLabel: 'Records',
      body: [
        {
          kind: 'list',
          items: [
            'How and when each account was verified, renewed or removed, who decided, and why. You can see your own history on the Verification page, without the reviewer’s name.',
            'Identity documents, in private storage that only reviewers can open, through links that stop working after an hour. They are kept while your account is open. After a decision, you can ask %privacyEmail% to delete them, and your badge stays.',
            'Codes, stored only in a scrambled form that cannot be turned back into the code.',
          ],
        },
        {
          kind: 'para',
          text: 'Your rights over this information are set out in the Privacy Policy.',
        },
      ],
      actions: [{ label: 'Privacy Policy', href: '/legal/privacy' }],
    },
    {
      id: 'limits',
      heading: 'What a badge does not tell you',
      railLabel: 'Limits',
      body: [
        {
          kind: 'para',
          text: 'A badge is a check made at a point in time. It is not an endorsement by %entityShort%, and it tells you nothing about someone’s finances, qualifications or intentions. Before sending money or documents to anyone, read the Grant and Funding Disclaimer.',
        },
      ],
      actions: [{ label: 'Grant & Funding Disclaimer', href: '/legal/funding-disclaimer' }],
    },
  ],
}

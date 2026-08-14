import type { LegalDocument } from './types'

/**
 * The conduct rules, written as prohibitions with the reason attached rather
 * than as a bare list, because a rule whose purpose is visible is a rule people
 * can apply to a case it does not literally name.
 */
export const ACCEPTABLE_USE: LegalDocument = {
  key: 'acceptable-use',
  version: 1,
  effectiveDate: '2026-09-01',
  bundle: 'account',
  title: 'Acceptable Use & Community Guidelines',
  summary:
    'What you may and may not post or do on KTIP, how we enforce it, and how to report something that breaks the rules.',
  relatedKeys: ['terms', 'safeguarding', 'copyright', 'funding-disclaimer'],
  sections: [
    {
      id: 'what-this-is-for',
      heading: 'What this is for',
      railLabel: 'Purpose',
      body: [
        {
          kind: 'para',
          text: 'KTIP exists so that innovators, students, mentors, investors and institutions across the OECS can find each other and build things together. Every rule below is here because breaking it makes that harder for someone else.',
        },
        {
          kind: 'para',
          text: 'These guidelines apply everywhere on the platform, including private messages, collaborative documents and video rooms — private does not mean unregulated.',
        },
      ],
    },
    {
      id: 'respect',
      heading: 'Treat other members decently',
      railLabel: 'Respect',
      body: [
        { kind: 'para', text: 'Do not:' },
        {
          kind: 'list',
          ordered: true,
          items: [
            'Post unlawful, defamatory, harassing, hateful or discriminatory content, including content targeting someone for their nationality, island of origin, race, religion, sex, gender, sexual orientation, disability or age.',
            'Harass, bully, threaten, intimidate or stalk another member, on or off the platform.',
            'Publish another person’s private information — home address, phone number, identity documents, private messages — without their consent.',
            'Create or use an account to evade a block, a suspension or a restriction.',
          ],
        },
        {
          kind: 'para',
          text: 'Disagreement is fine and criticism of an idea is welcome. The line is at the person.',
        },
      ],
    },
    {
      id: 'minors',
      heading: 'Content involving minors',
      railLabel: 'Minors',
      summary: 'Zero tolerance, acted on immediately, reported where required.',
      body: [
        {
          kind: 'note',
          tone: 'warn',
          text: 'Do not post sexual content, and do not post any content that sexualises, endangers or exploits a minor. There is no warning step for this and no appeal in the ordinary sense: accounts are removed and the matter is reported to the authorities where the law requires it.',
        },
        {
          kind: 'para',
          text: 'Do not attempt to contact a member identified as a minor outside the supervised channels the platform provides, and do not ask a minor to move a conversation to another service.',
        },
      ],
      actions: [{ label: 'Minor Safeguarding Statement', href: '/legal/safeguarding' }],
    },
    {
      id: 'honesty',
      heading: 'Be honest about who you are and what you are offering',
      railLabel: 'Honesty',
      body: [
        {
          kind: 'list',
          ordered: true,
          items: [
            'Do not impersonate another person, organisation, institution or funder.',
            'Do not misrepresent your credentials, your affiliation, your role, or a verification status you do not hold.',
            'Do not misrepresent a grant, project, event or organisation — including its funding, its outcomes, its partners or its endorsements.',
            'Do not post spam, unsolicited bulk promotion, pyramid or multi-level schemes, or fraudulent investment or funding offers.',
            'Do not ask another member to pay a fee in order to receive a grant, a placement or an opportunity. No legitimate funder on this platform works that way.',
          ],
        },
      ],
      actions: [{ label: 'Grant & Funding Disclaimer', href: '/legal/funding-disclaimer' }],
    },
    {
      id: 'other-peoples-work',
      heading: 'Respect other people’s work',
      railLabel: 'IP',
      body: [
        {
          kind: 'para',
          text: 'Only publish material you own or are licensed to publish. That includes text, images, logos, video, audio, datasets, slide decks and code. If you use someone else’s work under a licence, follow its attribution terms.',
        },
        {
          kind: 'para',
          text: 'If you believe your work has been posted here without permission, the Copyright & Takedown Policy sets out how to have it removed and how the person who posted it can respond.',
        },
      ],
      actions: [
        { label: 'Copyright & Takedown Policy', href: '/legal/copyright' },
        { label: 'Report infringement', href: '/legal/copyright/report' },
      ],
    },
    {
      id: 'platform-integrity',
      heading: 'Do not attack or abuse the platform',
      railLabel: 'Integrity',
      body: [
        {
          kind: 'list',
          ordered: true,
          items: [
            'Do not upload malware, or content designed to compromise another member’s device or account.',
            'Do not scrape, crawl or bulk-extract platform data, and do not circumvent rate limits, access controls or the API’s authentication.',
            'Do not probe, load-test or attack the platform’s security without written authorisation. Report vulnerabilities to %privacyEmail% instead — we would rather hear from you than about you.',
            'Do not manipulate points, badges, leaderboards, reactions or view counts, whether by automation, duplicate accounts or coordinated activity.',
            'Do not resell or sublicense access to KTIP.',
          ],
        },
      ],
    },
    {
      id: 'ai-use',
      heading: 'Using AI features responsibly',
      railLabel: 'AI use',
      body: [
        {
          kind: 'para',
          text: 'You may use the AI features to draft, improve and translate your own work. You may not use them to generate content that breaks any rule above, and you must not present AI output as verified fact where its accuracy matters to someone else — a grant application, a funding claim, a safety instruction.',
        },
        {
          kind: 'para',
          text: 'Do not paste another person’s confidential information into an AI feature. What you submit is processed by the providers listed in the Privacy Policy.',
        },
      ],
      actions: [{ label: 'AI Use Disclosure', href: '/legal/ai-disclosure' }],
    },
    {
      id: 'reporting',
      heading: 'Reporting something',
      railLabel: 'Reporting',
      body: [
        {
          kind: 'para',
          text: 'Every project, post, comment, profile and message has a report control. Use it — a report reaches the moderation queue with a snapshot of the content attached, so it survives the author editing or deleting it afterwards.',
        },
        {
          kind: 'defs',
          items: [
            { term: 'Conduct and content', def: 'Use the in-app report control, or the grievance form for something involving a specific member.' },
            { term: 'Copyright', def: 'Use the infringement report form, which is open to people without an account.' },
            { term: 'A child at risk', def: 'Report in-app and contact %privacyEmail%. These are triaged ahead of everything else.' },
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Do not file reports in bad faith. Reporting is counted per member, and using it as a weapon against someone you disagree with is itself a breach of these guidelines.',
        },
      ],
      actions: [{ label: 'Report infringement', href: '/legal/copyright/report' }],
    },
    {
      id: 'enforcement',
      heading: 'What happens when a rule is broken',
      railLabel: 'Enforcement',
      body: [
        {
          kind: 'para',
          text: 'Responses are scaled to the breach and to whether it is repeated. In rough order: a warning, removal of the content, quarantine of the content pending review, restriction of a feature, suspension of the account, and termination.',
        },
        {
          kind: 'para',
          text: 'Some content is quarantined automatically when several members report it, before a moderator has looked at it. That is a holding action, not a finding, and it is reversed if the review clears the content.',
        },
        {
          kind: 'para',
          text: 'Where it is practical we tell you what was actioned and why, and you can appeal to %legalEmail%. Safeguarding cases involving minors are acted on immediately and explained afterwards.',
        },
      ],
    },
  ],
}

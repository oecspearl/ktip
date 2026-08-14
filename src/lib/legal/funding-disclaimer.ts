import type { LegalDocument } from './types'

/**
 * The target for every `<Disclaimer variant="funding">`. Its real job is the
 * `warning-signs` section: a regional innovation platform listing grants is an
 * obvious place to run an advance-fee scam, and the people most exposed are the
 * ones the platform exists to help.
 */
export const FUNDING_DISCLAIMER: LegalDocument = {
  key: 'funding-disclaimer',
  version: 1,
  effectiveDate: '2026-09-01',
  bundle: 'informational',
  title: 'Grant & Funding Disclaimer',
  summary:
    'Grants and opportunities on KTIP are published by their sponsors, not vetted guarantees. How to check one, and the warning signs of a funding scam.',
  relatedKeys: ['application-confidentiality', 'terms', 'acceptable-use', 'competition-ip'],
  sections: [
    {
      id: 'what-a-listing-is',
      heading: 'What a listing on KTIP is',
      railLabel: 'What it is',
      body: [
        {
          kind: 'para',
          text: 'Grants, funding calls, events, competitions and partner offerings on KTIP are published by their sponsors. A listing means a sponsor said this opportunity exists. It is not a guarantee by %entityShort% that the money exists, that the deadline is right, that the process is fair, or that you will be paid.',
        },
        {
          kind: 'note',
          tone: 'warn',
          text: '%entityShort% is not a party to any agreement you reach with a sponsor and does not disburse funds unless it is expressly the named funder. Where it is the named funder, the listing says so.',
        },
      ],
    },
    {
      id: 'what-we-check',
      heading: 'What we do and do not check',
      railLabel: 'Vetting',
      body: [
        {
          kind: 'defs',
          items: [
            {
              term: 'We do check',
              def: 'That the listing organisation holds a KTIP account in good standing, and that the listing does not obviously breach the Acceptable Use rules. Verified organisations have been confirmed by an institution or chamber at some point in time.',
            },
            {
              term: 'We do not check',
              def: 'That the funds are available, that the terms are reasonable, that the timeline will hold, that the selection is fair, or that the sponsor will honour an award. We are not able to audit a third party’s finances.',
            },
          ],
        },
        {
          kind: 'para',
          text: 'A verification badge reflects a check made at a point in time and can be revoked. Treat it as one signal among several, not as a guarantee.',
        },
      ],
    },
    {
      id: 'warning-signs',
      heading: 'Warning signs of a funding scam',
      railLabel: 'Warning signs',
      summary: 'The one rule worth memorising: no real funder charges you to receive a grant.',
      body: [
        {
          kind: 'note',
          tone: 'warn',
          text: 'No legitimate funder asks you to pay a fee in order to receive a grant. Not an administration fee, not a processing fee, not a legal fee, not a currency-conversion fee, not a deposit that will be refunded. If you are asked, it is a scam — stop and report it.',
        },
        { kind: 'para', text: 'Other signs worth stopping over:' },
        {
          kind: 'list',
          ordered: true,
          items: [
            'Pressure to decide quickly, or a deadline that keeps moving closer.',
            'A request to move the conversation off the platform immediately, to a personal email address or a messaging app.',
            'A request for your bank credentials, your card details, or a copy of your identity document before any agreement exists.',
            'An award you did not apply for.',
            'An email address or a domain that is nearly but not quite the organisation it claims to be.',
            'A request to receive money and forward part of it to someone else.',
            'Refusal to put terms in writing, or a written agreement with no named legal entity in it.',
          ],
        },
        {
          kind: 'para',
          text: 'Report anything matching these through the in-app report control, and tell us at %supportEmail%. Reporting one attempt protects everyone else the same sender contacted.',
        },
      ],
    },
    {
      id: 'before-you-commit',
      heading: 'Before you send money, documents or data',
      railLabel: 'Checklist',
      body: [
        {
          kind: 'list',
          ordered: true,
          items: [
            'Find the funder’s own website independently — type the name into a search engine rather than following the link you were sent — and confirm the call exists there.',
            'Check the legal entity’s name and registration, not just its brand.',
            'Contact the organisation through details you found yourself, not details supplied to you.',
            'Read the funding agreement, including what rights it takes over your work, before signing.',
            'Take professional advice for anything significant. This platform cannot give it to you.',
          ],
        },
        {
          kind: 'para',
          text: 'Applying through KTIP does not license your idea to the funder — that protection is set out in the Grant Application Confidentiality & IP Terms. What you sign afterwards is a different matter, and it is yours to negotiate.',
        },
      ],
      actions: [
        { label: 'Grant Application Confidentiality & IP', href: '/legal/application-confidentiality' },
      ],
    },
    {
      id: 'ai-assistance',
      heading: 'AI help with applications',
      railLabel: 'AI',
      body: [
        {
          kind: 'para',
          text: 'The AI features that help you draft an application, and the indicative read they give on your draft, are assistance and not assessment. They do not predict whether you will be funded, they carry no weight with the funder, and they can be wrong about eligibility rules and deadlines. Check those against the listing itself.',
        },
      ],
      actions: [{ label: 'AI Use Disclosure', href: '/legal/ai-disclosure' }],
    },
    {
      id: 'if-it-goes-wrong',
      heading: 'If something goes wrong',
      railLabel: 'If it goes wrong',
      body: [
        {
          kind: 'para',
          text: 'Report the listing and the account through the in-app controls, and email %supportEmail% with what happened. We can remove listings, suspend accounts and warn other members. We cannot recover money that has left your account — for that, contact your bank and your local police immediately, and do it before contacting us if the loss is recent.',
        },
      ],
    },
  ],
}

import type { LegalDocument } from './types'

/**
 * The clause applicants actually care about is `no-licence`: submitting a
 * proposal must not hand the funder a licence to the idea. Everything else here
 * exists to make that promise operable — who reads it, what they are bound by,
 * and how long it survives.
 */
export const APPLICATION_CONFIDENTIALITY: LegalDocument = {
  key: 'application-confidentiality',
  version: 1,
  effectiveDate: '2026-09-01',
  bundle: 'application',
  title: 'Grant Application Confidentiality & IP',
  summary:
    'Your application is confidential, submitting it licenses nothing to the funder, and only named people read it. Here is exactly who, and for how long.',
  relatedKeys: ['funding-disclaimer', 'content-licence', 'competition-ip', 'privacy'],
  sections: [
    {
      id: 'confidential',
      heading: 'Your application is confidential',
      railLabel: 'Confidential',
      summary: 'Never published, never listed, never shown to other applicants.',
      body: [
        {
          kind: 'para',
          text: 'A grant or funding application you submit through KTIP is treated as confidential. It is never published, never listed in the directory, never indexed by a search engine, and never shown to other applicants — including applicants to the same call.',
        },
        {
          kind: 'para',
          text: 'This is the opposite of the default for projects and events. Publishing a project is a deliberate act with its own agreement; submitting an application is not publishing.',
        },
      ],
    },
    {
      id: 'no-licence',
      heading: 'Submitting does not license your idea',
      railLabel: 'No licence',
      summary: 'The funder gets to assess it. That is all.',
      body: [
        {
          kind: 'note',
          tone: 'info',
          text: 'Submitting an application grants the funder the right to read, assess and decide on it. It grants no licence to use, build, commercialise or file protection over what it describes — whether or not the application succeeds.',
        },
        {
          kind: 'para',
          text: 'You keep ownership of everything in the application: the proposal, the budget, the technical description, the attachments, and any work already done that you describe in it.',
        },
        {
          kind: 'para',
          text: 'If a funder is awarded the right to use your work, that comes from the funding agreement you sign with them afterwards — a separate document, negotiated separately, that you are free not to sign. It never comes from the act of applying.',
        },
      ],
    },
    {
      id: 'who-reads-it',
      heading: 'Who reads your application',
      railLabel: 'Who reads it',
      body: [
        {
          kind: 'defs',
          items: [
            {
              term: 'The named funder',
              def: 'The organisation running the call you applied to, as named on the grant listing.',
            },
            {
              term: 'Reviewers appointed for that call',
              def: 'People the funder appoints to assess applications, which may include external experts. Each is bound by the obligations in the next section.',
            },
            {
              term: 'Platform staff',
              def: 'Only where necessary to operate the platform, provide support you asked for, or investigate a report. Those accesses are logged.',
            },
          ],
        },
        {
          kind: 'para',
          text: 'Nobody else. Not other funders, not partners, not the public, and not other members of your own organisation unless you added them to the application yourself.',
        },
        {
          kind: 'para',
          text: 'Aggregate reporting to programme funders — how many applications a call received, from which countries, in which sectors — uses figures that cannot be traced back to an individual application.',
        },
      ],
    },
    {
      id: 'reviewer-obligations',
      heading: 'What reviewers are bound by',
      railLabel: 'Reviewers',
      body: [
        { kind: 'para', text: 'Everyone who reads your application in an assessment role must:' },
        {
          kind: 'list',
          ordered: true,
          items: [
            'Keep it confidential, and not discuss it outside the assessment.',
            'Use it only to assess the application it belongs to.',
            'Not copy, retain or circulate it beyond what the assessment requires.',
            'Declare a conflict of interest and step aside — including where they are working on something competing.',
            'Not approach you outside the platform about the substance of your application.',
          ],
        },
        {
          kind: 'para',
          text: 'If you believe an application of yours has been misused, contact %legalEmail%. We can act on a funder’s or reviewer’s access to the platform, and we will tell you what we found.',
        },
      ],
    },
    {
      id: 'unsuccessful',
      heading: 'Applications that are not funded',
      railLabel: 'Unsuccessful',
      body: [
        {
          kind: 'para',
          text: 'An unsuccessful application may not be used for anything beyond the record of the decision. A funder may not take an idea from a rejected application and pursue it, commission it from someone else, or fold it into their own programme design.',
        },
        {
          kind: 'note',
          tone: 'warn',
          text: 'That is what the rule says, and it is worth being realistic about what a rule can do. Confidentiality obligations are enforceable but not self-enforcing. If your proposal turns on something you can protect — a patentable method, a trade secret — take advice about protecting it before you describe it in detail to anyone, including a funder.',
        },
      ],
    },
    {
      id: 'drafts',
      heading: 'Drafts and autosave',
      railLabel: 'Drafts',
      body: [
        {
          kind: 'para',
          text: 'Applications are saved as you work, so that a closed tab does not cost you an afternoon. A draft is visible only to you until you submit it — the funder sees nothing, not even that a draft exists.',
        },
        {
          kind: 'para',
          text: 'You can delete a draft at any time. Once submitted, an application can be withdrawn, but the funder will already have received it.',
        },
      ],
    },
    {
      id: 'ai-assistance',
      heading: 'AI assistance on applications',
      railLabel: 'AI',
      body: [
        {
          kind: 'para',
          text: 'The application tools include AI features that suggest improvements to your text and give an indicative assessment of your draft. Text you send to those features is processed by the AI provider listed in the Privacy Policy in order to answer, and is not used to train their models.',
        },
        {
          kind: 'para',
          text: 'The indicative assessment is not a score, not a prediction, and carries no weight with the funder — it never leaves your draft. Treat it as a second read, not a verdict.',
        },
      ],
      actions: [{ label: 'AI Use Disclosure', href: '/legal/ai-disclosure' }],
    },
    {
      id: 'retention',
      heading: 'How long applications are kept',
      railLabel: 'Retention',
      body: [
        {
          kind: 'para',
          text: 'Applications are retained while the call is live and afterwards for the period the programme’s own audit and reporting obligations require. Funders and reviewers lose access when the call closes and the decisions are final.',
        },
        {
          kind: 'para',
          text: 'You can request deletion of an unsuccessful application at %privacyEmail%. Where an audit obligation prevents deletion we will tell you, and say when it expires.',
        },
      ],
    },
    {
      id: 'no-guarantee',
      heading: 'What this document does not do',
      railLabel: 'Limits',
      body: [
        {
          kind: 'para',
          text: 'It does not guarantee that a listed grant exists, that funds will be disbursed, or that the funder will behave well. %entityShort% is not a party to your agreement with a funder unless it is expressly the named funder. Read the Grant & Funding Disclaimer before you send anyone money or documents.',
        },
      ],
      actions: [{ label: 'Grant & Funding Disclaimer', href: '/legal/funding-disclaimer' }],
    },
  ],
}

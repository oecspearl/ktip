import type { LegalDocument } from './types'

/**
 * Fills a real gap: EventSolutionsPanel accepts hackathon entries today under no
 * ownership terms at all. The default position throughout is that a prize buys
 * publicity rights and nothing else — an assignment-by-default rule would be
 * both unusual for a regional development programme and a reason for good teams
 * not to enter.
 */
export const COMPETITION_IP: LegalDocument = {
  key: 'competition-ip',
  version: 1,
  effectiveDate: '2026-09-01',
  bundle: 'competition',
  title: 'Submission & Competition IP Terms',
  summary:
    'What happens to your idea when you enter a hackathon, challenge or pitch on KTIP — who owns it, who may see it, and what a prize does and does not buy.',
  relatedKeys: ['content-licence', 'application-confidentiality', 'copyright', 'funding-disclaimer'],
  sections: [
    {
      id: 'you-own-your-entry',
      heading: 'You own your entry',
      railLabel: 'Ownership',
      summary: 'Entering assigns nothing. Winning assigns nothing either.',
      body: [
        {
          kind: 'para',
          text: 'You keep ownership of everything in your entry — the idea, the code, the design, the prototype, the pitch deck, the video. Entering a competition on KTIP transfers no intellectual property to %entityShort%, to the event organiser, or to a sponsor.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'This holds whether you win or not. A prize is a prize, not a purchase. If a particular competition needs different terms — because a sponsor is funding development of the winning entry, for example — those terms must be published in the competition rules before entries open, and you will be asked to accept them separately.',
        },
      ],
    },
    {
      id: 'licence-to-run-it',
      heading: 'The licence you grant so the competition can run',
      railLabel: 'Licence',
      body: [
        {
          kind: 'para',
          text: 'To make judging and announcement possible, you grant %entity% and the organiser of the event you entered a non-exclusive, royalty-free licence to:',
        },
        {
          kind: 'list',
          ordered: true,
          items: [
            'Store your entry and show it to the judges and organisers of that competition.',
            'Show it to other entrants and attendees, where the competition’s format is a public showcase, demo day or open vote.',
            'Reproduce your entry’s title, summary, images and your team’s names in announcing results, in event coverage, and in reporting to the programme’s funders.',
          ],
        },
        {
          kind: 'para',
          text: 'That licence covers running and reporting the competition. It does not permit anyone to build your idea, license it onward, or use it commercially.',
        },
      ],
    },
    {
      id: 'who-sees-it',
      heading: 'Who can see your entry',
      railLabel: 'Who sees it',
      body: [
        {
          kind: 'defs',
          items: [
            { term: 'Judges and organisers', def: 'Always. They cannot evaluate what they cannot read.' },
            {
              term: 'Sponsors of that event',
              def: 'Where the competition rules say so. Sponsors are bound by the restrictions in the next section.',
            },
            {
              term: 'Other entrants and the public',
              def: 'Only where the format is a public showcase or open vote, and only after entries close. This is stated on the event before you enter.',
            },
            { term: 'Platform staff', def: 'Where necessary to operate the platform or investigate a report. Those accesses are logged.' },
          ],
        },
        {
          kind: 'note',
          tone: 'warn',
          text: 'A public showcase is public. If your entry contains something you intend to patent, or a trade secret, do not put it in the parts of the entry that will be shown — describe the result rather than the method. Disclosure can affect your ability to obtain a patent later, and that is a decision only you can make.',
        },
      ],
    },
    {
      id: 'what-others-may-not-do',
      heading: 'What organisers and sponsors may not do',
      railLabel: 'Restrictions',
      summary: 'Especially with entries that did not win.',
      body: [
        {
          kind: 'para',
          text: 'An organiser or sponsor who receives your entry through KTIP may not:',
        },
        {
          kind: 'list',
          ordered: true,
          items: [
            'Build, commercialise or file intellectual-property protection over your entry, or a work derived from it, without a separate written agreement with you.',
            'Pass it to a third party outside the judging process.',
            'Use an unsuccessful entry for any purpose beyond the record of the competition itself.',
            'Contact you outside the platform using details taken from your entry, other than about the competition.',
          ],
        },
        {
          kind: 'para',
          text: 'If you believe an entry of yours has been used in breach of this, contact %legalEmail%. We can act on the organiser’s access to the platform; whether to pursue the organiser directly is your decision.',
        },
      ],
    },
    {
      id: 'teams',
      heading: 'Entries by a team',
      railLabel: 'Teams',
      body: [
        {
          kind: 'para',
          text: 'Where an entry is submitted by a team, the member who submits it confirms that every contributor has agreed to it being entered on these terms. Ownership between team members is a matter between you — KTIP records who submitted and who was credited, and takes no view on the shares.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Agree in writing who owns what before you enter, not after you win. A one-paragraph note between the team is enough, and it is by far the most common thing teams regret not having done.',
        },
      ],
    },
    {
      id: 'existing-work',
      heading: 'Work you did not create',
      railLabel: 'Third-party work',
      body: [
        {
          kind: 'para',
          text: 'You confirm that your entry is your own work, or that you are licensed to use everything in it. Open-source libraries, stock images, datasets, fonts and pre-trained models all come with terms — follow them and credit them in your entry.',
        },
        {
          kind: 'para',
          text: 'An entry found to infringe someone else’s rights may be disqualified, and a prize already awarded may be withdrawn.',
        },
      ],
      actions: [{ label: 'Open-Source & Code Contribution Terms', href: '/legal/code-contribution' }],
    },
    {
      id: 'sponsor-rules',
      heading: 'The event’s own rules',
      railLabel: 'Event rules',
      body: [
        {
          kind: 'para',
          text: 'Individual competitions may publish their own rules — eligibility, deadlines, judging criteria, prize conditions. Those apply alongside this document. Where a competition rule would take more of your rights than this document does, it has no effect unless it was published before entries opened and you accepted it separately.',
        },
        {
          kind: 'para',
          text: '%entityShort% is not a party to any agreement you reach with a sponsor, and does not guarantee that a prize will be awarded or paid. The Grant & Funding Disclaimer applies to competition prizes as it does to grants.',
        },
      ],
      actions: [{ label: 'Grant & Funding Disclaimer', href: '/legal/funding-disclaimer' }],
    },
    {
      id: 'withdrawing',
      heading: 'Withdrawing an entry',
      railLabel: 'Withdrawal',
      body: [
        {
          kind: 'para',
          text: 'You can withdraw an entry before judging closes, and we will remove it from the competition. After results are announced, the record that you entered and what you were awarded remains — a competition result that can be edited afterwards is not a result.',
        },
      ],
    },
  ],
}

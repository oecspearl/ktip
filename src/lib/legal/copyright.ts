import type { LegalDocument } from './types'

/**
 * The strike mechanics here are deliberately outcome-based rather than
 * notice-based: a policy that counts filings is a policy anyone can use to
 * remove a competitor by filing three notices. Only an actioned notice that
 * survives a counter-notice counts, which is also what migration 117 enforces
 * in `counts_as_strike`.
 */
export const COPYRIGHT: LegalDocument = {
  key: 'copyright',
  version: 1,
  effectiveDate: '2026-09-01',
  bundle: 'publishing',
  title: 'Copyright & Takedown Policy',
  summary:
    'How to report content that infringes your rights, how the member who posted it can respond, and what happens to accounts that infringe repeatedly.',
  relatedKeys: ['content-licence', 'acceptable-use', 'trademark', 'terms'],
  sections: [
    {
      id: 'summary',
      heading: 'In short',
      railLabel: 'In short',
      body: [
        {
          kind: 'para',
          text: 'If work you own has been published on KTIP without your permission, tell us and we will look at it. You do not need a KTIP account to file a notice. If your content is removed because of a notice you believe is wrong, you can file a counter-notice and have it restored.',
        },
      ],
      actions: [{ label: 'Report infringement', href: '/legal/copyright/report' }],
    },
    {
      id: 'agent',
      heading: 'Where to send a notice',
      railLabel: 'Agent',
      body: [
        {
          kind: 'para',
          text: 'Notices go to %copyrightAgent%, %address%, or by email to %copyrightEmail%. The quickest route is the online form, which asks for everything a valid notice needs and cannot be filed incomplete.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Use this route for copyright, and for trade mark or design-right complaints. For harassment, impersonation, fraud or content involving a minor, use the in-app report control instead — those reach a different queue that is triaged faster.',
        },
      ],
      actions: [{ label: 'File a notice', href: '/legal/copyright/report' }],
    },
    {
      id: 'what-a-notice-needs',
      heading: 'What a notice must contain',
      railLabel: 'Notice',
      body: [
        {
          kind: 'list',
          ordered: true,
          items: [
            'Your name, your email address, and the organisation you represent if any.',
            'Whether you are the owner of the right, or an agent authorised to act for the owner.',
            'A description of the work you own, specific enough for us to recognise it.',
            'The address on KTIP of the content you say infringes it. One notice per item.',
            'A statement of why you believe it infringes.',
          ],
        },
        { kind: 'para', text: 'You must also affirm, separately, all three of the following:' },
        {
          kind: 'list',
          ordered: true,
          items: [
            'That you believe in good faith the use is not authorised by the owner, an agent, or the law.',
            'That the information in your notice is accurate.',
            'That you are the owner of the right, or authorised to act on the owner’s behalf.',
          ],
        },
        {
          kind: 'note',
          tone: 'warn',
          text: 'A notice made in bad faith — to remove a competitor, to silence criticism, or over work you do not own — may make you liable for the resulting damages, and we will decline further notices from you.',
        },
      ],
    },
    {
      id: 'what-we-do',
      heading: 'What we do with a notice',
      railLabel: 'Process',
      body: [
        {
          kind: 'list',
          ordered: true,
          items: [
            'We acknowledge your notice by email and give it a reference.',
            'We take a snapshot of the content, so that the review survives the author editing or deleting it.',
            'We review the notice. If it is incomplete we come back to you rather than rejecting it silently.',
            'If we act on it, the content is removed or made inaccessible, and the member who posted it is told what was removed, why, and who filed the notice.',
            'If we do not act on it, we tell you why. A notice we decline is not a finding that you are wrong — it may simply be outside what this process can resolve.',
          ],
        },
        {
          kind: 'para',
          text: 'We are not a court and we do not decide who owns a work. What we decide is whether content should stay up while the people concerned resolve it between themselves.',
        },
      ],
    },
    {
      id: 'counter-notice',
      heading: 'If your content was removed',
      railLabel: 'Counter-notice',
      summary: 'You will be told, and you can have it restored by filing a counter-notice.',
      body: [
        {
          kind: 'para',
          text: 'If content of yours is removed after a notice, you will be notified with the substance of the complaint and the identity of the complainant, and you can file a counter-notice from your account.',
        },
        { kind: 'para', text: 'A counter-notice needs:' },
        {
          kind: 'list',
          ordered: true,
          items: [
            'Identification of the content that was removed and where it was.',
            'A statement that you believe in good faith it was removed as a result of a mistake or a misidentification.',
            'Your contact details, and your consent to those details being passed to the complainant.',
          ],
        },
        {
          kind: 'para',
          text: 'We pass the counter-notice to the complainant. Unless they tell us within a reasonable period that they have started legal proceedings, we restore the content, and the notice stops counting against your account.',
        },
      ],
    },
    {
      id: 'repeat-infringers',
      heading: 'Repeat infringement',
      railLabel: 'Repeat',
      summary: 'Counted on outcomes, not on filings. %strikeLimit% standing notices ends the account.',
      body: [
        {
          kind: 'para',
          text: 'An account that repeatedly publishes infringing material is terminated. A notice counts against an account only when we have actioned it and it has not been reversed by a counter-notice — filings alone never count, because otherwise the policy could be used as a weapon by anyone willing to file.',
        },
        {
          kind: 'list',
          items: [
            'A first standing notice is a warning, with an explanation of what was removed and why.',
            'Further standing notices restrict publishing while we review the account.',
            'At %strikeLimit% standing notices the account is terminated and its published content removed.',
          ],
        },
        {
          kind: 'para',
          text: 'A standing notice reversed by a counter-notice is removed from the count. You can see any notices filed against your content, and their current status, from your account.',
        },
        {
          kind: 'para',
          text: 'Serious cases — commercial-scale infringement, or repeat infringement after a warning — may be terminated without waiting for the count.',
        },
      ],
    },
    {
      id: 'appeals',
      heading: 'Appeals',
      railLabel: 'Appeals',
      body: [
        {
          kind: 'para',
          text: 'If your account is restricted or terminated under this policy and you believe that is wrong, write to %legalEmail% with the reference from the notification. Appeals are reviewed by someone who was not involved in the original decision.',
        },
      ],
    },
    {
      id: 'privacy-of-notices',
      heading: 'What happens to the information in a notice',
      railLabel: 'Notice privacy',
      body: [
        {
          kind: 'para',
          text: 'A notice names you and describes your claim, and both are passed to the member whose content it concerns — they cannot answer a complaint they cannot see. A counter-notice is passed to the complainant for the same reason.',
        },
        {
          kind: 'para',
          text: 'Notices and counter-notices are retained for %caseRetention%. We do not publish them, and we do not pass them to anyone other than the parties concerned unless the law requires it.',
        },
      ],
    },
  ],
}

import type { LegalDocument } from './types'

/**
 * The document the publishing gate shows. It has to do two jobs at once: grant
 * a licence broad enough to actually run the platform, and reassure an author
 * that publishing here does not cost them their work. The negative clause in
 * `licence-limits` is doing most of the second job.
 */
export const CONTENT_LICENCE: LegalDocument = {
  key: 'content-licence',
  version: 1,
  effectiveDate: '2026-09-01',
  bundle: 'publishing',
  title: 'IP, Content & Licensing Policy',
  summary:
    'What you keep, what you grant %entityShort%, what we may never do with your work, and what happens to it when you delete it.',
  relatedKeys: ['copyright', 'competition-ip', 'code-contribution', 'trademark', 'terms'],
  sections: [
    {
      id: 'ownership',
      heading: 'You keep what you make',
      railLabel: 'Ownership',
      summary: 'Publishing on KTIP transfers no ownership of anything.',
      body: [
        {
          kind: 'para',
          text: 'You keep ownership of every project, event listing, forum post, comment, document, whiteboard, code snippet, CV and organisation profile you publish on KTIP. Nothing on this platform transfers copyright, assigns a patent, or hands over a trade mark or design right.',
        },
        {
          kind: 'para',
          text: 'If you publish on behalf of an organisation, you confirm that you are authorised to license its material on the terms below.',
        },
        {
          kind: 'para',
          text: 'If several people made something together — a project team, a group of co-authors — each of you needs the right to license their part before it is published here.',
        },
      ],
    },
    {
      id: 'licence-granted',
      heading: 'The licence you grant %entityShort%',
      railLabel: 'Licence',
      summary: 'Non-exclusive, worldwide, royalty-free, and only for running and promoting the platform.',
      body: [
        {
          kind: 'para',
          text: 'To show your work to other members, you grant %entity% a non-exclusive, worldwide, royalty-free licence to host, store, reproduce, translate, adapt for display and distribute your content — solely to operate and promote KTIP and its programme objectives.',
        },
        { kind: 'para', text: 'In practice, each of those words does a specific job:' },
        {
          kind: 'defs',
          items: [
            { term: 'Host and store', def: 'Your content sits in our database and file storage, and in backups of them.' },
            { term: 'Reproduce and distribute', def: 'It is served to the members who are allowed to see it, and to search engines if you marked it public.' },
            {
              term: 'Translate',
              def: 'Machine translation into French and Spanish so that the whole region can read it. Translated text is marked as machine-translated wherever it appears.',
            },
            {
              term: 'Adapt for display',
              def: 'Cropping an image to fit a card, generating a preview or thumbnail, extracting a summary for a listing, building a search index. Formatting work, not editorial work.',
            },
            {
              term: 'Promote the platform',
              def: 'Featuring your published project or event in a KTIP newsletter, a showcase page, a conference slide or a programme report. Only content you already made public, always attributed to you.',
            },
          ],
        },
        { kind: 'para', text: 'The licence is non-exclusive, so you remain free to publish the same work anywhere else, on any terms you like.' },
      ],
      actions: [{ label: 'How machine translation works', href: '/legal/ai-disclosure#machine-translation' }],
    },
    {
      id: 'licence-limits',
      heading: 'What the licence does not allow',
      railLabel: 'Limits',
      summary: 'No sale, no onward licensing, no unrelated advertising, no AI training on your work by us.',
      body: [
        { kind: 'para', text: 'The licence above is limited to running and promoting KTIP. It specifically does not permit %entityShort% to:' },
        {
          kind: 'list',
          ordered: true,
          items: [
            'Sell your content, or charge a third party for access to it.',
            'Sublicense it to another organisation for that organisation’s own purposes.',
            'Use it in advertising for a product or programme unconnected with KTIP.',
            'Use it to train a machine-learning model, our own or anyone else’s.',
            'Claim authorship of it, or publish it without attribution to you.',
            'Alter its meaning. Adapting for display is not editing your argument.',
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Content you submit to an AI feature — a draft you ask the assistant to improve, a document you ask it to extract fields from — is sent to the provider running that feature so it can answer. That is a separate matter from the licence above, and it is described in the AI Use Disclosure.',
        },
      ],
      actions: [{ label: 'AI Use Disclosure', href: '/legal/ai-disclosure' }],
    },
    {
      id: 'public-content',
      heading: 'What "public" means',
      railLabel: 'Public',
      body: [
        {
          kind: 'para',
          text: 'When you mark a project, event or profile as public, it can be read by anyone — including people with no KTIP account — and it may be indexed by search engines, quoted, linked to and archived by services outside our control.',
        },
        {
          kind: 'note',
          tone: 'warn',
          text: 'Publishing is not reversible in the way deleting is. We can stop serving your content; we cannot remove it from a search engine’s index, a web archive or somebody’s screenshot. Think about that before publishing anything commercially sensitive, and use a private project until you are ready.',
        },
      ],
    },
    {
      id: 'ending-the-licence',
      heading: 'When the licence ends',
      railLabel: 'Deletion',
      body: [
        {
          kind: 'para',
          text: 'The licence ends when you delete the content or your account — with two exceptions, both of which are about other people rather than about us:',
        },
        {
          kind: 'list',
          ordered: true,
          items: [
            'Content already shared into another member’s context — a direct message, a collaborative document, a whiteboard, a group chat — stays in that context. We cannot reach into someone else’s conversation and remove your half of it.',
            'Content we are legally required to retain, such as material attached to a live moderation, copyright or safeguarding case, is held for the period set out in the Privacy Policy and then deleted.',
          ],
        },
        {
          kind: 'para',
          text: 'Copies already made by others under the public-content rule above, including search-engine caches, are outside our control.',
        },
      ],
      actions: [{ label: 'Delete your account', href: '/settings?tab=security' }],
    },
    {
      id: 'others-work',
      heading: 'Using other people’s work',
      railLabel: 'Other work',
      body: [
        {
          kind: 'para',
          text: 'Only publish material you own or are licensed to publish, and follow the attribution terms of anything you use under a licence. If you include third-party material — a photograph, a dataset, a library, a figure from a paper — say where it came from.',
        },
        {
          kind: 'para',
          text: 'Uploading someone else’s logo or brand to a profile or an event asserts that you have the right to use it. The Trademark & Brand Use policy covers that in detail.',
        },
      ],
      actions: [
        { label: 'Trademark & Brand Use', href: '/legal/trademark' },
        { label: 'Open-Source & Code Contribution Terms', href: '/legal/code-contribution' },
      ],
    },
    {
      id: 'takedown',
      heading: 'If someone claims your content infringes their rights',
      railLabel: 'Takedown',
      body: [
        {
          kind: 'para',
          text: 'A rightsholder can file an infringement notice against content on KTIP, whether or not they hold an account. If one is filed against yours, you will be told, and you can respond with a counter-notice. The full process — what a notice must contain, what happens to the content while it is reviewed, and what repeated notices lead to — is in the Copyright & Takedown Policy.',
        },
      ],
      actions: [{ label: 'Copyright & Takedown Policy', href: '/legal/copyright' }],
    },
    {
      id: 'feedback',
      heading: 'Feedback and suggestions',
      railLabel: 'Feedback',
      body: [
        {
          kind: 'para',
          text: 'If you send us a suggestion for how KTIP itself should work — a feature idea, a bug report, a design comment — we may act on it without owing you payment or attribution, and without it becoming confidential. This applies to feedback about the platform only, and never to the work you publish on it.',
        },
      ],
    },
  ],
}

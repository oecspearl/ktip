import type { LegalDocument } from './types'

/**
 * The umbrella agreement. Deliberately thin on the subjects that have their own
 * document — content licensing, AI output, funding, safeguarding, copyright —
 * because a clause restated in two places is a clause that will disagree with
 * itself at the second revision. Those sections point out instead.
 */
export const TERMS: LegalDocument = {
  key: 'terms',
  version: 1,
  effectiveDate: '2026-09-01',
  bundle: 'account',
  title: 'Terms of Use',
  summary:
    'The agreement between you and %entityShort% for using KTIP — who may hold an account, how you must behave, and where the limits of our responsibility sit.',
  relatedKeys: [
    'privacy',
    'acceptable-use',
    'content-licence',
    'ai-disclosure',
    'funding-disclaimer',
    'safeguarding',
  ],
  sections: [
    {
      id: 'agreement',
      heading: 'The agreement',
      railLabel: 'Agreement',
      summary: 'Creating an account accepts these Terms and the Privacy Policy.',
      body: [
        {
          kind: 'para',
          text: 'These Terms of Use are an agreement between you and %entity%. By creating an account on KTIP, or by using the platform at %platformDomain% without one, you accept them and the Privacy Policy.',
        },
        {
          kind: 'para',
          text: 'If you use KTIP on behalf of an organisation — an employer, an institution, a chamber, a funder — you confirm that you are authorised to accept these Terms on its behalf, and "you" in this document means both you and that organisation.',
        },
        {
          kind: 'para',
          text: 'Several subjects have their own documents. Where one applies, it governs that subject and this document does not repeat it. The full set is listed under See also at the foot of this page.',
        },
      ],
    },
    {
      id: 'eligibility',
      heading: 'Who may hold an account',
      railLabel: 'Eligibility',
      summary: 'Minimum age %minimumAge%, a truthful date of birth, one account per person.',
      body: [
        {
          kind: 'list',
          items: [
            'You must be at least %minimumAge% years old, or the higher minimum age set by the law of the country you live in, whichever is greater.',
            'Every account must declare a date of birth — including accounts created through Google, Microsoft or Virtual Campus single sign-on, because no sign-in provider supplies one.',
            'The declaration must be truthful. A false declaration, and in particular one that presents a minor as an adult, is grounds for immediate suspension.',
            'One account per person. Do not create an account for someone else, and do not share yours.',
          ],
        },
        {
          kind: 'para',
          text: 'Accounts identified as belonging to minors operate in supervised mode, with restricted messaging and collaboration features that are not user-configurable. How that works, and why the date of birth is handled the way it is, is set out in the Minor Safeguarding Statement.',
        },
      ],
      actions: [{ label: 'Minor Safeguarding Statement', href: '/legal/safeguarding' }],
    },
    {
      id: 'your-account',
      heading: 'Your account',
      railLabel: 'Account',
      body: [
        {
          kind: 'para',
          text: 'You are responsible for the accuracy of your details, for the security of your credentials, and for everything done under your account. Tell us at %supportEmail% as soon as you believe someone else has access to it.',
        },
        {
          kind: 'para',
          text: 'Do not impersonate another person or organisation, and do not misrepresent your affiliation with one. Roles that require verification — student and faculty status in particular — are granted only after an institution or chamber confirms them. Claiming one falsely is a breach of these Terms and of the Acceptable Use policy.',
        },
      ],
    },
    {
      id: 'conduct',
      heading: 'How you must behave',
      railLabel: 'Conduct',
      summary: 'The rules live in the Acceptable Use & Community Guidelines.',
      body: [
        {
          kind: 'para',
          text: 'The rules for what you may post and how you may treat other members are set out in full in the Acceptable Use & Community Guidelines. Breaching them is breaching these Terms.',
        },
      ],
      actions: [
        { label: 'Acceptable Use & Community Guidelines', href: '/legal/acceptable-use' },
      ],
    },
    {
      id: 'your-content',
      heading: 'Your content',
      railLabel: 'Content',
      summary: 'You keep ownership. The licence you grant is set out separately.',
      body: [
        {
          kind: 'para',
          text: 'You keep ownership of everything you post. To display your work to other members we need a limited licence from you, and the exact scope of that licence — what it permits, what it does not permit, and when it ends — is set out in the IP, Content & Licensing Policy.',
        },
        {
          kind: 'note',
          tone: 'warn',
          text: 'Content you mark as public can be read by anyone and may be indexed by search engines. We can stop serving it; we cannot make a search engine forget it.',
        },
      ],
      actions: [{ label: 'IP, Content & Licensing Policy', href: '/legal/content-licence' }],
    },
    {
      id: 'other-agreements',
      heading: 'Agreements that apply to particular activities',
      railLabel: 'Other terms',
      body: [
        {
          kind: 'para',
          text: 'Some parts of KTIP carry their own terms, which you are asked to accept the first time you use them:',
        },
        {
          kind: 'defs',
          items: [
            {
              term: 'Publishing',
              def: 'The IP, Content & Licensing Policy and the Copyright & Takedown Policy apply the first time you publish a project, event, forum post, CV or organisation profile.',
            },
            {
              term: 'Competitions',
              def: 'The Submission & Competition IP Terms apply the first time you enter a hackathon or submit a solution to an event.',
            },
            {
              term: 'Grant applications',
              def: 'The Grant Application Confidentiality & IP Terms apply the first time you submit an application to a funder.',
            },
            {
              term: 'Partner data access',
              def: 'The Partner API Terms apply to any organisation reading platform data through our partner API.',
            },
          ],
        },
      ],
    },
    {
      id: 'ai',
      heading: 'AI features',
      railLabel: 'AI',
      summary: 'Output may be wrong. It is not advice. You remain responsible.',
      body: [
        {
          kind: 'para',
          text: 'KTIP includes AI-assisted search, chat, field extraction, CV parsing, machine translation and moderation support. Output may be inaccurate or incomplete, it is not professional, legal, financial or academic advice, and you remain responsible for anything you publish or act on because of it. What each feature does and where your text goes is set out in the AI Use Disclosure.',
        },
      ],
      actions: [{ label: 'AI Use Disclosure', href: '/legal/ai-disclosure' }],
    },
    {
      id: 'funding',
      heading: 'Grants, funding and events',
      railLabel: 'Funding',
      body: [
        {
          kind: 'para',
          text: 'Grant listings, funding opportunities, events and partner offerings on KTIP are published by their sponsors. %entityShort% does not guarantee their accuracy, availability or outcome, is not a party to any agreement you reach with a sponsor, and does not disburse funds unless it is expressly the named funder.',
        },
        {
          kind: 'note',
          tone: 'warn',
          text: 'Verify any funding opportunity independently before sending money, documents or personal data. No legitimate funder on this platform will ask you to pay a fee to receive a grant.',
        },
      ],
      actions: [{ label: 'Grant & Funding Disclaimer', href: '/legal/funding-disclaimer' }],
    },
    {
      id: 'verification',
      heading: 'Verification, badges and points',
      railLabel: 'Badges',
      body: [
        {
          kind: 'para',
          text: 'A verification badge reflects a check made at a point in time. It can be revoked if the underlying status changes or if the check turns out to have been wrong, and it is not a warranty by %entityShort% about the member who holds it.',
        },
        {
          kind: 'para',
          text: 'Points, badges and leaderboard positions have no monetary value, are not transferable, and may be recalculated or reset — for example when scoring changes or when we remove the effects of gamed activity.',
        },
      ],
    },
    {
      id: 'moderation',
      heading: 'Moderation and enforcement',
      railLabel: 'Enforcement',
      body: [
        {
          kind: 'para',
          text: 'Where we reasonably believe these Terms or the law have been breached, or where safeguarding requires it, we may remove content, restrict features, suspend or terminate an account, and report the matter to the authorities.',
        },
        {
          kind: 'para',
          text: 'Where it is practical to do so we give notice and a route to appeal, at %legalEmail%. Two exceptions: safeguarding cases involving minors may be acted on immediately without prior notice, and content subject to a copyright notice is handled under the Copyright & Takedown Policy, which has its own counter-notice route.',
        },
      ],
      actions: [{ label: 'Copyright & Takedown Policy', href: '/legal/copyright' }],
    },
    {
      id: 'third-parties',
      heading: 'Third-party services',
      railLabel: 'Third parties',
      body: [
        {
          kind: 'para',
          text: 'Sign-in providers, the OECS Virtual Campus and Commons, video collaboration, machine translation and partner APIs are operated by other organisations under their own terms. We are not responsible for their availability, their conduct, or the content they supply. The providers who process your data on our behalf are listed in the Privacy Policy.',
        },
      ],
    },
    {
      id: 'availability',
      heading: 'Availability',
      railLabel: 'Availability',
      body: [
        {
          kind: 'para',
          text: 'KTIP is provided "as is" and "as available". We do not warrant uninterrupted or error-free operation, and we may change, suspend or discontinue features. Planned maintenance is announced where practical.',
        },
        {
          kind: 'para',
          text: 'Keep your own copy of anything you cannot afford to lose. Export tools are provided for exactly that purpose.',
        },
      ],
    },
    {
      id: 'liability',
      heading: 'Limitation of liability',
      railLabel: 'Liability',
      body: [
        {
          kind: 'para',
          text: 'To the maximum extent permitted by law, %entity% is not liable for indirect, incidental, special, consequential or punitive damages, nor for lost profits, lost opportunities, lost funding or data loss arising from your use of KTIP.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Nothing in these Terms limits liability for death or personal injury caused by negligence, for fraud or fraudulent misrepresentation, or for anything else that cannot lawfully be limited. Mandatory consumer-protection rights in your country of residence are unaffected.',
        },
      ],
    },
    {
      id: 'indemnity',
      heading: 'Indemnity',
      railLabel: 'Indemnity',
      body: [
        {
          kind: 'para',
          text: 'You will indemnify %entity% against claims, losses and reasonable legal costs arising from content you publish, from your use of the platform, or from your breach of these Terms. This does not apply to the extent the claim arises from our own breach or negligence.',
        },
      ],
    },
    {
      id: 'termination',
      heading: 'Ending your account',
      railLabel: 'Termination',
      body: [
        {
          kind: 'para',
          text: 'You may delete your account at any time in Settings. What happens to your content afterwards is set out in the IP, Content & Licensing Policy and in the retention table of the Privacy Policy.',
        },
        {
          kind: 'para',
          text: 'The sections on your content (existing licences), limitation of liability, indemnity and governing law survive the end of this agreement.',
        },
      ],
      actions: [{ label: 'Delete your account', href: '/settings?tab=security' }],
    },
    {
      id: 'governing-law',
      heading: 'Governing law',
      railLabel: 'Law',
      body: [
        {
          kind: 'para',
          text: 'These Terms are governed by the laws of %jurisdiction%, and its courts have exclusive jurisdiction — without prejudice to any mandatory consumer-protection rights, or any right to bring a claim before a data-protection authority, in the country where you live.',
        },
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to these Terms',
      railLabel: 'Changes',
      body: [
        {
          kind: 'para',
          text: 'We may amend these Terms. Material changes are announced in the application and by email at least %noticePeriod% before they take effect, and you will be asked to accept the new version. The version number and effective date at the top of this page always reflect what is currently in force.',
        },
        {
          kind: 'para',
          text: 'Every version you have accepted, and the date you accepted it, is listed in your settings.',
        },
      ],
      actions: [{ label: 'What you have agreed to', href: '/settings?tab=legal' }],
    },
    {
      id: 'contact',
      heading: 'Contact',
      railLabel: 'Contact',
      body: [
        {
          kind: 'para',
          text: '%entity%, %address%. General enquiries %supportEmail%. Legal notices and appeals %legalEmail%. Privacy and data rights %privacyEmail%.',
        },
      ],
    },
  ],
}

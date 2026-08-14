import type { LegalDocument } from './types'

/**
 * The target for every `<Disclaimer variant="ai">` link, and for the machine
 * translation mark. Written feature by feature rather than as one general
 * warning, because "AI can make mistakes" tells a member nothing about whether
 * their grant text left the country.
 */
export const AI_DISCLOSURE: LegalDocument = {
  key: 'ai-disclosure',
  version: 1,
  effectiveDate: '2026-09-01',
  bundle: 'informational',
  title: 'AI Use Disclosure',
  summary:
    'Every place KTIP uses AI, what each feature does with your text, how reliable it is, and what it is never allowed to decide on its own.',
  relatedKeys: ['privacy', 'terms', 'acceptable-use', 'content-licence'],
  sections: [
    {
      id: 'the-short-version',
      heading: 'The short version',
      railLabel: 'In short',
      body: [
        {
          kind: 'note',
          tone: 'warn',
          text: 'AI features can be wrong, and they are wrong most convincingly when the subject is specific — a deadline, an eligibility rule, a figure, a name. Check anything that matters before you rely on it or publish it.',
        },
        {
          kind: 'para',
          text: 'AI output on KTIP is not professional, legal, financial, medical or academic advice. You remain responsible for what you publish or act on, whichever tool helped you write it.',
        },
      ],
    },
    {
      id: 'where-we-use-it',
      heading: 'Where we use AI',
      railLabel: 'Where',
      body: [
        {
          kind: 'table',
          columns: ['Feature', 'What it does', 'What it receives'],
          rows: [
            {
              cells: [
                'Assistant chat',
                'Answers questions about the platform and helps you draft text',
                'The messages you send it',
              ],
            },
            {
              cells: [
                'AI search',
                'Interprets a search phrase and suggests where in KTIP to go',
                'Your search phrase and a map of the site',
              ],
            },
            {
              cells: [
                'Field extraction',
                'Reads an uploaded document and proposes values for form fields',
                'The text of the document you uploaded',
              ],
            },
            {
              cells: [
                'Application assistance',
                'Suggests improvements to your application text and gives an indicative read on a draft',
                'The draft text you ask it to work on',
              ],
            },
            { cells: ['CV parsing', 'Turns an uploaded CV into structured profile fields', 'The text of your CV'] },
            {
              cells: [
                'Machine translation',
                'Translates member-written content between English, French and Spanish',
                'The text being translated',
              ],
            },
            {
              cells: [
                'Moderation assistance',
                'Gives moderators a second opinion on a queued report',
                'The reported content',
              ],
            },
            {
              cells: [
                'Live captions',
                'Transcribes speech in video rooms where captions are switched on',
                'Room audio while captions are running',
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'where-your-text-goes',
      heading: 'Where your text goes',
      railLabel: 'Providers',
      body: [
        {
          kind: 'para',
          text: 'Text submitted to an AI feature is sent to the provider that runs it — OpenAI for the assistant, search, extraction and moderation support; OpenRouter or Azure AI Translator for machine translation. They process it to produce the answer and return it to us.',
        },
        {
          kind: 'list',
          items: [
            'Your content is not used by us to train any model.',
            'We do not send an AI feature anything you did not submit to it. Asking the assistant a question does not give it your messages, your drafts or your files.',
            'Translation results are cached so that the next reader of the same content does not trigger a second call.',
          ],
        },
        {
          kind: 'note',
          tone: 'warn',
          text: 'Do not paste someone else’s confidential information into an AI feature. That includes another member’s private message, an application you are reviewing, and a document shared with you in confidence.',
        },
      ],
      actions: [{ label: 'Processors we use', href: '/legal/privacy#processors' }],
    },
    {
      id: 'machine-translation',
      heading: 'Machine translation',
      railLabel: 'Translation',
      summary: 'Content written by members is machine-translated and marked as such.',
      body: [
        {
          kind: 'para',
          text: 'KTIP’s own interface is translated by people. Content written by members — project descriptions, event copy, forum posts, resources — is translated by machine so that the region can read each other’s work without waiting for a translator.',
        },
        {
          kind: 'para',
          text: 'Machine-translated text carries a marker wherever it appears, and you can always switch back to the original. Where a translation and the original disagree, the original is what the author wrote.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'The legal documents on this site are a deliberate exception in one direction: they are translated too, but the English text is the authoritative version, and every legal page says so at the top.',
        },
      ],
    },
    {
      id: 'what-ai-never-decides',
      heading: 'What AI is never allowed to decide',
      railLabel: 'Limits',
      body: [
        {
          kind: 'para',
          text: 'No decision that affects your account or your work is made by an AI feature on its own:',
        },
        {
          kind: 'list',
          ordered: true,
          items: [
            'Moderation. The assistant gives a moderator a second opinion. A human decides, and a human is accountable for the decision.',
            'Grant assessment. The indicative read on your draft is for you, never leaves your draft, and carries no weight with the funder.',
            'Verification. Student, faculty and organisation status is confirmed by an institution or chamber, not inferred.',
            'Extraction. Fields proposed from a document are shown to you for review and are not saved until you accept them.',
          ],
        },
        {
          kind: 'para',
          text: 'If you believe an automated process has affected you unfairly, write to %privacyEmail%. You are entitled to a human review of it.',
        },
      ],
    },
    {
      id: 'your-responsibilities',
      heading: 'Your side of it',
      railLabel: 'Your part',
      body: [
        {
          kind: 'para',
          text: 'You may use these features to draft, improve and translate your own work. You must not use them to produce content that breaks the Acceptable Use rules, and you must not present AI output as verified fact where its accuracy matters to someone else.',
        },
        {
          kind: 'para',
          text: 'You do not have to disclose that you used AI to help write something. You do have to stand behind what you publish.',
        },
      ],
      actions: [{ label: 'Acceptable Use & Community Guidelines', href: '/legal/acceptable-use' }],
    },
    {
      id: 'turning-it-off',
      heading: 'Turning it off',
      railLabel: 'Opting out',
      body: [
        {
          kind: 'para',
          text: 'The AI features are optional. The assistant, AI search, extraction and application assistance only run when you invoke them. Automatic translation of member content can be switched off in Settings, and captions are per-room and off unless switched on.',
        },
      ],
      actions: [{ label: 'Your settings', href: '/settings?tab=legal' }],
    },
  ],
}

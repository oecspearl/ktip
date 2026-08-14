import type { LegalDocument } from './types'

/**
 * The default in `default-licence` is the conservative one — sharing a snippet
 * does not license it — because the alternative silently licenses work an author
 * may never have meant to give away. The cost is that shared code is not legally
 * reusable until its author declares a licence, which is why the document pushes
 * hard on declaring one. FLAGGED FOR COUNSEL: this default is a policy choice,
 * not a legal necessity, and the opposite default is defensible if the platform
 * would rather optimise for reuse.
 */
export const CODE_CONTRIBUTION: LegalDocument = {
  key: 'code-contribution',
  version: 1,
  effectiveDate: '2026-09-01',
  bundle: 'informational',
  title: 'Open-Source & Code Contribution Terms',
  summary:
    'What happens to code, documents and whiteboards you share on KTIP — who may use them, how to license them so others actually can, and your obligations for code you did not write.',
  relatedKeys: ['content-licence', 'copyright', 'competition-ip', 'terms'],
  sections: [
    {
      id: 'you-own-it',
      heading: 'You own what you write',
      railLabel: 'Ownership',
      body: [
        {
          kind: 'para',
          text: 'Code snippets, documents, whiteboards and notes you create on KTIP are yours. %entityShort% claims no ownership of them and takes only the licence needed to host and display them, described in the IP, Content & Licensing Policy.',
        },
        {
          kind: 'para',
          text: 'If you write code as part of your employment or your studies, your employer or institution may own it. That is between you and them, and it is worth checking before you share it here.',
        },
      ],
      actions: [{ label: 'IP, Content & Licensing Policy', href: '/legal/content-licence' }],
    },
    {
      id: 'default-licence',
      heading: 'Sharing is not licensing',
      railLabel: 'Default',
      summary: 'Shared with no declared licence means: readable, not reusable.',
      body: [
        {
          kind: 'note',
          tone: 'warn',
          text: 'Sharing a snippet or document with someone does not give them permission to use it. With no declared licence, the default is all rights reserved: they may read it and discuss it with you, and nothing more.',
        },
        {
          kind: 'para',
          text: 'That default protects authors, and it makes shared code less useful than it looks. If you want people to be able to build on your work — which is usually why you shared it — declare a licence.',
        },
      ],
    },
    {
      id: 'declaring-a-licence',
      heading: 'Declaring a licence',
      railLabel: 'Declaring',
      body: [
        {
          kind: 'para',
          text: 'You can declare a licence on any snippet or document you own. Say which one, in the content itself or in the field provided, and say it plainly — "MIT", "Apache-2.0", "CC BY 4.0" — rather than describing it in your own words.',
        },
        {
          kind: 'defs',
          items: [
            { term: 'MIT or BSD', def: 'Do almost anything, keep the copyright notice. The usual choice for a snippet you want widely reused.' },
            { term: 'Apache-2.0', def: 'Like MIT, with an explicit patent grant and a requirement to note changes.' },
            { term: 'GPL or AGPL', def: 'Derivative works must be shared under the same licence. Choose deliberately — it constrains commercial reuse.' },
            { term: 'CC BY or CC BY-SA', def: 'For documents, diagrams and written material rather than code.' },
            { term: 'All rights reserved', def: 'The default if you say nothing. Readable, not reusable.' },
          ],
        },
        {
          kind: 'para',
          text: 'A declared licence cannot be withdrawn from copies already made under it. That is what makes it a licence rather than a preference.',
        },
      ],
    },
    {
      id: 'using-others-code',
      heading: 'Using code you find here',
      railLabel: 'Reusing',
      body: [
        {
          kind: 'list',
          ordered: true,
          items: [
            'Check for a declared licence before you use anything. No licence means no permission.',
            'Follow the licence you find — attribution, notice retention, share-alike, all of it.',
            'If there is no licence and you want to use the work, ask the author. Most say yes, and now you have it in writing.',
            'Do not strip a copyright notice, a licence header or an attribution comment.',
          ],
        },
      ],
    },
    {
      id: 'third-party-code',
      heading: 'Code you did not write',
      railLabel: 'Third-party',
      summary: 'Open-source licences follow the code into KTIP.',
      body: [
        {
          kind: 'para',
          text: 'When you paste in third-party code — an open-source library, a snippet from a forum, a generated block, an example from documentation — its licence comes with it. Sharing it on KTIP does not reset it.',
        },
        {
          kind: 'list',
          ordered: true,
          items: [
            'Keep licence headers and attribution comments intact.',
            'Say where it came from, so the next reader knows what they are bound by.',
            'Do not paste code you are contractually barred from disclosing, including an employer’s proprietary code.',
            'Do not paste code whose licence you have not read, into a project whose licence you have.',
          ],
        },
        {
          kind: 'para',
          text: 'Code produced with AI assistance is your responsibility to check, in the same way as code from any other source. It can reproduce licensed material, and the licence still applies.',
        },
      ],
      actions: [{ label: 'AI Use Disclosure', href: '/legal/ai-disclosure' }],
    },
    {
      id: 'no-warranty',
      heading: 'Shared code comes with no warranty',
      railLabel: 'No warranty',
      body: [
        {
          kind: 'para',
          text: 'Code and documents shared on KTIP are provided by their authors as is. Neither the author nor %entityShort% warrants that they are correct, secure, fit for any purpose, or free of third-party rights. Review anything before you run it, and never run something you were sent by someone you do not know.',
        },
        {
          kind: 'note',
          tone: 'warn',
          text: 'Do not put credentials, API keys, tokens or connection strings into a snippet, document or whiteboard. Shared surfaces are shared, collaborators can be added later, and a key in a snippet is a key that has leaked.',
        },
      ],
    },
    {
      id: 'collaboration',
      heading: 'Documents and whiteboards with several authors',
      railLabel: 'Collaboration',
      body: [
        {
          kind: 'para',
          text: 'Where several people edit a document or whiteboard, each keeps ownership of their own contribution, and the result is jointly authored. Deleting your account does not remove your contributions from a shared surface — that is the "already shared into another member’s context" exception in the IP, Content & Licensing Policy.',
        },
        {
          kind: 'para',
          text: 'Agree the licensing of a jointly authored work with your collaborators before publishing it, not after.',
        },
      ],
    },
    {
      id: 'contributing-to-ktip',
      heading: 'Contributing to KTIP itself',
      railLabel: 'To KTIP',
      body: [
        {
          kind: 'para',
          text: 'This document is about code you share with other members. If you contribute to the KTIP platform itself — a fix, a translation, a component — that is governed by the contribution terms of the relevant repository, and by any contributor agreement it asks for. Ask at %legalEmail% if there is not one.',
        },
      ],
    },
  ],
}

import type { LegalDocument } from './types'

export const TRADEMARK: LegalDocument = {
  key: 'trademark',
  version: 1,
  effectiveDate: '2026-09-01',
  bundle: 'informational',
  title: 'Trademark & Brand Use',
  summary:
    'When you may use the KTIP and OECS names and logos, when you may not, and what you are asserting when you upload someone else’s logo.',
  relatedKeys: ['content-licence', 'copyright', 'acceptable-use'],
  sections: [
    {
      id: 'our-marks',
      heading: 'Our marks',
      railLabel: 'Our marks',
      body: [
        {
          kind: 'para',
          text: 'The names KTIP and Knowledge, Technology and Innovation Platform, the name and emblem of the Organisation of Eastern Caribbean States, and the logos and visual identity of both, belong to %entity%. Publishing on the platform gives you no licence to them.',
        },
        {
          kind: 'para',
          text: 'The OECS emblem in particular is the mark of an intergovernmental organisation and is protected accordingly. Treat it as more restricted than an ordinary corporate logo, not less.',
        },
      ],
    },
    {
      id: 'permitted',
      heading: 'What you may do without asking',
      railLabel: 'Permitted',
      summary: 'Refer to KTIP truthfully. That is the whole of the permission.',
      body: [
        {
          kind: 'list',
          ordered: true,
          items: [
            'Say that your project, event or organisation is on KTIP, or that you are a member.',
            'Say truthfully that you participated in, were shortlisted for, or won a KTIP event or programme — with the year and the programme named.',
            'Link to your KTIP profile, project or event.',
            'Use the KTIP name in plain text in a sentence that describes your relationship accurately.',
          ],
        },
        {
          kind: 'para',
          text: 'Use the name as written, in the same size and style as the surrounding text. Do not restyle it, abbreviate it, translate it, or fold it into a name of your own.',
        },
      ],
    },
    {
      id: 'not-permitted',
      heading: 'What you may not do',
      railLabel: 'Not permitted',
      body: [
        {
          kind: 'list',
          ordered: true,
          items: [
            'Imply endorsement, partnership, accreditation, sponsorship or approval by %entityShort% that you do not have.',
            'Use our names or logos in your own product name, company name, domain name, application name or social-media handle.',
            'Use our logos on merchandise, packaging, signage or promotional material without written permission.',
            'Alter a logo — recolour it, crop it, stretch it, add to it, or combine it with your own mark.',
            'Register, or attempt to register, a mark or domain that is the same as or confusingly similar to ours.',
            'Use our marks in a way that suggests a funding relationship, or that your organisation speaks for the OECS.',
          ],
        },
        {
          kind: 'note',
          tone: 'warn',
          text: 'The line that matters most: describing what you did is fine, implying who backs you is not. "Winner, KTIP Climate Challenge 2026" is fine. "An OECS-accredited programme" is not, unless you actually are one.',
        },
      ],
    },
    {
      id: 'asking',
      heading: 'Asking for permission',
      railLabel: 'Permission',
      body: [
        {
          kind: 'para',
          text: 'For anything outside the permitted list — a logo on an event backdrop, a co-branded programme, use in a funding application — write to %legalEmail% with what you want to use, where it will appear, and for how long. Permission is given in writing or not at all.',
        },
      ],
    },
    {
      id: 'your-marks',
      heading: 'Logos and brands you upload',
      railLabel: 'Your uploads',
      summary: 'Uploading a logo asserts that you have the right to use it.',
      body: [
        {
          kind: 'para',
          text: 'When you upload a logo, brand or mark to a profile, an organisation page, an event or a project, you confirm that you own it or are authorised to use it in that way, and you accept responsibility for that use.',
        },
        {
          kind: 'para',
          text: 'Do not upload a partner’s, sponsor’s, employer’s or institution’s logo to suggest a relationship that does not exist. Listing an organisation as a sponsor or partner when it is not is a misrepresentation under the Acceptable Use rules as well as a trade mark problem.',
        },
        {
          kind: 'para',
          text: 'If your mark has been used on KTIP without permission, report it through the infringement form — the same route as a copyright notice, and it is open to people without an account.',
        },
      ],
      actions: [
        { label: 'Report infringement', href: '/legal/copyright/report' },
        { label: 'Acceptable Use & Community Guidelines', href: '/legal/acceptable-use' },
      ],
    },
    {
      id: 'other-marks',
      heading: 'Other people’s marks in your content',
      railLabel: 'Other marks',
      body: [
        {
          kind: 'para',
          text: 'You may name another organisation truthfully — a customer, a technology you build on, a competitor you compare yourself with. You may not use their logo or styling to suggest they endorse you, and you should follow their own brand guidelines where they publish them.',
        },
      ],
    },
  ],
}

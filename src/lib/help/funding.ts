import type { HelpCategory } from './types'

export const GRANTS_CATEGORY: HelpCategory = {
  id: 'grants',
  title: 'Funding Opportunities',
  description: 'Find funding that fits your work, and check what you qualify for.',
  icon: 'DollarSign',
  articles: [
    {
      id: 'browse-grants',
      title: 'How do I find funding?',
      content: `Open the Funding menu in the navigation bar and choose "Funding Opportunities" to see every open call.\n\nSearch by keyword, then narrow it with the two filters: type of funding, and focus area. Each listing shows the funding range, the currency, the deadline and the eligibility summary.\n\nThere is no status filter. Calls that have closed move into their own "Closed calls" section further down the page, so what you scroll through at the top is always still open.\n\nOpen a listing for the full detail, including how to apply and who to contact. Deadlines you are tracking also appear on your Dashboard calendar, so they are harder to miss.`,
      tags: ['funding', 'grants', 'browse', 'find', 'money', 'deadline', 'filter'],
    },
    {
      id: 'grant-eligibility',
      title: 'How do I know if I am eligible?',
      content: `Every grant has an Eligibility section describing who may apply.\n\nCriteria commonly cover your role, your member state, the type of project and the phase it is in.\n\nRead it before you start writing. If it is ambiguous, contact the funder using the details on the grant page rather than guessing.\n\nEligibility is separate from your role. Eligibility is the funder's rule about who may apply; your role only decides what you can do on the platform. A student who is eligible submits their own application, with or without a faculty sponsor.`,
      tags: ['eligibility', 'qualify', 'requirements', 'criteria', 'grant'],
    },
    {
      id: 'apply-grant',
      title: 'Applying in KTIP versus on an external site',
      content: `There are two routes, and the funder decides which one you get.\n\nIf the funder supplied their own application link, the listing shows "Apply on External Site" and takes you to their form. Nothing about that application is tracked in KTIP.\n\nOtherwise you get KTIP's built-in six-step wizard, and the whole application — drafts, autosave, AI help, status — lives here under My Applications.\n\nEither way, the deadline on the listing is the one that counts.`,
      tags: ['apply', 'external', 'wizard', 'grant', 'submit', 'deadline'],
    },
    {
      id: 'track-applications',
      title: 'How do I track my funding applications?',
      content: `Go to "My Applications" from the Funding menu.\n\nEvery application you have started in KTIP is listed with its current status: Draft, Pending, Under Review, Approved or Not accepted. Drafts show a Continue action that drops you back at the step where you stopped.\n\nFour counts summarise the page across the top — Submitted, In review, Approved and Drafts — beside a card showing what has been awarded to you.\n\nThere is deliberately no "total requested" figure. Applicants write the amount they are asking for in their own words, so there is nothing dependable to add up.\n\nApplications you submitted on a funder's external site will not appear here — KTIP never sees those.`,
      tags: ['track', 'applications', 'status', 'my applications', 'funding', 'awarded'],
    },
    {
      id: 'grant-types',
      title: 'What kinds of funding are listed?',
      content: `Most of what is listed is not a grant, which is why the section is called Funding Opportunities rather than Grants.\n\nAlongside research grants, startup funding, project grants and scholarships you will find seed investment, competitions and prizes, fellowships, and open calls for proposals. The "type of funding" filter is how you narrow to one kind.\n\nFunders set their own labels, so the exact wording varies between listings.\n\nAmounts, currencies and deadlines differ for every opportunity, and new listings appear regularly — the filters are worth checking more than once.`,
      tags: ['types', 'research', 'startup', 'scholarship', 'funding', 'fellowship', 'competition'],
    },
  ],
}

export const GRANT_APPLICATIONS_CATEGORY: HelpCategory = {
  id: 'grant-applications',
  title: 'Grant Applications',
  description: 'Write, submit and track an application — and run a call of your own.',
  icon: 'FileText',
  articles: [
    {
      id: 'apply-for-grant',
      title: 'How do I use the application wizard?',
      content: `Open a listing and click "Apply Now". Once you have a draft for it, the same button reads "Continue Application".\n\nThe wizard has six steps: Basics, Summary & Problem, Solution & Plan, Budget & Team, Supporting documents, and Impact & Review.\n\nYour work is saved automatically every few seconds, and you can also save a draft explicitly at any point. Leaving the page does not lose anything.\n\nThe final step shows the whole application for review before you submit.`,
      tags: ['apply', 'grant', 'application', 'wizard', 'steps'],
    },
    {
      id: 'application-documents',
      title: 'What do I upload on the Supporting documents step?',
      content: `Step five of the wizard lists exactly what this call asks for. Every funder sets their own list, so read the one on your grant rather than assuming.\n\nA typical list is: a detailed budget covering the full amount requested, proof of registration, recent financial statements, a workplan, and any letters of support. Required items are marked; the rest strengthen the application without being mandatory.\n\nAccepted formats are PDF, Word, Excel, CSV, Markdown, plain text and images, up to 25MB per file. If a file is refused, the reason appears under the file picker — it is either the size or the format, nothing else.\n\nName each file for what it is. An assessor reading twenty applications should be able to tell your budget from your workplan without opening either.\n\nThese files are private. They are attached to your application, visible only to you and the people assessing the grant, and never listed on the public grant page. The Documents panel on the grant page itself is the funder's — it holds the call and its annexes, not your submission.\n\nVideo is the exception: it is too large to upload. If you have a short pitch or demonstration, host it yourself — Google Drive, YouTube, Vimeo — and paste the link in the optional Video link field under the file list. Set sharing to "Anyone with the link can view", and test the link in a private browser window before you submit. The link can point at the video itself or at a folder holding it. It is stored with the application, so assessors see it alongside your documents.`,
      tags: ['documents', 'upload', 'attach', 'budget', 'files', 'supporting', 'evidence', 'private', 'video', 'link', 'drive', 'youtube'],
    },
    {
      id: 'sponsor-nomination',
      title: 'Can a student add a faculty sponsor?',
      content: `Yes, and it is optional. Students submit their own funding applications — a sponsor is an endorsement, not a permission.\n\nOn the review step of the wizard you can nominate one: a member holding the Faculty, Educational Partner or Research Institution role. They receive the nomination and can accept or decline. If they accept, their name appears on the application.\n\nThe application can be submitted with or without one, and nominating someone does not hold up your submission while you wait.\n\nWorth doing anyway. An assessor reading twenty applications treats one an academic has put their name to differently, and the person who endorses it is usually the person who helped you sharpen it.`,
      tags: ['sponsor', 'faculty', 'student', 'nomination', 'submit', 'endorsement', 'optional'],
    },
    {
      id: 'ai-suggestions',
      title: 'How do the AI writing tools work?',
      content: `Every long text field in the wizard has AI tools under it.\n\nImprove — rewrites what you have written to be clearer and more compelling. It needs existing text to work on.\n\nSuggest — drafts content for a section from the grant details and whatever you have written so far. It works on an empty field.\n\nTone — recasts your text as Professional, Persuasive, Academic or Concise.\n\nNothing is applied automatically: you see the suggestion and choose to accept, edit or discard it. On the final step, AI Review scores the complete application and points at the weakest sections.`,
      tags: ['ai', 'suggestions', 'improve', 'generate', 'review', 'tone'],
    },
    {
      id: 'application-autosave',
      title: 'What does the Saving / Saved badge mean?',
      content: `The badge near the top of the wizard reports the state of your draft.\n\n"Saving…" means a write is in flight. "Saved" means your work is safely stored, with the time of the last write.\n\nSaves happen a couple of seconds after you stop typing, so you do not need to save manually — though the Save Draft button forces one if you want the reassurance.\n\nIf the badge stays on "Saving…" your connection has probably dropped. Do not close the tab: fix the connection and let it complete.`,
      tags: ['autosave', 'saving', 'draft', 'saved', 'badge'],
    },
    {
      id: 'resume-draft',
      title: 'How do I continue a draft application?',
      content: `Open "My Applications" under Funding. Drafts carry a Draft badge and a Continue action.\n\nContinue returns you to the step you left, with everything you had written intact.\n\nYou can also go back to the listing itself — the button there reads "Continue Application" once a draft exists, so you never accidentally start a second one.`,
      tags: ['draft', 'resume', 'continue', 'edit', 'save', 'application'],
    },
    {
      id: 'preview-application',
      title: 'Can I preview my application before submitting?',
      content: `Yes. The final step of the wizard renders the complete application as the reviewer will read it, section by section, rather than as a set of form fields.\n\nUse it to catch the things forms hide: a section you left empty, an answer that repeats another one, a budget that does not match the plan.\n\nYou can go back to any step from the preview, fix what you found, and return.`,
      tags: ['preview', 'review', 'check', 'before submit', 'application'],
    },
    {
      id: 'application-status',
      title: 'What do the application statuses mean?',
      content: `Draft — not submitted. Continue to finish it. A draft is yours to submit whenever it is ready; nobody else has to release it for you.\n\nPending — submitted, waiting to be picked up.\n\nUnder Review — a reviewer is actively assessing it.\n\nApproved — successful.\n\nNot accepted — unsuccessful. Where the funder gave feedback, it appears with the decision.\n\nStatus changes reach you through notifications, so you do not have to keep checking the page.`,
      tags: ['status', 'track', 'pending', 'under review', 'approved', 'rejected'],
    },
    {
      id: 'submission-receipt',
      title: 'Where is the copy of what I submitted?',
      content: `Every submitted application and every completed registration form files an immutable copy under Submissions on your Dashboard.\n\nOpen one to see exactly what you sent and when — not the current state of the record, but the snapshot at the moment of submission.\n\nThat matters when a form changes after you filled it in, or when a funder asks what you actually claimed. The receipt is your evidence.`,
      tags: ['receipt', 'submission', 'copy', 'record', 'evidence', 'dashboard'],
    },
  ],
}

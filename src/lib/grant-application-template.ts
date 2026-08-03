// Grant application wizard step definitions.
// Condensed from the former proposal wizard's funding template.

import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

/**
 * `documents` is not a value the applicant types — it renders the upload
 * checklist for the call and stores nothing in application_data. It is a field
 * type rather than a bespoke step so the wizard's stepper, validation and
 * navigation all keep working unchanged.
 */
export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'documents'

export interface FieldConfig {
  name: string
  label: MessageDescriptor
  type: FieldType
  placeholder?: MessageDescriptor
  required?: boolean
  options?: { value: string; label: string }[]
  rows?: number
  helpText?: MessageDescriptor
}

export interface StepConfig {
  title: MessageDescriptor
  description: MessageDescriptor
  fields: FieldConfig[]
}

// Steps 1-4 are standard form steps; step 5 is the upload checklist; step 6
// ("Impact & Review") renders its field above the application preview + AI
// review + submit controls.
export const GRANT_APPLICATION_STEPS: StepConfig[] = [
  {
    title: msg`Basics`,
    description: msg`Provide the foundational details of your application.`,
    fields: [
      { name: 'title', label: msg`Project Title`, type: 'text', placeholder: msg`e.g., Caribbean Youth Digital Skills Initiative`, required: true },
      { name: 'organization', label: msg`Organization / Team`, type: 'text', placeholder: msg`e.g., KTIP Innovation Lab` },
      { name: 'funding_amount', label: msg`Funding Amount Requested`, type: 'text', placeholder: msg`e.g., $50,000 USD` },
      { name: 'start_date', label: msg`Proposed Start Date`, type: 'date' },
      { name: 'end_date', label: msg`Proposed End Date`, type: 'date' },
    ],
  },
  {
    title: msg`Summary & Problem`,
    description: msg`Summarize your application and the problem it addresses.`,
    fields: [
      { name: 'executive_summary', label: msg`Executive Summary`, type: 'textarea', rows: 8, required: true,
        placeholder: msg`Summarize the purpose of the application, the problem being addressed, your approach, and the expected impact.`,
        helpText: msg`Aim for 200-400 words. This is often the first section reviewers read.` },
      { name: 'problem_statement', label: msg`Problem Statement`, type: 'textarea', rows: 6, required: true,
        placeholder: msg`What specific problem or need exists? Who is affected and how?`,
        helpText: msg`Use data and evidence to support the urgency of the problem.` },
      { name: 'target_beneficiaries', label: msg`Target Beneficiaries`, type: 'textarea', rows: 3,
        placeholder: msg`Who will directly benefit from this project? Describe the target population.` },
    ],
  },
  {
    title: msg`Solution & Plan`,
    description: msg`Describe your approach and how you will implement it.`,
    fields: [
      { name: 'proposed_solution', label: msg`Proposed Solution`, type: 'textarea', rows: 6, required: true,
        placeholder: msg`Describe your approach in detail. How will it address the stated problem?` },
      { name: 'implementation_plan', label: msg`Implementation Plan`, type: 'textarea', rows: 4,
        placeholder: msg`Outline key phases, activities, and timeline milestones.` },
    ],
  },
  {
    title: msg`Budget & Team`,
    description: msg`Detail the financial requirements and the team behind the project.`,
    fields: [
      { name: 'budget_breakdown', label: msg`Budget Breakdown`, type: 'textarea', rows: 6, required: true,
        placeholder: msg`List major budget categories and amounts:
- Personnel: $XX,XXX
- Equipment: $XX,XXX
- Travel: $XX,XXX
- Other: $XX,XXX`,
        helpText: msg`Be as specific as possible. Reviewers look for realistic and justified budgets.` },
      { name: 'team_description', label: msg`Team / Personnel`, type: 'textarea', rows: 4,
        placeholder: msg`Describe key team members, their roles, and relevant qualifications.` },
    ],
  },
  {
    title: msg`Supporting documents`,
    description:
      msg`Attach the evidence behind the narrative. Everything you upload here is private to you and the grant assessors — it is never listed on the public grant page.`,
    fields: [
      {
        name: 'documents',
        label: msg`Documents for this application`,
        type: 'documents',
        helpText:
          msg`PDF, Word, Excel, CSV, Markdown, plain text or an image, up to 25MB each. Name each file for what it is, so an assessor can tell them apart without opening them.`,
      },
    ],
  },
  {
    title: msg`Impact & Review`,
    description: msg`Define the expected outcomes, then review and submit your application.`,
    fields: [
      { name: 'expected_outcomes', label: msg`Expected Outcomes`, type: 'textarea', rows: 4, required: true,
        placeholder: msg`What specific, measurable outcomes do you expect to achieve?` },
    ],
  },
]

export const TOTAL_APPLICATION_STEPS = GRANT_APPLICATION_STEPS.length

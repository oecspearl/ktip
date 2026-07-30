// Grant application wizard step definitions.
// Condensed from the former proposal wizard's funding template.

/**
 * `documents` is not a value the applicant types — it renders the upload
 * checklist for the call and stores nothing in application_data. It is a field
 * type rather than a bespoke step so the wizard's stepper, validation and
 * navigation all keep working unchanged.
 */
export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'documents'

export interface FieldConfig {
  name: string
  label: string
  type: FieldType
  placeholder?: string
  required?: boolean
  options?: { value: string; label: string }[]
  rows?: number
  helpText?: string
}

export interface StepConfig {
  title: string
  description: string
  fields: FieldConfig[]
}

// Steps 1-4 are standard form steps; step 5 is the upload checklist; step 6
// ("Impact & Review") renders its field above the application preview + AI
// review + submit controls.
export const GRANT_APPLICATION_STEPS: StepConfig[] = [
  {
    title: 'Basics',
    description: 'Provide the foundational details of your application.',
    fields: [
      { name: 'title', label: 'Project Title', type: 'text', placeholder: 'e.g., Caribbean Youth Digital Skills Initiative', required: true },
      { name: 'organization', label: 'Organization / Team', type: 'text', placeholder: 'e.g., KTIP Innovation Lab' },
      { name: 'funding_amount', label: 'Funding Amount Requested', type: 'text', placeholder: 'e.g., $50,000 USD' },
      { name: 'start_date', label: 'Proposed Start Date', type: 'date' },
      { name: 'end_date', label: 'Proposed End Date', type: 'date' },
    ],
  },
  {
    title: 'Summary & Problem',
    description: 'Summarize your application and the problem it addresses.',
    fields: [
      { name: 'executive_summary', label: 'Executive Summary', type: 'textarea', rows: 8, required: true,
        placeholder: 'Summarize the purpose of the application, the problem being addressed, your approach, and the expected impact.',
        helpText: 'Aim for 200-400 words. This is often the first section reviewers read.' },
      { name: 'problem_statement', label: 'Problem Statement', type: 'textarea', rows: 6, required: true,
        placeholder: 'What specific problem or need exists? Who is affected and how?',
        helpText: 'Use data and evidence to support the urgency of the problem.' },
      { name: 'target_beneficiaries', label: 'Target Beneficiaries', type: 'textarea', rows: 3,
        placeholder: 'Who will directly benefit from this project? Describe the target population.' },
    ],
  },
  {
    title: 'Solution & Plan',
    description: 'Describe your approach and how you will implement it.',
    fields: [
      { name: 'proposed_solution', label: 'Proposed Solution', type: 'textarea', rows: 6, required: true,
        placeholder: 'Describe your approach in detail. How will it address the stated problem?' },
      { name: 'implementation_plan', label: 'Implementation Plan', type: 'textarea', rows: 4,
        placeholder: 'Outline key phases, activities, and timeline milestones.' },
    ],
  },
  {
    title: 'Budget & Team',
    description: 'Detail the financial requirements and the team behind the project.',
    fields: [
      { name: 'budget_breakdown', label: 'Budget Breakdown', type: 'textarea', rows: 6, required: true,
        placeholder: 'List major budget categories and amounts:\n- Personnel: $XX,XXX\n- Equipment: $XX,XXX\n- Travel: $XX,XXX\n- Other: $XX,XXX',
        helpText: 'Be as specific as possible. Reviewers look for realistic and justified budgets.' },
      { name: 'team_description', label: 'Team / Personnel', type: 'textarea', rows: 4,
        placeholder: 'Describe key team members, their roles, and relevant qualifications.' },
    ],
  },
  {
    title: 'Supporting documents',
    description:
      'Attach the evidence behind the narrative. Everything you upload here is private to you and the grant assessors — it is never listed on the public grant page.',
    fields: [
      {
        name: 'documents',
        label: 'Documents for this application',
        type: 'documents',
        helpText:
          'PDF, Word, Excel, CSV, Markdown, plain text or an image, up to 25MB each. Name each file for what it is, so an assessor can tell them apart without opening them.',
      },
    ],
  },
  {
    title: 'Impact & Review',
    description: 'Define the expected outcomes, then review and submit your application.',
    fields: [
      { name: 'expected_outcomes', label: 'Expected Outcomes', type: 'textarea', rows: 4, required: true,
        placeholder: 'What specific, measurable outcomes do you expect to achieve?' },
    ],
  },
]

export const TOTAL_APPLICATION_STEPS = GRANT_APPLICATION_STEPS.length

import TurndownService from 'turndown'
import type { ProposalType } from '../types'

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' })

/** Convert a value to Markdown — handles both HTML (from RichTextField) and plain text */
function toMarkdown(value: string): string {
  if (/<[a-z][\s\S]*>/i.test(value)) {
    return turndown.turndown(value).trim()
  }
  return value.trim()
}

// --- Field & Step Configuration ---

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select'

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

// --- Funding/Grant Proposal Steps ---

const FUNDING_STEPS: StepConfig[] = [
  {
    title: 'Basic Information',
    description: 'Provide the foundational details of your funding proposal.',
    fields: [
      { name: 'title', label: 'Proposal Title', type: 'text', placeholder: 'e.g., Caribbean Youth Digital Skills Initiative', required: true },
      { name: 'organization', label: 'Organization / Team', type: 'text', placeholder: 'e.g., KTIP Innovation Lab' },
      { name: 'funding_amount', label: 'Funding Amount Requested', type: 'text', placeholder: 'e.g., $50,000 USD' },
      { name: 'currency', label: 'Currency', type: 'select', options: [
        { value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }, { value: 'GBP', label: 'GBP' },
        { value: 'XCD', label: 'XCD' }, { value: 'TTD', label: 'TTD' }, { value: 'JMD', label: 'JMD' },
      ]},
      { name: 'start_date', label: 'Proposed Start Date', type: 'date' },
      { name: 'end_date', label: 'Proposed End Date', type: 'date' },
    ],
  },
  {
    title: 'Executive Summary',
    description: 'Provide a concise overview that captures the essence and impact of your proposal.',
    fields: [
      { name: 'executive_summary', label: 'Executive Summary', type: 'textarea', rows: 8, required: true,
        placeholder: 'Summarize the purpose of the proposal, the problem being addressed, your approach, and the expected impact. This should be compelling enough to stand on its own.',
        helpText: 'Aim for 200-400 words. This is often the first section reviewers read.' },
    ],
  },
  {
    title: 'Problem Statement',
    description: 'Clearly articulate the problem or need your proposal addresses.',
    fields: [
      { name: 'problem_statement', label: 'Problem Statement', type: 'textarea', rows: 6, required: true,
        placeholder: 'What specific problem or need exists? Who is affected and how?',
        helpText: 'Use data and evidence to support the urgency of the problem.' },
      { name: 'target_beneficiaries', label: 'Target Beneficiaries', type: 'textarea', rows: 3,
        placeholder: 'Who will directly benefit from this project? Describe the target population.' },
      { name: 'current_gaps', label: 'Current Gaps / Challenges', type: 'textarea', rows: 3,
        placeholder: 'What existing solutions fall short? Why is a new approach needed?' },
    ],
  },
  {
    title: 'Proposed Solution',
    description: 'Describe your approach, methodology, and implementation strategy.',
    fields: [
      { name: 'proposed_solution', label: 'Proposed Solution', type: 'textarea', rows: 6, required: true,
        placeholder: 'Describe your approach in detail. How will it address the stated problem?' },
      { name: 'methodology', label: 'Methodology', type: 'textarea', rows: 4,
        placeholder: 'What methods, tools, and frameworks will you use?' },
      { name: 'implementation_plan', label: 'Implementation Plan', type: 'textarea', rows: 4,
        placeholder: 'Outline key phases, activities, and timeline milestones.' },
      { name: 'innovation', label: 'Innovation / Unique Approach', type: 'textarea', rows: 3,
        placeholder: 'What makes your approach unique or innovative compared to existing solutions?' },
    ],
  },
  {
    title: 'Budget & Resources',
    description: 'Detail the financial requirements and resources needed.',
    fields: [
      { name: 'budget_breakdown', label: 'Budget Breakdown', type: 'textarea', rows: 6, required: true,
        placeholder: 'List major budget categories and amounts:\n- Personnel: $XX,XXX\n- Equipment: $XX,XXX\n- Travel: $XX,XXX\n- Other: $XX,XXX',
        helpText: 'Be as specific as possible. Reviewers look for realistic and justified budgets.' },
      { name: 'team_description', label: 'Team / Personnel', type: 'textarea', rows: 4,
        placeholder: 'Describe key team members, their roles, and relevant qualifications.' },
      { name: 'existing_resources', label: 'Existing Resources', type: 'textarea', rows: 3,
        placeholder: 'What resources (facilities, equipment, partnerships) do you already have?' },
    ],
  },
  {
    title: 'Impact & Outcomes',
    description: 'Define the expected outcomes, success metrics, and sustainability plan.',
    fields: [
      { name: 'expected_outcomes', label: 'Expected Outcomes', type: 'textarea', rows: 4, required: true,
        placeholder: 'What specific, measurable outcomes do you expect to achieve?' },
      { name: 'success_metrics', label: 'Success Metrics / KPIs', type: 'textarea', rows: 3,
        placeholder: 'How will you measure success? List specific indicators and targets.' },
      { name: 'sustainability', label: 'Sustainability Plan', type: 'textarea', rows: 3,
        placeholder: 'How will the project continue after funding ends? What is the long-term vision?' },
      { name: 'broader_impact', label: 'Broader Impact', type: 'textarea', rows: 3,
        placeholder: 'How does this project contribute to the wider community or region?' },
    ],
  },
]

// --- Project Proposal Steps ---

const PROJECT_STEPS: StepConfig[] = [
  {
    title: 'Basic Information',
    description: 'Provide the foundational details of your project proposal.',
    fields: [
      { name: 'title', label: 'Project Title', type: 'text', placeholder: 'e.g., Smart Agriculture Platform for Small Farmers', required: true },
      { name: 'project_type', label: 'Project Type', type: 'select', options: [
        { value: 'software', label: 'Software Development' }, { value: 'research', label: 'Research & Development' },
        { value: 'community', label: 'Community Initiative' }, { value: 'infrastructure', label: 'Infrastructure' },
        { value: 'education', label: 'Education Program' }, { value: 'other', label: 'Other' },
      ]},
      { name: 'duration', label: 'Estimated Duration', type: 'text', placeholder: 'e.g., 6 months' },
      { name: 'team_size', label: 'Team Size', type: 'text', placeholder: 'e.g., 5 members' },
    ],
  },
  {
    title: 'Project Overview',
    description: 'Provide a comprehensive overview of the project.',
    fields: [
      { name: 'executive_summary', label: 'Executive Summary', type: 'textarea', rows: 6, required: true,
        placeholder: 'Provide a high-level overview of the project, its goals, and expected outcomes.' },
      { name: 'objectives', label: 'Objectives', type: 'textarea', rows: 4, required: true,
        placeholder: 'List the key objectives of this project:\n1. \n2. \n3. ' },
      { name: 'background', label: 'Background / Context', type: 'textarea', rows: 4,
        placeholder: 'What context or background information is important for understanding this project?' },
    ],
  },
  {
    title: 'Scope & Deliverables',
    description: 'Define the scope, deliverables, and milestones.',
    fields: [
      { name: 'scope', label: 'Project Scope', type: 'textarea', rows: 4, required: true,
        placeholder: 'Define what is included and excluded from this project.' },
      { name: 'deliverables', label: 'Key Deliverables', type: 'textarea', rows: 4, required: true,
        placeholder: 'List the tangible deliverables:\n1. \n2. \n3. ' },
      { name: 'milestones', label: 'Milestones', type: 'textarea', rows: 4,
        placeholder: 'Define major milestones and their target dates.' },
      { name: 'acceptance_criteria', label: 'Acceptance Criteria', type: 'textarea', rows: 3,
        placeholder: 'How will you determine if deliverables meet quality standards?' },
    ],
  },
  {
    title: 'Methodology',
    description: 'Describe the approach and methodology for executing the project.',
    fields: [
      { name: 'methodology', label: 'Methodology / Approach', type: 'textarea', rows: 6, required: true,
        placeholder: 'Describe the approach you will use to execute this project (e.g., Agile, Waterfall, Design Thinking).' },
      { name: 'tools_technologies', label: 'Tools & Technologies', type: 'textarea', rows: 3,
        placeholder: 'List the tools, technologies, and platforms you plan to use.' },
      { name: 'quality_assurance', label: 'Quality Assurance', type: 'textarea', rows: 3,
        placeholder: 'How will you ensure quality throughout the project lifecycle?' },
    ],
  },
  {
    title: 'Timeline & Resources',
    description: 'Detail the schedule, team roles, and resources needed.',
    fields: [
      { name: 'timeline', label: 'Timeline / Schedule', type: 'textarea', rows: 5, required: true,
        placeholder: 'Outline the project schedule with key phases and dates.' },
      { name: 'team_roles', label: 'Team Roles & Responsibilities', type: 'textarea', rows: 4,
        placeholder: 'Describe each team member\'s role and key responsibilities.' },
      { name: 'resources_needed', label: 'Resources Needed', type: 'textarea', rows: 3,
        placeholder: 'What resources (budget, equipment, facilities) are required?' },
      { name: 'dependencies', label: 'Dependencies', type: 'textarea', rows: 3,
        placeholder: 'List any external dependencies or prerequisites.' },
    ],
  },
  {
    title: 'Risk Assessment',
    description: 'Identify potential risks and mitigation strategies.',
    fields: [
      { name: 'risks', label: 'Identified Risks', type: 'textarea', rows: 5, required: true,
        placeholder: 'List potential risks:\n1. Risk: ... | Impact: High/Medium/Low | Likelihood: High/Medium/Low\n2. ' },
      { name: 'mitigation_strategies', label: 'Mitigation Strategies', type: 'textarea', rows: 4,
        placeholder: 'For each risk identified above, describe how you plan to mitigate or manage it.' },
      { name: 'contingency_plan', label: 'Contingency Plan', type: 'textarea', rows: 3,
        placeholder: 'What is your fallback plan if major risks materialize?' },
    ],
  },
]

// --- Research Proposal Steps ---

const RESEARCH_STEPS: StepConfig[] = [
  {
    title: 'Basic Information',
    description: 'Provide the foundational details of your research proposal.',
    fields: [
      { name: 'title', label: 'Research Title', type: 'text', placeholder: 'e.g., Impact of Climate Change on Caribbean Coastal Communities', required: true },
      { name: 'field_of_study', label: 'Field of Study', type: 'text', placeholder: 'e.g., Environmental Science, Computer Science' },
      { name: 'institution', label: 'Institution / Affiliation', type: 'text', placeholder: 'e.g., University of the West Indies' },
      { name: 'duration', label: 'Research Duration', type: 'text', placeholder: 'e.g., 12 months' },
      { name: 'principal_investigator', label: 'Principal Investigator', type: 'text', placeholder: 'Name and credentials' },
    ],
  },
  {
    title: 'Abstract & Background',
    description: 'Provide the research abstract and background context.',
    fields: [
      { name: 'abstract', label: 'Research Abstract', type: 'textarea', rows: 6, required: true,
        placeholder: 'Provide a concise abstract (150-300 words) summarizing the research question, methodology, and expected contributions.',
        helpText: 'The abstract should be self-contained and give readers a clear understanding of the research.' },
      { name: 'literature_review', label: 'Literature Review / Background', type: 'textarea', rows: 6,
        placeholder: 'Summarize relevant existing research and identify gaps that your study will address.',
        helpText: 'Reference key studies and explain how your research builds on or differs from existing work.' },
      { name: 'significance', label: 'Significance of the Study', type: 'textarea', rows: 3,
        placeholder: 'Why is this research important? What gap in knowledge does it fill?' },
    ],
  },
  {
    title: 'Research Questions',
    description: 'Define your research questions, hypotheses, and objectives.',
    fields: [
      { name: 'research_questions', label: 'Research Questions', type: 'textarea', rows: 4, required: true,
        placeholder: 'State your primary and secondary research questions:\n1. \n2. \n3. ' },
      { name: 'hypotheses', label: 'Hypotheses', type: 'textarea', rows: 3,
        placeholder: 'State your research hypotheses (if applicable).' },
      { name: 'objectives', label: 'Research Objectives', type: 'textarea', rows: 4, required: true,
        placeholder: 'List the specific objectives of your research:\n1. \n2. \n3. ' },
    ],
  },
  {
    title: 'Methodology',
    description: 'Describe your research design and methodology.',
    fields: [
      { name: 'research_design', label: 'Research Design', type: 'textarea', rows: 4, required: true,
        placeholder: 'Describe the overall research design (qualitative, quantitative, mixed methods, experimental, etc.).' },
      { name: 'data_collection', label: 'Data Collection Methods', type: 'textarea', rows: 4, required: true,
        placeholder: 'How will you collect data? Describe instruments, sampling, and procedures.' },
      { name: 'data_analysis', label: 'Data Analysis', type: 'textarea', rows: 4,
        placeholder: 'How will you analyze the collected data? Describe statistical or analytical methods.' },
      { name: 'ethical_considerations', label: 'Ethical Considerations', type: 'textarea', rows: 3,
        placeholder: 'Address any ethical concerns (consent, privacy, institutional review board approval).' },
    ],
  },
  {
    title: 'Expected Outcomes',
    description: 'Describe the anticipated results and contributions.',
    fields: [
      { name: 'expected_results', label: 'Expected Results', type: 'textarea', rows: 4, required: true,
        placeholder: 'What results do you anticipate from this research?' },
      { name: 'contributions', label: 'Contributions to Knowledge', type: 'textarea', rows: 3,
        placeholder: 'How will this research advance the field? What new knowledge will it generate?' },
      { name: 'practical_applications', label: 'Practical Applications', type: 'textarea', rows: 3,
        placeholder: 'How can the findings be applied in practice or policy?' },
      { name: 'publications', label: 'Planned Publications / Dissemination', type: 'textarea', rows: 3,
        placeholder: 'Where do you plan to publish or present findings? (journals, conferences, etc.)' },
    ],
  },
  {
    title: 'Budget & Timeline',
    description: 'Detail the funding needs and research schedule.',
    fields: [
      { name: 'budget', label: 'Budget Estimate', type: 'textarea', rows: 5, required: true,
        placeholder: 'Provide a budget breakdown:\n- Personnel: $XX,XXX\n- Equipment/Materials: $XX,XXX\n- Travel/Fieldwork: $XX,XXX\n- Publication costs: $XX,XXX' },
      { name: 'timeline', label: 'Research Timeline', type: 'textarea', rows: 5, required: true,
        placeholder: 'Outline the research timeline by phase:\nPhase 1 (Months 1-3): Literature review, IRB approval\nPhase 2 (Months 4-8): Data collection\nPhase 3 (Months 9-11): Analysis\nPhase 4 (Month 12): Writing and dissemination' },
      { name: 'funding_sources', label: 'Other Funding Sources', type: 'textarea', rows: 2,
        placeholder: 'Are you seeking or have you received funding from other sources?' },
    ],
  },
]

// --- Business Proposal Steps ---

const BUSINESS_STEPS: StepConfig[] = [
  {
    title: 'Basic Information',
    description: 'Provide the foundational details of your business proposal.',
    fields: [
      { name: 'title', label: 'Business / Venture Name', type: 'text', placeholder: 'e.g., CariTech Solutions', required: true },
      { name: 'business_type', label: 'Business Type', type: 'select', options: [
        { value: 'startup', label: 'Startup' }, { value: 'expansion', label: 'Business Expansion' },
        { value: 'social_enterprise', label: 'Social Enterprise' }, { value: 'partnership', label: 'Partnership' },
        { value: 'franchise', label: 'Franchise' }, { value: 'other', label: 'Other' },
      ]},
      { name: 'industry', label: 'Industry / Sector', type: 'text', placeholder: 'e.g., Technology, Agriculture, Tourism' },
      { name: 'target_market', label: 'Target Market', type: 'text', placeholder: 'e.g., Caribbean SMEs, Regional consumers' },
    ],
  },
  {
    title: 'Executive Summary',
    description: 'Provide a compelling overview of your business venture.',
    fields: [
      { name: 'executive_summary', label: 'Executive Summary', type: 'textarea', rows: 6, required: true,
        placeholder: 'Provide a compelling overview of your business idea, mission, and value proposition.',
        helpText: 'This should convince the reader that your venture is worth investing in.' },
      { name: 'value_proposition', label: 'Value Proposition', type: 'textarea', rows: 3, required: true,
        placeholder: 'What unique value does your business offer to customers? Why would they choose you?' },
      { name: 'mission_vision', label: 'Mission & Vision', type: 'textarea', rows: 3,
        placeholder: 'Mission: What your business does today.\nVision: Where you see the business in 5-10 years.' },
    ],
  },
  {
    title: 'Problem & Solution',
    description: 'Describe the market problem and your proposed solution.',
    fields: [
      { name: 'problem', label: 'Market Problem', type: 'textarea', rows: 4, required: true,
        placeholder: 'What problem or unmet need exists in the market? Who experiences this problem?' },
      { name: 'solution', label: 'Proposed Solution', type: 'textarea', rows: 4, required: true,
        placeholder: 'How does your product or service solve this problem? Be specific about features and benefits.' },
      { name: 'competitive_advantage', label: 'Competitive Advantage', type: 'textarea', rows: 3,
        placeholder: 'What gives you an edge over competitors? (technology, cost, expertise, location, etc.)' },
      { name: 'validation', label: 'Market Validation', type: 'textarea', rows: 3,
        placeholder: 'What evidence do you have that the market wants this solution? (surveys, pilot results, letters of intent)' },
    ],
  },
  {
    title: 'Market Analysis',
    description: 'Analyze the target market, competition, and opportunity.',
    fields: [
      { name: 'target_audience', label: 'Target Audience', type: 'textarea', rows: 4, required: true,
        placeholder: 'Describe your ideal customer segments. Include demographics, behaviors, and needs.' },
      { name: 'market_size', label: 'Market Size & Opportunity', type: 'textarea', rows: 3,
        placeholder: 'Estimate the total addressable market (TAM), serviceable market (SAM), and initial target market (SOM).' },
      { name: 'competition', label: 'Competitive Landscape', type: 'textarea', rows: 4,
        placeholder: 'Who are your main competitors? What are their strengths and weaknesses?' },
      { name: 'market_trends', label: 'Market Trends', type: 'textarea', rows: 3,
        placeholder: 'What trends support the growth of your business? (regulatory, technological, demographic)' },
    ],
  },
  {
    title: 'Business Model',
    description: 'Describe how your business will create, deliver, and capture value.',
    fields: [
      { name: 'revenue_model', label: 'Revenue Streams', type: 'textarea', rows: 4, required: true,
        placeholder: 'How will you make money? List all revenue streams and pricing strategies.' },
      { name: 'pricing', label: 'Pricing Strategy', type: 'textarea', rows: 3,
        placeholder: 'Describe your pricing model and how you determined price points.' },
      { name: 'operations', label: 'Operations Plan', type: 'textarea', rows: 4,
        placeholder: 'How will the business operate day-to-day? Describe key processes, supply chain, and partnerships.' },
      { name: 'go_to_market', label: 'Go-to-Market Strategy', type: 'textarea', rows: 3,
        placeholder: 'How will you reach your customers? Describe marketing channels and launch strategy.' },
    ],
  },
  {
    title: 'Financial Projections',
    description: 'Provide financial estimates and investment requirements.',
    fields: [
      { name: 'startup_costs', label: 'Startup / Investment Costs', type: 'textarea', rows: 4, required: true,
        placeholder: 'Itemize initial costs:\n- Development: $XX,XXX\n- Marketing: $XX,XXX\n- Operations: $XX,XXX\n- Working capital: $XX,XXX' },
      { name: 'revenue_projections', label: 'Revenue Projections (3 years)', type: 'textarea', rows: 4,
        placeholder: 'Year 1: $XXX,XXX\nYear 2: $XXX,XXX\nYear 3: $XXX,XXX\nKey assumptions: ...' },
      { name: 'break_even', label: 'Break-even Analysis', type: 'textarea', rows: 3,
        placeholder: 'When do you expect to break even? What volume or revenue is needed?' },
      { name: 'funding_ask', label: 'Funding Ask / ROI', type: 'textarea', rows: 3,
        placeholder: 'How much funding are you seeking? What return can investors expect? How will funds be used?' },
    ],
  },
]

// --- Master Config ---

export const PROPOSAL_STEPS: Record<ProposalType, StepConfig[]> = {
  funding: FUNDING_STEPS,
  project: PROJECT_STEPS,
  research: RESEARCH_STEPS,
  business: BUSINESS_STEPS,
}

export const TOTAL_STEPS = (type: ProposalType) => PROPOSAL_STEPS[type].length + 1 // +1 for review step

// --- Markdown Generation ---

const SECTION_SEPARATOR = '\n\n---\n\n'

function renderField(label: string, value: string | undefined): string {
  if (!value || !value.trim()) return ''
  return `### ${label}\n\n${toMarkdown(value)}\n`
}

export function generateProposalMarkdown(
  type: ProposalType,
  title: string,
  data: Record<string, any>
): string {
  const steps = PROPOSAL_STEPS[type]
  const typeLabels: Record<ProposalType, string> = {
    funding: 'Funding/Grant Proposal',
    project: 'Project Proposal',
    research: 'Research Proposal',
    business: 'Business Proposal',
  }

  const sections: string[] = []

  // Title block
  sections.push(`# ${title}\n\n**Type:** ${typeLabels[type]}  \n**Generated:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`)

  // Render each step as a section
  for (const step of steps) {
    const fieldLines: string[] = []

    for (const field of step.fields) {
      const value = data[field.name]
      if (value && String(value).trim()) {
        fieldLines.push(renderField(field.label, String(value)))
      }
    }

    if (fieldLines.length > 0) {
      sections.push(`## ${step.title}\n\n${fieldLines.join('\n')}`)
    }
  }

  return sections.join(SECTION_SEPARATOR)
}

// --- Export Utilities ---

export function downloadProposalAsMarkdown(title: string, markdown: string): void {
  const filename = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'proposal'

  const blob = new Blob([markdown], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.md`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  setTimeout(() => URL.revokeObjectURL(url), 100)
}

export function copyProposalToClipboard(markdown: string): Promise<boolean> {
  return navigator.clipboard.writeText(markdown).then(
    () => true,
    () => {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = markdown
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const result = document.execCommand('copy')
      document.body.removeChild(textarea)
      return result
    }
  )
}

export function printProposal(): void {
  window.print()
}

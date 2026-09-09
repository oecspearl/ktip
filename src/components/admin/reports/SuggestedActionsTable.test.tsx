import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SuggestedActionsTable } from './SuggestedActionsTable'

describe('SuggestedActionsTable', () => {
  it('orders by priority and names the KPI from the catalog', () => {
    render(
      <SuggestedActionsTable
        actions={[
          {
            kpi_key: 't33.oecs_state_coverage',
            action: 'Schedule roadshow follow-ups in the three states with no members.',
            owner_role: 'Partnerships Officer',
            priority: 'medium',
            rationale: 'Coverage is nine of twelve.',
          },
          {
            kpi_key: 't34.mau_pct',
            action: 'Run a re-engagement email to members inactive for thirty days.',
            owner_role: 'System Administrator',
            priority: 'high',
            rationale: 'Active share is furthest from target.',
          },
        ]}
      />,
    )
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('re-engagement')
    expect(rows[0]).toHaveTextContent('Monthly active users')
    expect(rows[0]).toHaveTextContent('System Administrator')
    expect(rows[1]).toHaveTextContent('OECS member states reached')
  })

  it('says so when there are none', () => {
    render(<SuggestedActionsTable actions={[]} />)
    expect(screen.getByText(/No actions were suggested/)).toBeInTheDocument()
  })
})

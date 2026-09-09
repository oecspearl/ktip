import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChartFrame } from './ChartFrame'
import { okList, unavailableList } from '../../lib/measured'

type Row = { month: string; count: number }
const columns = [
  { key: 'month', label: 'Month' },
  { key: 'count', label: 'Members', align: 'right' },
] as const

describe('ChartFrame', () => {
  it('renders the reason and a retry for an unavailable list, never the chart', () => {
    const onRetry = vi.fn()
    render(
      <ChartFrame<Row>
        title="Members"
        input={unavailableList<Row>('get_kpi_series was refused')}
        columns={columns}
        onRetry={onRetry}
      >
        {() => <div data-testid="plot">0</div>}
      </ChartFrame>,
    )
    expect(screen.getByText("Couldn't load this")).toBeInTheDocument()
    expect(screen.getByText('get_kpi_series was refused')).toBeInTheDocument()
    expect(screen.queryByTestId('plot')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('says not yet measured for a collector that does not exist', () => {
    render(
      <ChartFrame<Row> title="NPS" input={{ state: 'not-instrumented', phase: 2 }} columns={columns}>
        {() => <div data-testid="plot" />}
      </ChartFrame>,
    )
    expect(screen.getByText('Not yet measured — phase 2')).toBeInTheDocument()
    expect(screen.queryByTestId('plot')).not.toBeInTheDocument()
  })

  it('keeps a truthful empty list distinct from a failure', () => {
    render(
      <ChartFrame<Row> title="Members" input={okList<Row>([])} columns={columns}>
        {() => <div data-testid="plot" />}
      </ChartFrame>,
    )
    expect(screen.getByText('No data for this period')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load this")).not.toBeInTheDocument()
  })

  it('draws the chart and switches to a table of the same rows', () => {
    const rows: Row[] = [
      { month: 'Jul', count: 196 },
      { month: 'Aug', count: 214 },
    ]
    render(
      <ChartFrame<Row>
        title="Members"
        input={okList(rows)}
        columns={columns}
        legend={[
          { label: 'MAU', color: '#000' },
          { label: 'DAU', color: '#111' },
        ]}
      >
        {(items) => <div data-testid="plot">{items.length} points</div>}
      </ChartFrame>,
    )
    expect(screen.getByText('2 points')).toBeInTheDocument()
    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(screen.getByText('MAU')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.queryByTestId('plot')).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Members' })).toBeInTheDocument()
    expect(screen.getByText('214')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Chart' }))
    expect(screen.getByTestId('plot')).toBeInTheDocument()
  })
})

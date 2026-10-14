import { render, screen } from '@testing-library/react'
import { mockProject } from '../state/project'
import { RuleChip } from './RuleChip'

describe('RuleChip', () => {
  it('shows market, ref and date status, with summary and link in the tooltip', () => {
    const rule = mockProject.rules.find((r) => r.ref === '21 CFR 101.105')!
    render(<RuleChip rule={rule} />)
    expect(screen.getByText('US')).toBeInTheDocument()
    expect(screen.getByText('21 CFR 101.105')).toBeInTheDocument()
    expect(screen.getByText('· in force')).toBeInTheDocument()
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent(rule.summary)
    expect(screen.getByRole('link', { name: /Read the rule/, hidden: true })).toHaveAttribute('href', rule.url)
  })

  it('shows an upcoming date', () => {
    render(<RuleChip rule={{ id: 'x', market: 'IN', ref: 'FSS L&D', summary: 's', url: 'u', status: 'upcoming', from: '2027-07-01' }} />)
    expect(screen.getByText('· from 2027-07-01')).toBeInTheDocument()
  })
})

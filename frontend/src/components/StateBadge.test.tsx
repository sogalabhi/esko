import { render, screen } from '@testing-library/react'
import { BADGE_STATES, StateBadge, stateLabel } from './StateBadge'

describe('StateBadge', () => {
  it('has the five states', () => {
    expect(BADGE_STATES.map(stateLabel)).toEqual(['Confirmed', 'AI-suggested', 'Missing', 'Conflict', 'Pass'])
  })

  it.each(BADGE_STATES)('%s shows an icon and a word', (state) => {
    const { container } = render(<StateBadge state={state} />)
    expect(screen.getByText(stateLabel(state))).toBeInTheDocument()
    const icon = container.querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VerdictBadge } from './VerdictBadge'

describe('VerdictBadge', () => {
  it.each([
    ['fail', 'Fail'],
    ['review', 'Needs review'],
    ['pass', 'Pass'],
  ] as const)('%s shows an icon and the word %s, not colour alone', (verdict, word) => {
    const { container } = render(<VerdictBadge verdict={verdict} />)
    const badge = screen.getByText(word)
    expect(badge).toHaveAttribute('data-verdict', verdict)
    const icon = container.querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('a decided review item says what was decided, in words', () => {
    const at = '2026-10-20T15:40:00+05:30'
    const { rerender } = render(<VerdictBadge verdict="review" decision={{ verdict: 'pass', by: 'Sam', at }} />)
    expect(screen.getByText('Decided: fine')).toBeInTheDocument()
    rerender(<VerdictBadge verdict="review" decision={{ verdict: 'fail', by: 'Sam', at }} />)
    expect(screen.getByText('Decided: a problem')).toBeInTheDocument()
  })
})

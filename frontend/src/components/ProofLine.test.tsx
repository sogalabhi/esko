import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProofLine } from './ProofLine'

describe('ProofLine', () => {
  it('shows the code working after "Checked by code"', () => {
    render(<ProofLine basis="code" proof="15 g ÷ 78 g = 19.2%, printed 2.2%" />)
    expect(screen.getByText('Checked by code')).toBeInTheDocument()
    expect(screen.getByText('15 g ÷ 78 g = 19.2%, printed 2.2%')).toBeInTheDocument()
  })

  it('says a person decides when the basis is AI', () => {
    render(<ProofLine basis="ai" proof="ignored" />)
    expect(screen.getByText('AI judgement — a person decides')).toBeInTheDocument()
    expect(screen.queryByText('Checked by code')).toBeNull()
    expect(screen.queryByText('ignored')).toBeNull()
  })
})

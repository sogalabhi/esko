import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { CURRENT_USER, mockProject } from '../state/project'
import { renderWithProject } from '../test/render'
import type { Conflict } from '../types/project'
import { ConflictCard } from './ConflictCard'

const honey = mockProject.conflicts.find((c) => c.id === 'c-honey')!

function Harness({ conflict }: { conflict: Conflict }) {
  const [c, setC] = useState(conflict)
  return <ConflictCard conflict={c} onResolve={(choice) => setC({ ...c, resolution: { choice, by: CURRENT_USER, at: 'now' } })} />
}

describe('ConflictCard', () => {
  it('renders both halves with value, source chip and quote, plus the kind label', () => {
    renderWithProject(<Harness conflict={honey} />)
    expect(screen.getByText('Value conflict')).toBeInTheDocument()
    expect(screen.getByText('9%')).toBeInTheDocument()
    expect(screen.getByText('1%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sheet · B26' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Carton · Back' })).toBeInTheDocument()
    expect(screen.getByText('"Honey (9%)"')).toBeInTheDocument()
    for (const name of ['Intended change', 'Use left', 'Use right', 'Ask someone']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('collapses to one line with the resolver name when resolved', async () => {
    renderWithProject(<Harness conflict={honey} />)
    await userEvent.click(screen.getByRole('button', { name: 'Use left' }))
    expect(screen.getByText(`Resolved by ${CURRENT_USER} · use sheet value`)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use left' })).toBeNull()
  })

  it('"Ask someone" writes a message to the owner', async () => {
    renderWithProject(<Harness conflict={honey} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ask someone' }))
    expect((screen.getByLabelText('Message to copy') as HTMLTextAreaElement).value).toMatch(/^Hi R&D/)
  })

  it('names computed sides for math checks', async () => {
    const math = mockProject.conflicts.find((c) => c.id === 'c-calories')!
    renderWithProject(<Harness conflict={math} />)
    expect(screen.getByText('Math check')).toBeInTheDocument()
    expect(screen.getByText('Computed by code')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Use right' }))
    expect(screen.getByText(`Resolved by ${CURRENT_USER} · use computed value`)).toBeInTheDocument()
  })
})

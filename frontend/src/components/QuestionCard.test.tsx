import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockProject } from '../state/project'
import { renderWithProject } from '../test/render'
import { QuestionCard } from './QuestionCard'

const q = mockProject.questions.find((x) => x.id === 'q-serving')!

describe('QuestionCard', () => {
  it('shows suggested answers as buttons with why and unlocks', async () => {
    const onAnswer = vi.fn()
    const rules = mockProject.rules.filter((r) => q.ruleIds.includes(r.id))
    renderWithProject(<QuestionCard question={q} rules={rules} onAnswer={onAnswer} onSkip={() => {}} />)
    expect(screen.getByRole('heading', { name: q.text })).toBeInTheDocument()
    expect(screen.getByText('Why we ask:')).toBeInTheDocument()
    expect(screen.getByText('Unlocks 2 requirements')).toBeInTheDocument()
    expect(screen.getByText('21 CFR 101.9')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /60 g/ }))
    expect(onAnswer).toHaveBeenCalledWith('60 g')
  })

  it('keys 1–4 pick an answer, but not while typing in "Other…"', () => {
    const onAnswer = vi.fn()
    renderWithProject(<QuestionCard question={q} onAnswer={onAnswer} onSkip={() => {}} />)
    const card = screen.getByRole('article')
    fireEvent.keyDown(card, { key: '1' })
    expect(onAnswer).toHaveBeenLastCalledWith('40 g')
    fireEvent.keyDown(card, { key: '2' })
    expect(onAnswer).toHaveBeenLastCalledWith('60 g')
    fireEvent.keyDown(card, { key: '3' }) // only two suggested answers
    fireEvent.keyDown(screen.getByLabelText('Other answer'), { key: '1' })
    expect(onAnswer).toHaveBeenCalledTimes(2)
  })

  it('"Other…" submits typed text; "Skip for now" calls onSkip', async () => {
    const onAnswer = vi.fn()
    const onSkip = vi.fn()
    renderWithProject(<QuestionCard question={q} onAnswer={onAnswer} onSkip={onSkip} />)
    await userEvent.type(screen.getByLabelText('Other answer'), '55 g')
    await userEvent.click(screen.getByRole('button', { name: 'Use answer' }))
    expect(onAnswer).toHaveBeenCalledWith('55 g')
    await userEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(onSkip).toHaveBeenCalled()
  })

  it('"Ask someone" produces copyable text', async () => {
    const user = userEvent.setup() // installs its own clipboard stub; override it after
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderWithProject(<QuestionCard question={q} askTo="rnd" onAnswer={() => {}} onSkip={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Ask someone' }))
    const box = screen.getByLabelText('Message to copy') as HTMLTextAreaElement
    expect(box.value).toContain('Hi R&D')
    expect(box.value).toContain(q.text)
    await user.click(screen.getByRole('button', { name: 'Copy message' }))
    expect(writeText).toHaveBeenCalledWith(box.value)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('collapses with a check once answered', () => {
    renderWithProject(<QuestionCard question={{ ...q, status: 'answered' }} answer="60 g" onAnswer={() => {}} onSkip={() => {}} />)
    expect(screen.getByText('Answered · 60 g')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /40 g/ })).toBeNull()
  })
})

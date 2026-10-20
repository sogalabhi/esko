import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockProject } from '../state/project'
import { calls, json, renderLive, stubFetch } from '../test/renderLive'
import { renderWithProject } from '../test/render'
import type { Project } from '../types/project'
import { Checks } from '../screens/Checks'
import { get } from '../test/renderLive'
import { AppShell } from './AppShell'

afterEach(() => vi.unstubAllGlobals())

const shell = <AppShell><p>screen</p></AppShell>

const opened = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Ask about this' }))
  return screen.getByRole('complementary', { name: 'Ask about this' })
}

describe('Ask about this panel', () => {
  it('is closed by default, opens from the top bar and closes with Escape', async () => {
    renderWithProject(shell)
    expect(screen.queryByRole('complementary', { name: 'Ask about this' })).toBeNull()
    const panel = await opened()
    expect(screen.getByRole('button', { name: 'Ask about this' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(panel).getByLabelText('Your question')).toHaveFocus()
    expect(panel).toHaveClass('no-print')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('complementary', { name: 'Ask about this' })).toBeNull()
  })

  it('shows one answer with source chips (not a thread), then "Confirm as fact" posts and records it', async () => {
    const updated: Project = structuredClone(mockProject)
    let confirmBody: unknown
    const f = stubFetch(
      (url, init) => (url === '/api/ask' && init?.method === 'POST' ? json({ answer: 'Net quantity: 480 g.', factIds: ['f-net-qty'] }) : undefined),
      (url, init) => {
        if (url === '/api/ask/confirm' && init?.method === 'POST') {
          confirmBody = JSON.parse(String(init.body))
          return json(updated)
        }
      },
    )
    renderLive(shell)
    // Live mode loads the project first; the panel works on the facts it has, so wait for them.
    await screen.findByText('screen')
    const panel = await opened()
    await userEvent.type(within(panel).getByLabelText('Your question'), 'How much is in the box?')
    await userEvent.click(within(panel).getByRole('button', { name: 'Ask' }))
    const answer = await within(panel).findByRole('region', { name: 'Answer' })
    expect(answer).toHaveTextContent('Net quantity: 480 g.')
    expect(calls(f)).toContain('POST /api/ask')

    await userEvent.click(within(answer).getByRole('button', { name: 'Confirm as fact' }))
    expect(await within(panel).findByText('Confirmed as a fact')).toBeInTheDocument()
    expect(confirmBody).toEqual({ question: 'How much is in the box?', answer: 'Net quantity: 480 g.', factIds: ['f-net-qty'] })
  })

  it('shows a refusal plainly, with no Confirm button', async () => {
    stubFetch((url) =>
      url === '/api/ask' ? json({ answer: 'No fact answers this, so I will not guess.', factIds: [], refused: true }) : undefined,
    )
    renderLive(shell)
    await screen.findByText('screen')
    const panel = await opened()
    await userEvent.type(within(panel).getByLabelText('Your question'), 'Is it gluten free?{Enter}')
    const answer = await within(panel).findByRole('region', { name: 'Answer' })
    expect(answer).toHaveAttribute('data-refused')
    expect(answer).toHaveTextContent('Not answered')
    expect(answer).toHaveTextContent('No fact answers this, so I will not guess.')
    expect(within(panel).queryByRole('button', { name: 'Confirm as fact' })).toBeNull()
  })

  it('an error shows the reason and Retry asks again', async () => {
    let fail = true
    stubFetch((url) => (url === '/api/ask' ? (fail ? json({ detail: 'The AI service is busy' }, 502) : json({ answer: 'Net quantity: 480 g.', factIds: ['f-net-qty'] })) : undefined))
    renderLive(shell)
    await screen.findByText('screen')
    const panel = await opened()
    await userEvent.type(within(panel).getByLabelText('Your question'), 'weight{Enter}')
    expect(await within(panel).findByRole('alert')).toHaveTextContent('The AI service is busy')
    fail = false
    await userEvent.click(within(panel).getByRole('button', { name: 'Retry' }))
    expect(await within(panel).findByRole('region', { name: 'Answer' })).toHaveTextContent('480 g')
  })

  it('on the mock it answers from matching facts and refuses otherwise', async () => {
    renderWithProject(shell)
    const panel = await opened()
    await userEvent.type(within(panel).getByLabelText('Your question'), 'what is the net quantity?{Enter}')
    expect(await within(panel).findByRole('region', { name: 'Answer' })).toHaveTextContent('Net quantity: 480 g')
    await userEvent.clear(within(panel).getByLabelText('Your question'))
    await userEvent.type(within(panel).getByLabelText('Your question'), 'zzzz qqqq{Enter}')
    expect(await within(panel).findByRole('region', { name: 'Answer' })).toHaveAttribute('data-refused')
  })
})

describe('Ask about this finding', () => {
  const withChecks = <AppShell><Checks /></AppShell>
  const honey = () => screen.getByRole('article', { name: /Honey percentage/ })
  const askButton = () => within(honey()).getByRole('button', { name: /Ask about this finding/ })

  it('every card has the button; it opens the panel with that finding as context, and the top-bar Ask stays general', async () => {
    renderWithProject(withChecks)
    expect(screen.getAllByRole('button', { name: /Ask about this finding/ })).toHaveLength(9)
    await userEvent.click(askButton())
    const panel = screen.getByRole('complementary', { name: 'Ask about this' })
    const ctx = within(panel).getByRole('region', { name: 'Finding in question' })
    expect(ctx).toHaveAttribute('data-ask-finding', 'f-mismatch-honey')
    expect(ctx).toHaveTextContent('Fail')
    expect(within(panel).getByLabelText('Your question')).toHaveFocus()

    await userEvent.click(within(ctx).getByRole('button', { name: 'Ask something general instead' }))
    expect(within(panel).queryByRole('region', { name: 'Finding in question' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Ask about this' }))
    expect(screen.queryByRole('complementary', { name: 'Ask about this' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Ask about this' }))
    expect(within(screen.getByRole('complementary', { name: 'Ask about this' })).queryByRole('region', { name: 'Finding in question' })).toBeNull()
  })

  it('the request carries findingId, and the answer shows rule, evidence and fact chips', async () => {
    let body: unknown
    stubFetch(
      get('/api/project', () => json(mockProject)),
      (url, init) => {
        if (url === '/api/ask' && init?.method === 'POST') {
          body = JSON.parse(String(init.body))
          return json({ answer: 'The artwork lists honey at 2% but the sheet says 4%.', factIds: ['f-honey-pct'], ruleIds: ['r-us-101-4', 'DF-02'], evidence: [0, 1] })
        }
      },
    )
    renderLive(withChecks, { gate: false })
    await userEvent.click(await screen.findByRole('button', { name: /Ask about this finding: Honey percentage/ }))
    const panel = screen.getByRole('complementary', { name: 'Ask about this' })
    await userEvent.type(within(panel).getByLabelText('Your question'), 'Why is this a fail?{Enter}')
    const answer = await within(panel).findByRole('region', { name: 'Answer' })
    expect(body).toEqual({ question: 'Why is this a fail?', findingId: 'f-mismatch-honey' })
    expect(answer).toHaveTextContent('honey at 2%')
    const rules = within(answer).getByLabelText('Rules cited')
    expect(rules).toHaveTextContent('21 CFR 101.4')
    expect(rules).toHaveTextContent('DF-02')
    const cites = answer.querySelector('[data-citations]')!
    expect(within(cites as HTMLElement).getAllByRole('button').length).toBeGreaterThanOrEqual(2)
    expect(within(answer).queryByRole('button', { name: 'Confirm as fact' })).toBeNull()
  })

  it('a refused answer shows its reason and no citations', async () => {
    stubFetch(
      get('/api/project', () => json(mockProject)),
      (url, init) =>
        url === '/api/ask' && init?.method === 'POST'
          ? json({ answer: "This finding doesn't answer that.", factIds: [], ruleIds: [], evidence: [], refused: true })
          : undefined,
    )
    renderLive(withChecks)
    await userEvent.click(await screen.findByRole('button', { name: /Ask about this finding: Honey percentage/ }))
    const panel = screen.getByRole('complementary', { name: 'Ask about this' })
    await userEvent.type(within(panel).getByLabelText('Your question'), 'Who is the CEO?{Enter}')
    const answer = await within(panel).findByRole('region', { name: 'Answer' })
    expect(answer).toHaveAttribute('data-refused')
    expect(answer).toHaveTextContent('Not answered')
    expect(answer).toHaveTextContent('Reason')
    expect(answer).toHaveTextContent("This finding doesn't answer that.")
  })

  it('an unknown finding (404) shows the backend reason', async () => {
    stubFetch(
      get('/api/project', () => json(mockProject)),
      (url, init) => (url === '/api/ask' && init?.method === 'POST' ? json({ detail: 'No finding f-mismatch-honey' }, 404) : undefined),
    )
    renderLive(withChecks)
    await userEvent.click(await screen.findByRole('button', { name: /Ask about this finding: Honey percentage/ }))
    const panel = screen.getByRole('complementary', { name: 'Ask about this' })
    await userEvent.type(within(panel).getByLabelText('Your question'), 'why{Enter}')
    expect(await within(panel).findByRole('alert')).toHaveTextContent('No finding f-mismatch-honey')
  })

  it('on the mock it answers from the finding and cites only what the finding carries', async () => {
    renderWithProject(withChecks)
    await userEvent.click(askButton())
    const panel = screen.getByRole('complementary', { name: 'Ask about this' })
    await userEvent.type(within(panel).getByLabelText('Your question'), 'why does this matter?{Enter}')
    const answer = await within(panel).findByRole('region', { name: 'Answer' })
    expect(within(answer).getByLabelText('Rules cited')).toHaveTextContent('DF-02')
  })
})

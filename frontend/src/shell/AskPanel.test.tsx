import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockProject } from '../state/project'
import { calls, json, renderLive, stubFetch } from '../test/renderLive'
import { renderWithProject } from '../test/render'
import type { Project } from '../types/project'
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

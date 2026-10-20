import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AI_BUSY_REASON, api, ApiError } from '../api/client'
import mock from '../mocks/project.json'
import { Checks } from './Checks'
import { Evidence } from './Evidence'
import { Rules } from './Rules'
import { AppShell } from '../shell/AppShell'
import { get, json, post, renderLive, stubFetch } from '../test/renderLive'
import type { Project } from '../types/project'

const project = mock as unknown as Project
const BUSY = /The AI service is busy right now\. Your files are safe/

afterEach(() => vi.unstubAllGlobals())

describe('AI busy replies map to one message', () => {
  it('maps a 429 to the busy message', async () => {
    stubFetch(() => json({ detail: 'Too Many Requests' }, 429))
    await expect(api.runProject()).rejects.toMatchObject({ status: 429, message: AI_BUSY_REASON, busy: true })
  })

  it.each([
    [502, 'AI step failed: 429 RESOURCE_EXHAUSTED. You exceeded your current quota'],
    [502, 'AI step failed: rate limit reached'],
    [503, 'AI step failed: 503 UNAVAILABLE. The model is overloaded. Please try again later.'],
    [503, 'The service is busy'],
  ])('maps a %i whose detail says "%s"', async (status, detail) => {
    stubFetch(() => json({ detail }, status))
    const e = await api.runProject().catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ message: AI_BUSY_REASON, busy: true })
  })

  it('leaves other failures alone', async () => {
    stubFetch(() => json({ detail: 'LLM_API_KEY is not set in backend/.env' }, 503))
    await expect(api.runProject()).rejects.toMatchObject({ message: 'LLM_API_KEY is not set in backend/.env', busy: false })
    stubFetch(() => json({ detail: 'AI step failed: the model returned an empty answer' }, 502))
    await expect(api.runProject()).rejects.toMatchObject({ busy: false })
  })
})

describe('Files screen when the AI is busy', () => {
  const nameOf = (init?: RequestInit) => ((init?.body as FormData).get('file') as File).name
  const uploaded = (name: string) => json({ id: name, name, type: 'pdf', status: 'read', pieceCount: 3 })
  const input = () => document.querySelector<HTMLInputElement>('input[type="file"]')!

  it('a busy analysis shows the message in an alert, offers Load demo, and Retry sends the same request again', async () => {
    let busy = true
    const f = stubFetch(
      get('/api/project', () => json({ detail: 'No files uploaded yet' }, 404)),
      post('/api/files', (init) => uploaded(nameOf(init))),
      post('/api/project/run', () => (busy ? json({ detail: 'AI step failed: 429 RESOURCE_EXHAUSTED' }, 502) : json(project))),
    )
    renderLive(<Evidence />)
    await screen.findByText(/drop your packaging files above/)
    await userEvent.upload(input(), [new File(['%PDF'], 'carton.pdf')])
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(BUSY)
    expect(within(alert).getByRole('button', { name: 'Load demo' })).toBeInTheDocument()
    busy = false
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Analysis finished')).toBeInTheDocument()
    const runs = f.mock.calls.filter(([u, i]) => u === '/api/project/run' && i?.method === 'POST')
    expect(runs).toHaveLength(2)
    expect(runs[0][1]?.body).toEqual(runs[1][1]?.body)
  })

  it('a busy upload keeps the file for Retry, which sends the same file again', async () => {
    let busy = true
    const f = stubFetch(
      get('/api/project', () => json({ detail: 'No files uploaded yet' }, 404)),
      post('/api/files', (init) => (busy ? json({ detail: 'Service overloaded' }, 503) : uploaded(nameOf(init)))),
      post('/api/project/run', () => json(project)),
    )
    renderLive(<Evidence />)
    await screen.findByText(/drop your packaging files above/)
    await userEvent.upload(input(), [new File(['%PDF'], 'carton.pdf')])
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(BUSY)
    busy = false
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Analysis finished')).toBeInTheDocument()
    const uploads = f.mock.calls.filter(([u, i]) => u === '/api/files' && i?.method === 'POST')
    expect(uploads).toHaveLength(2)
    expect(nameOf(uploads[0][1])).toBe('carton.pdf')
    expect(nameOf(uploads[1][1])).toBe('carton.pdf')
  })
})

describe('Rules screen when the AI is busy', () => {
  it('shows the message and Retry re-sends the same file', async () => {
    let busy = true
    const f = stubFetch(
      get('/api/project', () => json({ ...project, rulebook: null })),
      post('/api/rulebook', () => (busy ? json({ detail: 'busy' }, 429) : json(project))),
    )
    renderLive(<Rules />)
    const field = await screen.findByLabelText('Rulebook file')
    await waitFor(() => expect(field).toBeEnabled())
    await userEvent.upload(field, new File(['rules'], 'rules.docx'))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(BUSY)
    expect(alert).not.toHaveTextContent('The rulebook was not added')
    busy = false
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/Rulebook added/)).toBeInTheDocument()
    const sends = f.mock.calls.filter(([u, i]) => u === '/api/rulebook' && i?.method === 'POST')
    expect(sends).toHaveLength(2)
    const name = (i?: RequestInit) => ((i?.body as FormData).get('file') as File).name
    expect(name(sends[0][1])).toBe('rules.docx')
    expect(name(sends[1][1])).toBe('rules.docx')
  })
})

describe('Ask when the AI is busy', () => {
  const asks = (f: ReturnType<typeof stubFetch>) => f.mock.calls.filter(([u, i]) => u === '/api/ask' && i?.method === 'POST')

  it('keeps the typed question and Retry sends the same body again', async () => {
    let busy = true
    const f = stubFetch(
      get('/api/project', () => json(project)),
      post('/api/ask', () => (busy ? json({ detail: 'AI step failed: model overloaded' }, 502) : json({ answer: 'Net quantity: 480 g.', factIds: [] }))),
    )
    renderLive(<AppShell><p>screen</p></AppShell>)
    await screen.findByText('screen')
    await userEvent.click(screen.getByRole('button', { name: 'Ask about this' }))
    const panel = screen.getByRole('complementary', { name: 'Ask about this' })
    await userEvent.type(within(panel).getByLabelText('Your question'), 'How much is in the box?{Enter}')
    const alert = await within(panel).findByRole('alert')
    expect(alert).toHaveTextContent(BUSY)
    expect(within(panel).getByLabelText('Your question')).toHaveValue('How much is in the box?')
    busy = false
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await within(panel).findByRole('region', { name: 'Answer' })).toHaveTextContent('480 g')
    const sent = asks(f)
    expect(sent).toHaveLength(2)
    expect(sent[0][1]?.body).toBe(sent[1][1]?.body)
    expect(JSON.parse(String(sent[1][1]?.body))).toEqual({ question: 'How much is in the box?' })
  })

  it('about a finding, Retry keeps the findingId', async () => {
    let busy = true
    const f = stubFetch(
      get('/api/project', () => json(project)),
      post('/api/ask', () => (busy ? json({ detail: 'Too many requests' }, 429) : json({ answer: 'Because the sheet says 4%.', factIds: [], ruleIds: [], evidence: [] }))),
    )
    renderLive(
      <AppShell>
        <Checks />
      </AppShell>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /Ask about this finding: Honey percentage/ }))
    const panel = screen.getByRole('complementary', { name: 'Ask about this' })
    await userEvent.type(within(panel).getByLabelText('Your question'), 'Why is this a fail?{Enter}')
    const alert = await within(panel).findByRole('alert')
    expect(alert).toHaveTextContent(BUSY)
    expect(within(panel).getByLabelText('Your question')).toHaveValue('Why is this a fail?')
    busy = false
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    await within(panel).findByRole('region', { name: 'Answer' })
    const sent = asks(f)
    expect(sent).toHaveLength(2)
    expect(sent[0][1]?.body).toBe(sent[1][1]?.body)
    expect(JSON.parse(String(sent[1][1]?.body))).toEqual({ question: 'Why is this a fail?', findingId: 'f-mismatch-honey' })
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router'
import mock from '../mocks/project.json'
import { json, get, renderLive, stubFetch } from '../test/renderLive'
import { renderWithProject } from '../test/render'
import type { Project } from '../types/project'
import { Rules } from './Rules'

const project = mock as unknown as Project
const ruleCard = (id: string) => document.querySelector<HTMLElement>(`[data-rulebook-rule="${id}"]`)!

afterEach(() => vi.unstubAllGlobals())

describe('Rules screen: what is listed', () => {
  it('lists the market rules in use and the rulebook rules', () => {
    renderWithProject(<Rules />)
    expect(screen.getByRole('heading', { name: 'Rules', level: 1 })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-market-rule]')).toHaveLength(project.rules.length)
    expect(screen.getByText('21 CFR 101.4')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-rulebook-rule]')).toHaveLength(11)
    expect(screen.getByText(/Dancing_Fish_US_Label_Rulebook.docx/, { selector: 'span.font-medium' })).toBeInTheDocument()
  })

  it('a verified rule shows its id, title, text, check type, quote and where it came from', () => {
    renderWithProject(<Rules />)
    const card = ruleCard('DF-05')
    expect(card).toHaveAttribute('data-state', 'verified')
    expect(within(card).getByText('DF-05')).toBeInTheDocument()
    expect(within(card).getByRole('heading', { name: 'Name and place of business' })).toBeInTheDocument()
    expect(within(card).getByText('In force')).toBeInTheDocument()
    expect(within(card).getByText('Checks the item is on the pack')).toBeInTheDocument()
    expect(within(card).getByText(/Dancing_Fish_US_Label_Rulebook.docx, paragraph 30/)).toBeInTheDocument()
    expect(within(card).getByText('Quote checked by code')).toBeInTheDocument()
  })

  it('an unverified rule says the quote was not found and that it is not applied', () => {
    renderWithProject(<Rules />)
    const card = ruleCard('DF-06')
    expect(card).toHaveAttribute('data-state', 'unverified')
    expect(within(card).getByText('Quote not found in the rulebook — not applied')).toBeInTheDocument()
    expect(within(card).queryByText('Quote checked by code')).toBeNull()
    expect(within(card).getByText(/unverified rule is not applied/)).toBeInTheDocument()
  })

  it('a proposed rule is labelled "Proposed — not applied"', () => {
    renderWithProject(<Rules />)
    const card = ruleCard('DF-21')
    expect(card).toHaveAttribute('data-state', 'proposed')
    expect(within(card).getByText('Proposed — not applied')).toBeInTheDocument()
    expect(within(card).queryByText('In force')).toBeNull()
  })

  it('links each rule to the findings it produced, opening that card on Checks', async () => {
    renderWithProject(
      <Routes>
        <Route path="/rules" element={<Rules />} />
        <Route path="/checks" element={<p>checks screen</p>} />
      </Routes>,
      '/rules',
    )
    const link = within(ruleCard('DF-02')).getByRole('link', { name: /Honey/i })
    expect(link).toHaveAttribute('href', '/checks?finding=f-mismatch-honey')
    expect(within(ruleCard('DF-02')).getByText('Fail')).toBeInTheDocument()
    await userEvent.click(link)
    expect(screen.getByText('checks screen')).toBeInTheDocument()
  })

  it('empty: no rulebook says the checks use the market rules only', () => {
    renderWithProject(<Rules />, '/', { ...project, rulebook: null })
    expect(screen.getByText('No rulebook yet — the checks use the market rules only.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove rulebook' })).toBeNull()
    expect(screen.getByText('Add a rulebook')).toBeInTheDocument()
  })
})

describe('Rules screen: mock mode', () => {
  it('disables the upload and remove, with a note', () => {
    renderWithProject(<Rules />)
    expect(screen.getByLabelText('Rulebook file')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove rulebook' })).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent('Upload needs the backend')
  })
})

describe('Rules screen: upload and remove (api mode)', () => {
  const empty: Project = { ...structuredClone(project), rulebook: null }

  it('posts the file as multipart "file" and shows the project that comes back', async () => {
    let sent: FormData | undefined
    const f = stubFetch(
      get('/api/project', () => json(empty)),
      (url, init) => {
        if (url === '/api/rulebook' && init?.method === 'POST') {
          sent = init.body as FormData
          return json(project)
        }
      },
    )
    renderLive(<Rules />)
    const input = await screen.findByLabelText('Rulebook file')
    await waitFor(() => expect(input).toBeEnabled())
    expect(screen.getByText('No rulebook yet — the checks use the market rules only.')).toBeInTheDocument()
    await userEvent.upload(input, new File(['rules'], 'rules.docx'))
    expect(await screen.findByText(/Rulebook added: Dancing_Fish_US_Label_Rulebook.docx, 11 rules read/)).toBeInTheDocument()
    expect(sent).toBeInstanceOf(FormData)
    expect((sent!.get('file') as File).name).toBe('rules.docx')
    expect(document.querySelectorAll('[data-rulebook-rule]')).toHaveLength(11)
    expect(f).toHaveBeenCalled()
  })

  it('shows a reading state while the rulebook is read', async () => {
    let release: (r: Response) => void = () => {}
    stubFetch(
      get('/api/project', () => json(empty)),
      (url, init) => (url === '/api/rulebook' && init?.method === 'POST' ? new Promise<Response>((r) => (release = r)) : undefined),
    )
    renderLive(<Rules />)
    const input = await screen.findByLabelText('Rulebook file')
    await waitFor(() => expect(input).toBeEnabled())
    await userEvent.upload(input, new File(['rules'], 'rules.pdf'))
    expect(await screen.findByRole('status', { name: 'Reading the rulebook' })).toBeInTheDocument()
    release(json(project))
    await screen.findByText(/Rulebook added/)
  })

  it('shows the backend reason when the upload fails, and Retry sends it again', async () => {
    let fail = true
    stubFetch(
      get('/api/project', () => json(empty)),
      (url, init) =>
        url === '/api/rulebook' && init?.method === 'POST' ? (fail ? json({ detail: 'The AI service is not available (is the key set?).' }, 503) : json(project)) : undefined,
    )
    renderLive(<Rules />)
    const input = await screen.findByLabelText('Rulebook file')
    await waitFor(() => expect(input).toBeEnabled())
    await userEvent.upload(input, new File(['rules'], 'rules.md'))
    expect(await screen.findByRole('alert')).toHaveTextContent('The rulebook was not added: The AI service is not available (is the key set?).')
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/Rulebook added/)).toBeInTheDocument()
  })

  it.each([
    [413, 'The file is too large.'],
    [415, 'This file type cannot be read.'],
    [502, 'An AI step failed.'],
  ])('a %i without a detail shows the standard reason', async (status, reason) => {
    stubFetch(
      get('/api/project', () => json(empty)),
      (url, init) => (url === '/api/rulebook' && init?.method === 'POST' ? json({}, status) : undefined),
    )
    renderLive(<Rules />)
    const input = await screen.findByLabelText('Rulebook file')
    await waitFor(() => expect(input).toBeEnabled())
    await userEvent.upload(input, new File(['x'], 'rules.txt'))
    expect(await screen.findByRole('alert')).toHaveTextContent(reason)
  })

  it('refuses another file type before sending anything', async () => {
    const f = stubFetch(get('/api/project', () => json(empty)))
    renderLive(<Rules />)
    const input = await screen.findByLabelText('Rulebook file')
    await waitFor(() => expect(input).toBeEnabled())
    // userEvent.upload honours the accept attribute, so fire the change directly.
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(input, { target: { files: [new File(['x'], 'rules.xlsx')] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('rules.xlsx cannot be used as a rulebook')
    expect(f.mock.calls.some(([, i]) => i?.method === 'POST')).toBe(false)
  })

  it('"Remove rulebook" calls DELETE /api/rulebook and shows the empty state', async () => {
    let deleted = false
    stubFetch(
      get('/api/project', () => json(project)),
      (url, init) => {
        if (url === '/api/rulebook' && init?.method === 'DELETE') {
          deleted = true
          return json(empty)
        }
      },
    )
    renderLive(<Rules />)
    const remove = await screen.findByRole('button', { name: 'Remove rulebook' })
    await waitFor(() => expect(remove).toBeEnabled())
    await userEvent.click(remove)
    expect(await screen.findByText('No rulebook yet — the checks use the market rules only.')).toBeInTheDocument()
    expect(deleted).toBe(true)
    expect(document.querySelectorAll('[data-rulebook-rule]')).toHaveLength(0)
  })

  it('shows skeletons while loading and the reason when the project cannot load', async () => {
    stubFetch(() => new Promise<Response>(() => {}))
    const { unmount } = renderLive(<Rules />)
    expect(screen.getByRole('status', { name: 'Loading rules' })).toBeInTheDocument()
    unmount()
    stubFetch(get('/api/project', () => json({ detail: 'Disk is full' }, 500)))
    renderLive(<Rules />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Disk is full')
  })
})

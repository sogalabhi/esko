import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoadGate } from '../components/LoadGate'
import mock from '../mocks/project.json'
import { mockProject } from '../state/project'
import { calls, get, json, post, renderLive, stubFetch } from '../test/renderLive'
import { renderWithProject } from '../test/render'
import type { Project } from '../types/project'
import { Checks, EmptyChecks } from './Checks'

const project = mock as unknown as Project
const group = (v: string) => document.querySelector<HTMLElement>(`[data-group="${v}"]`)!
const rows = (root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>('[data-finding-row]')]
const row = (name: RegExp) => rows().find((r) => name.test(r.textContent ?? ''))!
/** Select a finding's row; its full card opens in the detail pane. */
const open = async (name: RegExp) => {
  await waitFor(() => expect(row(name)).toBeDefined())
  await userEvent.click(row(name))
  return screen.getByRole('article', { name })
}

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('Checks groups and filter', () => {
  it('groups Fail / Needs review / Pass as one-line rows with the mock counts; the first finding is open beside them', () => {
    renderWithProject(<Checks />)
    expect(screen.getByRole('heading', { name: 'Checks', level: 1 })).toBeInTheDocument()
    const want = { fail: 4, review: 3, pass: 2 } as const
    for (const v of ['fail', 'review', 'pass'] as const) {
      expect(rows(group(v))).toHaveLength(want[v])
      expect(within(group(v)).getByRole('heading', { level: 2 })).toHaveTextContent(String(want[v]))
    }
    expect(within(group('review')).getByRole('heading', { level: 2 })).toHaveTextContent('2 left to decide')
    // Undecided review items first, the decided one last, and its row says so.
    const last = rows(group('review')).at(-1)!
    expect(last).toHaveAttribute('data-finding-id', 'f-approval-sheet-draft')
    expect(last).toHaveTextContent('Decided: fine')
    // One full card at a time: the selected finding, in the detail pane.
    const pane = screen.getByRole('complementary', { name: 'Selected finding' })
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(within(pane).getByRole('article', { name: /Honey percentage/ })).toBeInTheDocument()
    expect(pane).toHaveTextContent('Finding 1 of 9')
    expect(rows()[0]).toHaveAttribute('aria-current', 'true')
  })

  it('a row opens its card; Previous and Next step through the list', async () => {
    renderWithProject(<Checks />)
    const card = await open(/HIGH-GRAIN/)
    expect(card).toHaveTextContent('Needs review')
    expect(row(/HIGH-GRAIN/)).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('complementary', { name: 'Selected finding' })).toHaveTextContent('Finding 6 of 9')
    await userEvent.click(screen.getByRole('button', { name: 'Next finding' }))
    expect(screen.getByRole('article', { name: /content sheet is still a draft/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Previous finding' }))
    await userEvent.click(screen.getByRole('button', { name: 'Previous finding' }))
    expect(screen.getByRole('article', { name: /Vegan claim/ })).toBeInTheDocument()
    await userEvent.click(row(/Honey percentage/))
    expect(screen.getByRole('button', { name: 'Previous finding' })).toBeDisabled()
  })

  it('the filter buttons carry counts and show one group at a time', async () => {
    renderWithProject(<Checks />)
    const filters = screen.getByRole('group', { name: 'Filter checks' })
    expect(within(filters).getByRole('button', { name: 'All 9' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(filters).getByRole('button', { name: 'Fail 4' }))
    expect(within(filters).getByRole('button', { name: 'Fail 4' })).toHaveAttribute('aria-pressed', 'true')
    expect(group('fail')).toBeInTheDocument()
    expect(document.querySelector('[data-group="review"]')).toBeNull()
    expect(document.querySelector('[data-group="pass"]')).toBeNull()
    await userEvent.click(within(filters).getByRole('button', { name: 'Needs review 3' }))
    expect(document.querySelector('[data-group="fail"]')).toBeNull()
    expect(rows(group('review'))).toHaveLength(3)
    // The open card follows the filter: the first finding it shows.
    expect(screen.getByRole('article', { name: /Vegan claim/ })).toBeInTheDocument()
    await userEvent.click(within(filters).getByRole('button', { name: 'Pass 2' }))
    expect(rows(group('pass'))).toHaveLength(2)
    await userEvent.click(within(filters).getByRole('button', { name: 'All 9' }))
    expect(rows()).toHaveLength(9)
  })

  it('J and K move the selection; 2 on a review card chooses "It\'s a problem" (asks for the name first)', async () => {
    renderWithProject(<Checks />)
    const all = rows()
    await userEvent.keyboard('j')
    expect(all[1]).toHaveFocus()
    expect(all[1]).toHaveAttribute('aria-current', 'true')
    await userEvent.keyboard('jj')
    expect(all[3]).toHaveFocus()
    await userEvent.keyboard('k')
    expect(all[2]).toHaveFocus()
    expect(screen.getByRole('article', { name: /Manufacturer address/ })).toBeInTheDocument()
    await userEvent.click(row(/Vegan claim/))
    await userEvent.keyboard('2')
    expect(await screen.findByText(/Add your name first/)).toBeInTheDocument()
  })

  it('says when no rulebook was added', () => {
    renderWithProject(<Checks />, '/', { ...mockProject, rulebook: null })
    expect(screen.getByText(/No rulebook added: only the market rules were checked/)).toBeInTheDocument()
  })
})

describe('Checked and fine', () => {
  const cleared = () => document.querySelector<HTMLElement>('[data-group="cleared"]')!

  it('sits below the Pass group, collapsed with a count, and opens to show each proof and its evidence chips', async () => {
    renderWithProject(<Checks />)
    const groups = [...document.querySelectorAll('[data-group]')].map((g) => g.getAttribute('data-group'))
    expect(groups).toEqual(['fail', 'review', 'pass', 'cleared'])
    expect(within(cleared()).getByRole('heading', { level: 2 })).toHaveTextContent('Checked and fine3')
    const toggle = within(cleared()).getByRole('button', { name: /Show the proofs \(3\)/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(cleared()).queryAllByRole('article')).toHaveLength(0)

    await userEvent.click(toggle)
    const items = within(cleared()).getAllByRole('article')
    expect(items).toHaveLength(3)
    const upc = items.find((a) => a.getAttribute('data-cleared-id') === 'cl-upc')!
    expect(within(upc).getByRole('heading', { name: 'UPC check digit is valid' })).toBeInTheDocument()
    expect(upc).toHaveTextContent(/odd-position digits 4 × 3 = 12/)
    expect(upc).toHaveTextContent('Checked by code')
    expect(within(upc).getByRole('button', { name: /Sheet · E12/ })).toBeInTheDocument()
    await userEvent.click(within(cleared()).getByRole('button', { name: 'Hide the proofs' }))
    expect(within(cleared()).queryAllByRole('article')).toHaveLength(0)
  })

  it('the filter has a "Checked and fine" option that shows only the panel, open', async () => {
    renderWithProject(<Checks />)
    const filters = screen.getByRole('group', { name: 'Filter checks' })
    await userEvent.click(within(filters).getByRole('button', { name: 'Checked and fine 3' }))
    expect(within(filters).getByRole('button', { name: 'Checked and fine 3' })).toHaveAttribute('aria-pressed', 'true')
    for (const v of ['fail', 'review', 'pass']) expect(document.querySelector(`[data-group="${v}"]`)).toBeNull()
    expect(within(cleared()).getAllByRole('article')).toHaveLength(3)
    // The other filters hide it.
    await userEvent.click(within(filters).getByRole('button', { name: 'Fail 4' }))
    expect(document.querySelector('[data-group="cleared"]')).toBeNull()
  })

  it('says so when nothing was set aside', () => {
    renderWithProject(<Checks />, '/', { ...mockProject, cleared: [] })
    expect(within(cleared()).getByText('Nothing was set aside as fine.')).toBeInTheDocument()
  })
})

describe('Deep link to a finding', () => {
  it('?finding=<id> selects that finding, scrolls its row into view and focuses its card', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    renderWithProject(<Checks />, '/checks?finding=f-pass-identity')
    await waitFor(() => expect(document.querySelector('article[data-finding-id="f-pass-identity"]')).toHaveFocus())
    expect(document.querySelector('[data-finding-row][data-finding-id="f-pass-identity"]')).toHaveAttribute('aria-current', 'true')
    expect(scroll).toHaveBeenCalled()
  })

  it('an unknown id changes nothing', () => {
    renderWithProject(<Checks />, '/checks?finding=nope')
    expect(rows()).toHaveLength(9)
    expect(screen.getByRole('article', { name: /Honey percentage/ })).toBeInTheDocument()
    expect(document.body).toHaveFocus()
  })
})

describe('Needs review decisions (mock mode: applied locally)', () => {
  it('needs a name before it decides, and then logs the decision with the note', async () => {
    renderWithProject(<Checks />)
    const card = await open(/HIGH-GRAIN/)
    await userEvent.click(within(card).getByRole('button', { name: "It's fine" }))
    expect(within(card).getByRole('alert')).toHaveTextContent('Add your name first')
    expect(within(card).getByLabelText('Your name')).toHaveFocus()

    await userEvent.type(within(card).getByLabelText('Your name'), 'Priya')
    await userEvent.type(within(card).getByLabelText('Note (optional)'), 'Approved by Regulatory')
    await userEvent.click(within(card).getByRole('button', { name: "It's fine" }))

    expect(within(card).getByText('Decided: fine')).toBeInTheDocument()
    expect(within(card).getByText(/Priya decided: it's fine/)).toBeInTheDocument()
    expect(within(card).getByText(/Approved by Regulatory/)).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: "It's fine" })).toBeNull()
    // The item stays in the review group; the queue shrinks; the name is remembered.
    expect(within(group('review')).getByRole('heading', { level: 2 })).toHaveTextContent('1 left to decide')
    expect(row(/HIGH-GRAIN/)).toHaveTextContent('Decided: fine')
    expect(window.localStorage.getItem('bf.approver')).toBe('Priya')
  })

  it('"It\'s a problem" is shown as a problem', async () => {
    window.localStorage.setItem('bf.approver', 'Priya')
    renderWithProject(<Checks />)
    const card = await open(/Vegan claim/)
    expect(within(card).getByLabelText('Your name')).toHaveValue('Priya')
    await userEvent.click(within(card).getByRole('button', { name: "It's a problem" }))
    expect(within(card).getByText('Decided: a problem')).toBeInTheDocument()
  })
})

describe('Needs review decisions (api mode)', () => {
  const decided = (): Project => {
    const p = structuredClone(project)
    const f = p.findings.find((x) => x.id === 'f-claim-high-grain')!
    f.decision = { verdict: 'pass', by: 'Priya', at: '2026-10-21T09:00:00+05:30', note: 'Approved by Regulatory' }
    return p
  }

  it('POSTs {verdict, by, note} to /api/findings/{id}/decision and shows the project it returns', async () => {
    let body: unknown
    const f = stubFetch(
      get('/api/project', () => json(project)),
      post('/api/findings/f-claim-high-grain/decision', (init) => {
        body = JSON.parse(String(init?.body))
        return json(decided())
      }),
    )
    renderLive(<Checks />, { gate: true })
    const card = await open(/HIGH-GRAIN/)
    await userEvent.type(within(card).getByLabelText('Your name'), 'Priya')
    await userEvent.type(within(card).getByLabelText('Note (optional)'), 'Approved by Regulatory')
    await userEvent.click(within(card).getByRole('button', { name: "It's fine" }))
    expect(await within(card).findByText(/Priya decided: it's fine/)).toBeInTheDocument()
    expect(body).toEqual({ verdict: 'pass', by: 'Priya', note: 'Approved by Regulatory' })
    expect(calls(f)).toContain('POST /api/findings/f-claim-high-grain/decision')
  })

  it('a refused decision goes back to undecided and shows the reason', async () => {
    stubFetch(
      get('/api/project', () => json(project)),
      post('/api/findings/f-claim-high-grain/decision', () => json({ detail: 'Only review items can be decided' }, 422)),
    )
    renderLive(<Checks />, { gate: true })
    const card = await open(/HIGH-GRAIN/)
    await userEvent.type(within(card).getByLabelText('Your name'), 'Priya')
    await userEvent.click(within(card).getByRole('button', { name: "It's a problem" }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The decision was not saved: Only review items can be decided')
    await waitFor(() => expect(within(card).getByRole('button', { name: "It's a problem" })).toBeInTheDocument())
  })

  it('keeps the decision locally when the backend has no decision route yet', async () => {
    stubFetch(
      get('/api/project', () => json(project)),
      post('/api/findings/f-claim-high-grain/decision', () => json({ detail: 'Not Found' }, 404)),
    )
    renderLive(<Checks />, { gate: true })
    const card = await open(/HIGH-GRAIN/)
    await userEvent.type(within(card).getByLabelText('Your name'), 'Priya')
    await userEvent.click(within(card).getByRole('button', { name: "It's fine" }))
    expect(await within(card).findByText(/Priya decided/)).toBeInTheDocument()
  })
})

describe('Checks states', () => {
  const gated = () => (
    <LoadGate empty={<EmptyChecks />}>
      <Checks />
    </LoadGate>
  )

  it('shows skeletons while loading', async () => {
    stubFetch(() => new Promise<Response>(() => {}))
    renderLive(gated())
    expect(screen.getByRole('status', { name: 'Loading project' })).toBeInTheDocument()
  })

  it('empty: no files says what to add', async () => {
    stubFetch(get('/api/project', () => json({ detail: 'No files uploaded yet' }, 404)))
    renderLive(gated())
    expect(await screen.findByText('No checks yet: add the artwork and the approved product information.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Files' })).toHaveAttribute('href', '/evidence')
  })

  it('empty: files read but no findings', () => {
    renderWithProject(<Checks />, '/', { ...mockProject, findings: [] })
    expect(screen.getByRole('heading', { name: 'No checks yet' })).toBeInTheDocument()
  })

  it('error: shows the reason and a Retry', async () => {
    let fail = true
    stubFetch((url) => (url === '/api/project' ? (fail ? json({ detail: 'Disk is full' }, 500) : json(project)) : undefined))
    renderLive(gated())
    expect(await screen.findByRole('alert')).toHaveTextContent('Disk is full')
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Checks', level: 1 })).toBeInTheDocument()
  })

  it('partial: a banner names the file that could not be read, and the checks still show', async () => {
    const p = structuredClone(project)
    p.files[1] = { ...p.files[1], status: 'error', error: 'Password protected' }
    stubFetch(get('/api/project', () => json(p)))
    renderLive(gated())
    expect(await screen.findByText(/Partial result: 2 of 3 files read/)).toBeInTheDocument()
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0)
  })
})

/// <reference types="node" />
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mockProject } from '../state/project'
import { calls, get, json, renderLive, stubFetch } from '../test/renderLive'
import { renderWithProject } from '../test/render'
import type { Project } from '../types/project'
import { AppShell } from '../shell/AppShell'
import { Brief } from './Brief'

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
const clone = (): Project => structuredClone(mockProject)

/** The sample brief with its one unproven sentence fixed. */
function allProven(): Project {
  const p = clone()
  for (const s of p.brief.sections) for (const x of s.sentences) Object.assign(x, { status: 'ok', problems: [] })
  return p
}

const sentence = (key: string) => document.querySelector<HTMLElement>(`li[data-sentence="${key}"]`)!
const UNPROVEN = 'Nutrition panel instructions:3'

beforeEach(() => {
  try {
    window.localStorage.clear()
  } catch {
    /* ignore */
  }
})
afterEach(() => vi.unstubAllGlobals())

describe('Brief screen: document', () => {
  it('renders the eight sections, an outline and the version label', () => {
    renderWithProject(<Brief />)
    const doc = screen.getByRole('article', { name: 'Design brief' })
    const titles = within(doc)
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
      .filter((t) => t !== 'Sources')
    expect(titles).toEqual([
      'Objective',
      'Product facts',
      'Mandatory content by panel',
      'Keep / Change / Add / Remove',
      'Allowed claims (and removed claims, with reason)',
      'Nutrition panel instructions',
      'Open questions for the agency',
      'Acceptance checklist',
    ])
    expect(within(screen.getByRole('navigation', { name: 'Brief outline' })).getAllByRole('button')).toHaveLength(8)
    expect(screen.getByTestId('brief-version')).toHaveTextContent(/^Draft 3 · edited .+ ago$/)
  })

  it('shows source dots that open the Source Drawer, and who wrote each sentence', async () => {
    renderWithProject(<Brief />)
    const row = sentence('Product facts:1')
    const dot = within(row).getByRole('button', { name: /Source for Net quantity \(Confirmed\)/ })
    expect(dot).toHaveAttribute('title', expect.stringContaining('Net quantity'))
    expect(within(row).getByText('Written by code:')).toBeInTheDocument()
    expect(within(sentence('Objective:0')).getByText('Written by AI, then audited:')).toBeInTheDocument()
    expect(within(sentence('Keep / Change / Add / Remove:3')).getByText('Written or edited by you:')).toBeInTheDocument()
    await userEvent.click(dot)
    expect(await screen.findByRole('dialog', { name: 'Source' })).toBeInTheDocument()
  })

  it('underlines an unproven sentence in violet dotted, with a tooltip that lists the problems', () => {
    renderWithProject(<Brief />)
    const row = sentence(UNPROVEN)
    expect(row).toHaveAttribute('data-status', 'unproven')
    const text = within(row).getByRole('button', { name: 'Protein 40 g per serving.' })
    expect(text.className).toMatch(/decoration-dotted/)
    expect(text.className).toMatch(/decoration-ai/)
    const tip = within(row).getByRole('tooltip')
    expect(tip).toHaveTextContent('Not in facts — add a source or mark as assumption')
    expect(tip).toHaveTextContent('40 is not in the facts (Protein is 34 g)')
    expect(text).toHaveAccessibleDescription(/Not in facts/)
    expect(within(row).getByText('Unproven')).toBeInTheDocument()
    expect(within(sentence('Product facts:0')).queryByRole('tooltip')).toBeNull()
  })

  it('disables Approve with a stated reason while any sentence is unproven', () => {
    renderWithProject(<Brief />)
    const approve = screen.getByRole('button', { name: 'Approve' })
    expect(approve).toBeDisabled()
    expect(screen.getByTestId('approve-reason')).toHaveTextContent('Approve is off. 1 sentence is not in the facts.')
    expect(approve).toHaveAccessibleDescription(/1 sentence is not in the facts/)
  })

  it('a typed number that is not a fact gets the violet underline and keeps Approve off', async () => {
    renderWithProject(<Brief />, '/', allProven())
    await userEvent.type(screen.getByLabelText('Your name'), 'Priya')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()

    await userEvent.click(within(sentence('Product facts:1')).getByRole('button', { name: 'Net quantity: 480 g.' }))
    const box = screen.getByLabelText('Edit sentence 2 of Product facts')
    await userEvent.clear(box)
    await userEvent.type(box, 'Net quantity: 999 g.{Enter}')
    const row = sentence('Product facts:1')
    expect(row).toHaveAttribute('data-status', 'unproven')
    expect(within(row).getByRole('tooltip')).toHaveTextContent('999 is not in the facts')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  })

  it('shows the section as empty rather than blank', () => {
    const p = clone()
    p.brief.sections[1].sentences = []
    renderWithProject(<Brief />, '/', p)
    expect(screen.getByText('Nothing in this section yet.')).toBeInTheDocument()
  })
})

describe('Brief screen: draft, edit, approve (against the API)', () => {
  const briefRoutes = (project: Project) => get('/api/project', () => json(project))

  it('empty state offers Draft, shows skeletons, then the document', async () => {
    const empty: Project = { ...clone(), brief: { version: 0, sections: [] } }
    let release!: () => void
    const wait = new Promise<void>((r) => (release = r))
    const f = stubFetch(briefRoutes(empty), (url, init) =>
      url === '/api/brief/draft' && init?.method === 'POST' ? wait.then(() => json(clone())) : undefined,
    )
    renderLive(<Brief />, { gate: true })
    expect(await screen.findByRole('heading', { name: 'Answer the open questions, then draft the brief' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Draft the brief' }))
    expect(await screen.findByRole('status', { name: 'Drafting the brief' })).toBeInTheDocument()
    release()
    expect(await screen.findByRole('article', { name: 'Design brief' })).toBeInTheDocument()
    expect(calls(f)).toContain('POST /api/brief/draft')
  })

  it('a failed draft shows the reason and Retry', async () => {
    const empty: Project = { ...clone(), brief: { version: 0, sections: [] } }
    let fail = true
    stubFetch(briefRoutes(empty), (url, init) =>
      url === '/api/brief/draft' && init?.method === 'POST' ? (fail ? json({ detail: 'The AI service is busy' }, 502) : json(clone())) : undefined,
    )
    renderLive(<Brief />, { gate: true })
    await userEvent.click(await screen.findByRole('button', { name: 'Draft the brief' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI service is busy')
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('article', { name: 'Design brief' })).toBeInTheDocument()
  })

  it('editing a sentence PATCHes section, index, text and fact ids, then shows the audited result', async () => {
    const after = clone()
    after.brief.version = 4
    Object.assign(after.brief.sections[1].sentences[1], {
      text: 'Net quantity: 480 g (16.9 oz).',
      source: 'user',
    })
    let body: unknown
    const f = stubFetch(briefRoutes(clone()), (url, init) => {
      if (url === '/api/brief/sentences' && init?.method === 'PATCH') {
        body = JSON.parse(String(init.body))
        return json(after)
      }
    })
    renderLive(<Brief />, { gate: true })
    await userEvent.click(await screen.findByRole('button', { name: 'Net quantity: 480 g.' }))
    const box = screen.getByLabelText('Edit sentence 2 of Product facts')
    await userEvent.clear(box)
    await userEvent.type(box, 'Net quantity: 480 g (16.9 oz).{Enter}')
    await waitFor(() => expect(calls(f)).toContain('PATCH /api/brief/sentences'))
    expect(body).toEqual({ section: 'Product facts', index: 1, text: 'Net quantity: 480 g (16.9 oz).', factIds: ['f-net-qty'] })
    expect(await screen.findByRole('button', { name: 'Net quantity: 480 g (16.9 oz).' })).toBeInTheDocument()
    expect(screen.getByTestId('brief-version')).toHaveTextContent('Draft 4')
  })

  it('Escape or an unchanged sentence sends nothing', async () => {
    const f = stubFetch(briefRoutes(clone()))
    renderLive(<Brief />, { gate: true })
    await userEvent.click(await screen.findByRole('button', { name: 'Net quantity: 480 g.' }))
    await userEvent.type(screen.getByLabelText('Edit sentence 2 of Product facts'), ' x{Escape}')
    expect(screen.getByRole('button', { name: 'Net quantity: 480 g.' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Net quantity: 480 g.' }))
    await userEvent.keyboard('{Enter}')
    expect(calls(f).filter((c) => c.startsWith('PATCH'))).toHaveLength(0)
  })

  it('a refused edit keeps the editor open and says why', async () => {
    stubFetch(briefRoutes(clone()), (url, init) => (url === '/api/brief/sentences' && init?.method === 'PATCH' ? json({ detail: 'Section not found' }, 400) : undefined))
    renderLive(<Brief />, { gate: true })
    await userEvent.click(await screen.findByRole('button', { name: 'Net quantity: 480 g.' }))
    await userEvent.type(screen.getByLabelText('Edit sentence 2 of Product facts'), ' extra{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('The edit was not saved: Section not found')
    expect(screen.getByLabelText('Edit sentence 2 of Product facts')).toBeInTheDocument()
  })

  it('Approve posts the name, stamps "Approved by NAME · time" and remembers the name', async () => {
    let body: unknown
    const approved = allProven()
    approved.brief.approvedBy = 'Priya'
    approved.brief.approvedAt = '2026-10-17T14:05:00+00:00'
    stubFetch(briefRoutes(allProven()), (url, init) => {
      if (url === '/api/brief/approve' && init?.method === 'POST') {
        body = JSON.parse(String(init.body))
        return json(approved)
      }
    })
    renderLive(<Brief />, { gate: true })
    const approve = await screen.findByRole('button', { name: 'Approve' })
    expect(approve).toBeDisabled()
    expect(screen.getByTestId('approve-reason')).toHaveTextContent('Enter your name to approve.')
    await userEvent.type(screen.getByLabelText('Your name'), 'Priya')
    await userEvent.click(approve)
    const stampEl = await screen.findByTestId('approved-stamp')
    expect(stampEl).toHaveTextContent(/^Approved by Priya · /)
    expect(body).toEqual({ name: 'Priya' })
    expect(window.localStorage.getItem('bf.approver')).toBe('Priya')
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('reads the remembered name from storage', async () => {
    window.localStorage.setItem('bf.approver', 'Priya')
    renderWithProject(<Brief />, '/', allProven())
    expect(screen.getByLabelText('Your name')).toHaveValue('Priya')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  })

  it('a 409 from the backend shows the reason', async () => {
    stubFetch(briefRoutes(allProven()), (url, init) =>
      url === '/api/brief/approve' && init?.method === 'POST' ? json({ detail: '1 sentence is unproven' }, 409) : undefined,
    )
    renderLive(<Brief />, { gate: true })
    await userEvent.type(await screen.findByLabelText('Your name'), 'Priya')
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not approved: 1 sentence is unproven')
  })

  it('approving on the mock stamps the brief', async () => {
    renderWithProject(<Brief />, '/', allProven())
    await userEvent.type(screen.getByLabelText('Your name'), 'Priya')
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.getByTestId('approved-stamp')).toHaveTextContent(/Approved by Priya/)
  })
})

describe('Brief screen: exports', () => {
  it('Export PDF opens the print dialog', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    renderWithProject(<Brief />)
    await userEvent.click(screen.getByRole('button', { name: 'Export PDF' }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('Export checklist (JSON) downloads /api/brief/checklist.json', async () => {
    const f = stubFetch(get('/api/brief/checklist.json', () => new Response('{"items":[]}', { status: 200 })))
    const create = vi.fn(() => 'blob:checklist')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderWithProject(<Brief />)
    await userEvent.click(screen.getByRole('button', { name: 'Export checklist (JSON)' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(calls(f)).toEqual(['GET /api/brief/checklist.json'])
    expect(click).toHaveBeenCalled()
    click.mockRestore()
  })

  it('a failed checklist export says why', async () => {
    stubFetch(get('/api/brief/checklist.json', () => json({ detail: 'No brief yet' }, 404)))
    renderWithProject(<Brief />)
    await userEvent.click(screen.getByRole('button', { name: 'Export checklist (JSON)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The checklist could not be exported: No brief yet')
  })

  it('Copy share link copies the address', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderWithProject(<Brief />)
    await userEvent.click(screen.getByRole('button', { name: 'Copy share link' }))
    expect(writeText).toHaveBeenCalledWith(window.location.href)
    expect(await screen.findByText('Link copied')).toBeInTheDocument()
  })
})

describe('Brief screen: print', () => {
  it('print CSS hides the controls and chrome and shows the print-only parts', () => {
    expect(css).toMatch(/@media print\s*{[\s\S]*\.no-print\s*{\s*display:\s*none\s*!important/)
    expect(css).toMatch(/\.print-only\s*{\s*display:\s*none/)
    expect(css).toMatch(/@media print\s*{[\s\S]*\.print-only\s*{\s*display:\s*revert/)

    renderWithProject(
      <AppShell>
        <Brief />
      </AppShell>,
    )
    expect(screen.getByRole('group', { name: 'Brief actions' })).toHaveClass('no-print')
    expect(screen.getByRole('navigation', { name: 'Brief outline' })).toHaveClass('no-print')
    expect(screen.getByRole('navigation', { name: 'Steps' })).toHaveClass('no-print')
    expect(screen.getByRole('banner')).toHaveClass('no-print')
    expect(document.querySelector('[data-testid="source-dots"] .no-print')).not.toBeNull()
  })

  it('prints source dots as superscript refs with a sources appendix', () => {
    renderWithProject(<Brief />)
    const row = sentence('Objective:0')
    const sup = row.querySelector('sup')!
    expect(sup).toHaveClass('print-only')
    expect(sup).toHaveTextContent('[1, 2, 3]')
    const appendix = screen.getByRole('region', { name: 'Sources' })
    expect(appendix).toHaveClass('print-only')
    expect(within(appendix).getAllByRole('listitem').length).toBeGreaterThan(5)
    expect(appendix).toHaveTextContent('[1] Brand: Dancing Fish')
  })
})

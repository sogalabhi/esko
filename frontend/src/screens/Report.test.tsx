import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockProject } from '../state/project'
import { renderWithProject } from '../test/render'
import type { Project } from '../types/project'
import { Report } from './Report'

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.reject(Object.assign(new Error('Missing PDF'), { status: 404 })), destroy: () => {} }),
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }))

const project = (): Project => structuredClone(mockProject)
const section = (name: RegExp | string) => screen.getByRole('region', { name })
afterEach(() => vi.unstubAllGlobals())

describe('Report: header', () => {
  it('names the product, files, rulebook, market and date, with the same verdict line as the top bar', () => {
    renderWithProject(<Report />, '/report', project())
    expect(screen.getByRole('heading', { name: 'Report', level: 1 })).toBeInTheDocument()
    const meta = document.querySelector('[data-report-meta]') as HTMLElement
    expect(meta).toHaveTextContent('Product')
    expect(meta).toHaveTextContent('DancingFish_Granola_Berry_US_Carton.pdf')
    expect(meta).toHaveTextContent('DancingFish_Granola_BerryCrunch_US_Content_Sheet.xlsx')
    expect(meta).toHaveTextContent('Dancing_Fish_US_Label_Rulebook.docx')
    expect(meta).toHaveTextContent('United States')
    expect(meta).toHaveTextContent(new Date().getFullYear().toString())
    // 4 fails; 2 review items still undecided (the sheet-status one is decided "fine").
    expect(document.querySelector('[data-report-verdict]')).toHaveTextContent('Not ready to print: 4 fail · 2 review')
  })

  it('says "No rulebook loaded" without a rulebook and "Ready to print" when nothing is open', () => {
    const p = project()
    p.rulebook = null
    p.findings = p.findings.filter((f) => f.verdict === 'pass')
    renderWithProject(<Report />, '/report', p)
    expect(document.querySelector('[data-report-meta]')).toHaveTextContent('No rulebook loaded')
    expect(document.querySelector('[data-report-verdict]')).toHaveTextContent('Ready to print')
  })

  it('counts a review item decided "a problem" as a fail, like the top bar', () => {
    const p = project()
    p.findings.find((f) => f.id === 'f-claim-high-grain')!.decision = { verdict: 'fail', by: 'Sam', at: '2026-10-20T10:00:00Z' }
    renderWithProject(<Report />, '/report', p)
    expect(document.querySelector('[data-report-verdict]')).toHaveTextContent('Not ready to print: 5 fail · 1 review')
  })
})

describe('Report: findings', () => {
  it('lists every fail and every review finding, each with verdict word, rules, expected vs found, proof and located quotes', () => {
    const p = project()
    renderWithProject(<Report />, '/report', p)
    for (const f of p.findings.filter((x) => x.verdict !== 'pass')) {
      const card = document.querySelector(`[data-report-finding][data-finding-id="${f.id}"]`) as HTMLElement
      expect(card, f.id).not.toBeNull()
      expect(within(card).getByRole('heading', { name: f.title })).toBeInTheDocument()
      expect(card.querySelectorAll('[data-report-evidence]')).toHaveLength(f.evidence.length)
    }
    const fail = section('Fail 4')
    expect(fail.querySelectorAll('[data-report-finding]')).toHaveLength(4)
    const honey = fail.querySelector('[data-finding-id="f-mismatch-honey"]') as HTMLElement
    expect(within(honey).getByText('Fail')).toBeInTheDocument()
    // Rule ids with the rulebook title.
    expect(honey).toHaveTextContent('DF-02')
    expect(honey).toHaveTextContent('Copy matches the content sheet')
    expect(honey).toHaveTextContent('Expected')
    expect(honey).toHaveTextContent('Found')
    expect(honey).toHaveTextContent('Checked by code')
    // The quote with its file and place.
    expect(honey).toHaveTextContent('DancingFish_Granola_Berry_US_Carton.pdf')
    expect(honey).toHaveTextContent('Carton · Back panel')
    expect(honey.querySelectorAll('[data-crop]').length).toBeGreaterThan(0)
  })

  it('puts undecided review items first, then decided ones with who, when and the note', () => {
    renderWithProject(<Report />, '/report', project())
    const review = section('Needs review 3')
    const ids = [...review.querySelectorAll('[data-report-finding]')].map((e) => e.getAttribute('data-finding-id'))
    expect(ids[ids.length - 1]).toBe('f-approval-sheet-draft')
    const decided = review.querySelector('[data-finding-id="f-approval-sheet-draft"] [data-decision]') as HTMLElement
    expect(decided).toHaveTextContent('Sam Lee (Regulatory) decided: it\'s fine')
    expect(decided).toHaveTextContent('Sheet v4 approved by email')
    expect(within(review.querySelector('[data-finding-id="f-claim-vegan"]') as HTMLElement).getByText('AI judgement — a person decides')).toBeInTheDocument()
  })

  it('lists the passes compactly and the checked-and-fine items with their proofs', () => {
    const p = project()
    renderWithProject(<Report />, '/report', p)
    const pass = section('Pass 2')
    expect(pass.querySelectorAll('[data-report-row]')).toHaveLength(2)
    const cleared = section('Checked and fine 3')
    for (const c of p.cleared) {
      const row = cleared.querySelector(`[data-cleared="${c.id}"]`) as HTMLElement
      expect(row).toHaveTextContent(c.title)
      expect(row).toHaveTextContent(c.proof)
    }
  })

  it('never shows a fail that has no evidence as a fail: it goes under Data problem', () => {
    const p = project()
    p.findings.find((f) => f.id === 'f-missing-address')!.evidence = []
    renderWithProject(<Report />, '/report', p)
    expect(section('Fail 3').querySelector('[data-finding-id="f-missing-address"]')).toBeNull()
    const problem = screen.getByRole('alert')
    expect(problem).toHaveTextContent('Data problem')
    expect(problem).toHaveTextContent(p.findings.find((f) => f.id === 'f-missing-address')!.title)
  })
})

describe('Report: rules, decisions, artwork and sign-off', () => {
  it('lists the rulebook rules with status, and labels an unverified one "unverified, not applied"', () => {
    renderWithProject(<Report />, '/report', project())
    const rules = section(/^Rules used/)
    const df06 = rules.querySelector('[data-rule="DF-06"]') as HTMLElement
    expect(df06).toHaveTextContent('unverified, not applied')
    expect(rules.querySelector('[data-rule="DF-21"]')).toHaveTextContent('proposed, not applied')
    expect(rules.querySelector('[data-rule="DF-02"]')).toHaveTextContent('in force')
    expect(rules.querySelector('[data-rule="DF-02"]')).toHaveTextContent('Fail 1')
    // A market rule a finding cites.
    expect(rules.querySelector('[data-rule="r-us-101-4"]')).toHaveTextContent('US')
  })

  it('the decisions log shows the decided item with who, when and the note', () => {
    renderWithProject(<Report />, '/report', project())
    const log = section('Decisions log 1')
    const row = log.querySelector('[data-decision-of="f-approval-sheet-draft"]') as HTMLElement
    expect(row).toHaveTextContent('Sam Lee (Regulatory)')
    expect(row).toHaveTextContent("It's fine")
    expect(row).toHaveTextContent('Sheet v4 approved by email')
    expect(row.querySelector('time')).toHaveAttribute('datetime', '2026-10-20T15:40:00+05:30')
  })

  it('says so when nobody has decided anything', () => {
    const p = project()
    p.findings.forEach((f) => delete f.decision)
    renderWithProject(<Report />, '/report', p)
    expect(section('Decisions log 0')).toHaveTextContent('No review decision has been made yet.')
  })

  it('marks up the carton with the fail and review marks, with a text list of them', () => {
    renderWithProject(<Report />, '/report', project())
    const art = section('Marked-up artwork')
    const svg = art.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg.querySelector('[data-mark="f-hidden-eu-table"]')).not.toBeNull()
    expect(svg.querySelector('[data-mark="c-honey"]')).not.toBeNull()
    const list = within(art).getByRole('list', { name: 'Marks on the carton' })
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThanOrEqual(6)
    expect(list).toHaveTextContent('An old EU nutrition table is hidden under the US panel')
    expect(art.querySelector('[data-verdict="pass"]')).toBeNull()
  })

  it('has a sign-off block with blank lines', () => {
    renderWithProject(<Report />, '/report', project())
    const sign = section('Sign-off')
    expect(sign).toHaveTextContent('Approved for print by')
    expect(sign).toHaveTextContent('date')
    expect(sign.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(2)
  })
})

describe('Report: printing and states', () => {
  it('the Print report button calls window.print', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    renderWithProject(<Report />, '/report', project())
    await userEvent.setup().click(screen.getByRole('button', { name: 'Print report' }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('hides the button in print and sets the print layout up', () => {
    renderWithProject(<Report />, '/report', project())
    expect(screen.getByRole('button', { name: 'Print report' }).closest('.no-print')).not.toBeNull()
    expect(document.querySelectorAll('.report-break').length).toBeGreaterThanOrEqual(5)
    expect(document.querySelector('.report-doc')).not.toBeNull()
  })

  it('shows an empty state with a way forward when there are no findings', () => {
    const p = project()
    p.findings = []
    renderWithProject(<Report />, '/report', p)
    expect(screen.getByText(/No report yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Files' })).toHaveAttribute('href', '/evidence')
    expect(screen.queryByRole('button', { name: 'Print report' })).toBeNull()
  })
})

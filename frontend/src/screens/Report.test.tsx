import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockProject } from '../state/project'
import { renderWithProject } from '../test/render'
import type { Project } from '../types/project'
import { Report } from './Report'

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

describe('Report: summary tables', () => {
  const rowOf = (root: HTMLElement, id: string) => root.querySelector(`[data-summary-row][data-finding-id="${id}"]`) as HTMLElement

  it('lists every fail in one table, in the order of the marks, with rule, place and expected → found', () => {
    renderWithProject(<Report />, '/report', project())
    const fail = section('Must change before print (4)')
    const table = within(fail).getByRole('table')
    expect(within(table).getByText(/Fail findings, in the order of their marks/)).toBeInTheDocument()
    for (const h of ['Mark', 'Problem', 'Rule', 'Where', 'Expected → Found']) expect(within(table).getByRole('columnheader', { name: h })).toBeInTheDocument()
    const ids = [...fail.querySelectorAll('[data-summary-row]')].map((r) => r.getAttribute('data-finding-id'))
    expect(ids).toHaveLength(4)
    // Numbers ascend; the fail with no spot on the carton comes last with a dash.
    const marks = [...fail.querySelectorAll('[data-summary-row] td:first-child')].map((c) => c.textContent?.trim())
    const numbers = marks.filter((m) => /^\d+$/.test(m ?? '')).map(Number)
    expect(numbers.length).toBeGreaterThanOrEqual(3)
    expect(numbers).toEqual([...numbers].sort((x, y) => x - y))
    const honey = rowOf(fail, 'f-mismatch-honey')
    expect(honey.querySelector('td:first-child')).toHaveTextContent(/^\d+$/)
    expect(honey).toHaveTextContent('DF-02')
    expect(honey).toHaveTextContent('Copy matches the content sheet')
    expect(honey).toHaveTextContent('Carton: Back')
    expect(honey).toHaveTextContent('Sheet: B26')
    expect(honey).toHaveTextContent(/→.*Found/s)
    expect(honey).toHaveTextContent(project().findings.find((f) => f.id === 'f-mismatch-honey')!.expected!)
  })

  it('shows a dash for a fail with no spot on the carton and puts it last', () => {
    const p = project()
    const f = p.findings.find((x) => x.id === 'f-missing-address')!
    f.locations = []
    p.conflicts.forEach((c) => {
      if (f.conflictIds.includes(c.id)) c.locations = []
    })
    renderWithProject(<Report />, '/report', p)
    const rows = [...section('Must change before print (4)').querySelectorAll('[data-summary-row]')]
    const last = rows[rows.length - 1]
    expect(last.getAttribute('data-finding-id')).toBe('f-missing-address')
    expect(last.querySelector('td:first-child')).toHaveTextContent('–')
  })

  it('cuts expected and found at about 60 characters and keeps the whole text in a title', () => {
    const p = project()
    const long = 'Every pack must carry a consumer care line on the back or a side panel, with a phone number'
    p.findings.find((x) => x.id === 'f-mismatch-honey')!.found = long
    renderWithProject(<Report />, '/report', p)
    const row = section('Must change before print (4)').querySelector('[data-finding-id="f-mismatch-honey"]') as HTMLElement
    expect(row.querySelector(`[title="${long}"]`)).not.toBeNull()
    expect(row).not.toHaveTextContent(long)
    expect(row).toHaveTextContent('…')
  })

  it('lists every review item with its status, and the decision with who, when and the note', () => {
    renderWithProject(<Report />, '/report', project())
    const review = section('Needs a person (3)')
    expect(within(review).getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    expect(review.querySelectorAll('[data-summary-row]')).toHaveLength(3)
    expect(within(rowOf(review, 'f-claim-vegan')).getByText('Not decided yet')).toBeInTheDocument()
    const decided = rowOf(review, 'f-approval-sheet-draft')
    expect(decided).toHaveTextContent(/Fine — Sam Lee \(Regulatory\), 20 Oct 2026/)
    expect(decided).toHaveTextContent('Sheet v4 approved by email')
    expect(decided.querySelector('[data-status="pass"]')).not.toBeNull()
  })

  it('the sign-off follows the two tables and comes before the marked-up artwork', () => {
    renderWithProject(<Report />, '/report', project())
    const sign = section('Sign-off')
    expect(sign).toHaveTextContent('Approved for print by')
    expect(sign).toHaveTextContent('date')
    expect(sign.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(2)
    const after = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(after(section('Needs a person (3)'), sign)).toBe(true)
    expect(after(sign, section('Marked-up artwork'))).toBe(true)
    expect(after(section('Marked-up artwork'), section(/^Evidence for each finding/))).toBe(true)
  })
})

describe('Report: evidence for each finding', () => {
  it('has a compact block per non-math finding: mark and title, rule, expected, found, proof and located quotes', () => {
    const p = project()
    renderWithProject(<Report />, '/report', p)
    const evidence = section(/^Evidence for each finding/)
    for (const f of p.findings.filter((x) => x.verdict !== 'pass' && x.kind !== 'math')) {
      const card = evidence.querySelector(`article[data-report-finding][data-finding-id="${f.id}"]`) as HTMLElement
      expect(card, f.id).not.toBeNull()
      expect(within(card).getByRole('heading', { level: 4 })).toHaveTextContent(new RegExp(`^(Mark \\d+|No mark) · ${f.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
      expect(card.querySelectorAll('[data-report-evidence]')).toHaveLength(f.evidence.length)
    }
    const honey = evidence.querySelector('[data-finding-id="f-mismatch-honey"]') as HTMLElement
    expect(within(honey).getByText('Fail')).toBeInTheDocument()
    expect(honey).toHaveTextContent('DF-02')
    expect(honey).toHaveTextContent('Copy matches the content sheet')
    expect(honey).toHaveTextContent('Expected')
    expect(honey).toHaveTextContent('Found')
    expect(honey).toHaveTextContent('Checked by code')
    // Each quote with its place, and whether code found it.
    expect(honey).toHaveTextContent('Carton · Back panel')
    expect(honey).toHaveTextContent('Content sheet · B26')
    expect(honey).toHaveTextContent('checked by code')
  })

  it('shows at most one crop per finding, from the carton PDF, and never a spreadsheet grid', () => {
    const p = project()
    renderWithProject(<Report />, '/report', p)
    const evidence = section(/^Evidence for each finding/)
    for (const card of evidence.querySelectorAll('[data-report-finding]')) expect(card.querySelectorAll('[data-crop]').length).toBeLessThanOrEqual(1)
    // Honey: the first evidence is a sheet cell, so the crop is of the carton one.
    const honey = evidence.querySelector('[data-finding-id="f-mismatch-honey"]') as HTMLElement
    expect(honey.querySelectorAll('[data-crop]')).toHaveLength(1)
    expect(honey.querySelector('[data-highlight]')).not.toBeNull()
    // The sheet-only finding has no crop at all.
    expect(evidence.querySelector('[data-finding-id="f-approval-sheet-draft"] [data-crop]')).toBeNull()
    expect(document.querySelector('table[aria-label^="Sheet grid"]')).toBeNull()
  })

  it('a finding whose only evidence is a sheet cell has quote lines but no crop', () => {
    renderWithProject(<Report />, '/report', project())
    const card = document.querySelector('article[data-finding-id="f-approval-sheet-draft"]') as HTMLElement
    expect(card.querySelectorAll('[data-report-evidence]')).toHaveLength(1)
    expect(card.querySelectorAll('[data-crop]')).toHaveLength(0)
    expect(card).toHaveTextContent('Content sheet · E3')
  })

  it('marks an AI judgement for a person and decided items with who and the note', () => {
    renderWithProject(<Report />, '/report', project())
    const decided = document.querySelector('article[data-finding-id="f-approval-sheet-draft"] [data-decision]') as HTMLElement
    expect(decided).toHaveTextContent("Sam Lee (Regulatory) decided: it's fine")
    expect(decided).toHaveTextContent('Sheet v4 approved by email')
    expect(within(document.querySelector('article[data-finding-id="f-claim-vegan"]') as HTMLElement).getByText('AI judgement — a person decides')).toBeInTheDocument()
  })

  it('puts the math findings together in one table with printed, computed, working and source', () => {
    renderWithProject(<Report />, '/report', project())
    const evidence = section(/^Evidence for each finding/)
    const math = within(evidence).getByRole('table', { name: /Numbers checked by code/ })
    for (const h of ['Item', 'Printed', 'Computed by code', 'Working', 'Source']) expect(within(math).getByRole('columnheader', { name: h })).toBeInTheDocument()
    const rows = within(math).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    const f = project().findings.find((x) => x.id === 'f-math-dv-total-fat')!
    expect(row).toHaveTextContent(f.title)
    expect(row).toHaveTextContent(f.found!)
    expect(row).toHaveTextContent(f.expected!)
    expect(row).toHaveTextContent(f.proof!)
    expect(row).toHaveTextContent('Carton: Left')
    expect(row).toHaveAttribute('data-finding-id', 'f-math-dv-total-fat')
    // No separate block for it.
    expect(evidence.querySelector('article[data-finding-id="f-math-dv-total-fat"]')).toBeNull()
  })

  it('groups the blocks under Fail and Needs review', () => {
    renderWithProject(<Report />, '/report', project())
    const evidence = section(/^Evidence for each finding/)
    expect(within(evidence).getByRole('heading', { name: 'Fail (3)', level: 3 })).toBeInTheDocument()
    expect(within(evidence).getByRole('heading', { name: 'Needs review (3)', level: 3 })).toBeInTheDocument()
    const ids = [...evidence.querySelectorAll('article[data-report-finding]')].map((e) => e.getAttribute('data-verdict'))
    expect(ids.slice(0, 3)).toEqual(['fail', 'fail', 'fail'])
    // Undecided review items come before the decided one.
    const review = [...evidence.querySelectorAll('[data-ev-group="review"] article')].map((e) => e.getAttribute('data-finding-id'))
    expect(review[review.length - 1]).toBe('f-approval-sheet-draft')
  })

  it('lists the passes and the checked-and-fine items one line each', () => {
    const p = project()
    renderWithProject(<Report />, '/report', p)
    const pass = section('Passed (2)')
    const lines = pass.querySelectorAll('[data-report-row]')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveTextContent(p.findings.find((f) => f.id === lines[0].getAttribute('data-finding-id'))!.title)
    expect(lines[0]).toHaveTextContent(/Carton: Front/)
    const cleared = section('Checked and fine (3)')
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
    expect(section('Must change before print (3)').querySelector('[data-finding-id="f-missing-address"]')).toBeNull()
    const problem = screen.getByRole('alert')
    expect(problem).toHaveTextContent('Data problem')
    expect(problem).toHaveTextContent(p.findings.find((f) => f.id === 'f-missing-address')!.title)
  })
})

describe('Report: rules, decisions and artwork', () => {
  it('lists the rulebook rules with status, and labels an unverified one "unverified, not applied"', () => {
    renderWithProject(<Report />, '/report', project())
    const rules = section(/^Rules used/)
    for (const h of ['Rule', 'Title / summary', 'Source', 'Status', 'Results']) expect(within(rules).getByRole('columnheader', { name: h })).toBeInTheDocument()
    const df06 = rules.querySelector('[data-rule="DF-06"]') as HTMLElement
    expect(df06).toHaveTextContent('unverified, not applied')
    expect(rules.querySelector('[data-rule="DF-21"]')).toHaveTextContent('proposed, not applied')
    expect(rules.querySelector('[data-rule="DF-02"]')).toHaveTextContent('in force')
    expect(rules.querySelector('[data-rule="DF-02"]')).toHaveTextContent('1 fail')
    // A market rule a finding cites, by its regulation reference, with the full summary in a title.
    const market = rules.querySelector('[data-rule="r-us-101-4"]') as HTMLElement
    expect(market).toHaveTextContent('US')
    expect(market.querySelector('[title]')).not.toBeNull()
  })

  it('the decisions log shows the decided item with who, when and the note', () => {
    renderWithProject(<Report />, '/report', project())
    const log = section('Decisions log (1)')
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
    expect(section('Decisions log (0)')).toHaveTextContent('No review decision has been made yet.')
  })

  it('marks up the carton with the fail and review marks; the numbers are explained by the summary tables, not a second list', () => {
    renderWithProject(<Report />, '/report', project())
    const art = section('Marked-up artwork')
    const svg = art.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg.querySelector('[data-mark="f-hidden-eu-table"]')).not.toBeNull()
    expect(svg.querySelector('[data-mark="c-honey"]')).not.toBeNull()
    expect(within(art).queryByRole('list', { name: 'Marks on the carton' })).toBeNull()
    expect(art.querySelector('[data-verdict="pass"]')).toBeNull()
  })
})

describe('Report: printing and states', () => {
  it('the Print report button calls window.print with everything on', async () => {
    const seen: (string | null)[] = []
    const print = vi.fn(() => seen.push(document.querySelector('.report-doc')!.getAttribute('data-print')))
    vi.stubGlobal('print', print)
    renderWithProject(<Report />, '/report', project())
    await userEvent.setup().click(screen.getByRole('button', { name: 'Print report' }))
    expect(print).toHaveBeenCalledTimes(1)
    expect(seen).toEqual(['all'])
  })

  it('Print summary sets the summary-only mode before printing and restores everything after printing', async () => {
    const seen: (string | null)[] = []
    const print = vi.fn(() => seen.push(document.querySelector('.report-doc')!.getAttribute('data-print')))
    vi.stubGlobal('print', print)
    renderWithProject(<Report />, '/report', project())
    await userEvent.setup().click(screen.getByRole('button', { name: 'Print summary' }))
    expect(print).toHaveBeenCalledTimes(1)
    expect(seen).toEqual(['summary'])
    const doc = document.querySelector('.report-doc')!
    expect(doc).toHaveAttribute('data-print', 'summary')
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(doc).toHaveAttribute('data-print', 'all')
  })

  it('tags the summary parts and the appendix parts so print can hide the appendix', () => {
    renderWithProject(<Report />, '/report', project())
    const part = (id: string) => document.querySelector(`[data-report-section="${id}"]`)?.getAttribute('data-part')
    for (const id of ['rep-fail', 'rep-review', 'rep-artwork']) expect(part(id), id).toBe('summary')
    for (const id of ['rep-evidence', 'rep-pass', 'rep-cleared', 'rep-rules', 'rep-decisions']) expect(part(id), id).toBe('detail')
    expect(document.querySelector('[data-signoff]')).toHaveAttribute('data-part', 'summary')
  })

  it('hides the buttons in print and gives the artwork its own page', () => {
    renderWithProject(<Report />, '/report', project())
    expect(screen.getByRole('button', { name: 'Print report' }).closest('.no-print')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Print summary' }).closest('.no-print')).not.toBeNull()
    expect(document.querySelector('.report-doc')).not.toBeNull()
    expect(document.querySelector('[data-report-section="rep-artwork"]')).toHaveClass('report-artwork-page')
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

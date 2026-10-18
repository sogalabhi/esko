import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  contrastOnWhite,
  cssString,
  DEFAULT_ACCENT,
  DEFAULT_FOOTER,
  defaultLetterhead,
  LETTERHEAD_KEY,
  loadLetterhead,
  logoProblem,
  marketName,
  printTitle,
  readableAccent,
  saveLetterhead,
} from './letterhead'

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('letterhead settings', () => {
  it('defaults: no company or logo, the app accent, the standard footer and the saved approver', () => {
    window.localStorage.setItem('bf.approver', 'Priya')
    expect(loadLetterhead()).toEqual({
      company: '',
      logo: null,
      accent: DEFAULT_ACCENT,
      preparedFor: '',
      preparedBy: 'Priya',
      reference: '',
      footer: DEFAULT_FOOTER,
    })
  })

  it('saves and loads', () => {
    const l = { ...defaultLetterhead(), company: 'Acme Foods', accent: '#1d4ed8', logo: 'data:image/png;base64,AAAA', preparedBy: '' }
    expect(saveLetterhead(l)).toBe(true)
    expect(JSON.parse(window.localStorage.getItem(LETTERHEAD_KEY)!)).toEqual(l)
    expect(loadLetterhead()).toEqual(l)
  })

  it('a cleared "Prepared by" stays cleared rather than refilling from the approver', () => {
    window.localStorage.setItem('bf.approver', 'Priya')
    saveLetterhead({ ...defaultLetterhead(), preparedBy: '' })
    expect(loadLetterhead().preparedBy).toBe('')
  })

  it('corrupt JSON falls back to the defaults', () => {
    window.localStorage.setItem(LETTERHEAD_KEY, '{not json')
    expect(loadLetterhead()).toEqual(defaultLetterhead())
    window.localStorage.setItem(LETTERHEAD_KEY, '[1,2]')
    expect(loadLetterhead()).toEqual(defaultLetterhead())
  })

  it('wrong field types fall back field by field', () => {
    window.localStorage.setItem(
      LETTERHEAD_KEY,
      JSON.stringify({ company: 42, accent: 'red', logo: 'javascript:alert(1)', footer: 'Internal', reference: 'R-1' }),
    )
    const l = loadLetterhead()
    expect(l.company).toBe('')
    expect(l.accent).toBe(DEFAULT_ACCENT)
    expect(l.logo).toBeNull()
    expect(l.footer).toBe('Internal')
    expect(l.reference).toBe('R-1')
  })

  it('blocked storage falls back to the defaults and reports the save as not kept', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(loadLetterhead()).toEqual({ ...defaultLetterhead(), preparedBy: '' })
    expect(saveLetterhead(defaultLetterhead())).toBe(false)
  })

  it('a browser with no localStorage at all still gives defaults', () => {
    const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadLetterhead().footer).toBe(DEFAULT_FOOTER)
    expect(saveLetterhead(defaultLetterhead())).toBe(false)
    spy.mockRestore()
  })
})

describe('logo checks', () => {
  it('accepts PNG, JPG and SVG up to 1 MB', () => {
    expect(logoProblem({ type: 'image/png', size: 1024 * 1024 })).toBeNull()
    expect(logoProblem({ type: 'image/jpeg', size: 10 })).toBeNull()
    expect(logoProblem({ type: 'image/svg+xml', size: 10 })).toBeNull()
  })
  it('rejects bigger files and other types with a clear message', () => {
    expect(logoProblem({ type: 'image/png', size: 2.5 * 1024 * 1024 })).toBe('The logo is 2.5 MB. Use an image of 1 MB or less.')
    expect(logoProblem({ type: 'application/pdf', size: 10 })).toBe('The logo must be a PNG, JPG or SVG image.')
    expect(logoProblem({ type: 'image/gif', size: 10 })).toBe('The logo must be a PNG, JPG or SVG image.')
  })
})

describe('helpers', () => {
  it('darkens a pale accent until headings reach 4.5:1 on white, and leaves a dark one alone', () => {
    expect(readableAccent('#2f7d32')).toBe('#2f7d32')
    const pale = readableAccent('#ffd400')
    expect(contrastOnWhite(pale)).toBeGreaterThanOrEqual(4.5)
    expect(readableAccent('nope')).toBe(DEFAULT_ACCENT)
  })
  it('names the PDF and the market', () => {
    expect(printTitle('Granola — Berry Crunch', 3)).toBe('Design brief – Granola — Berry Crunch – v3')
    expect(marketName('US')).toBe('United States')
    expect(marketName('IN')).toBe('India')
  })
  it('escapes text for a CSS content string', () => {
    expect(cssString('Say "hi" \\ </style>\nnext')).toBe('"Say \\"hi\\" \\\\ \\3c /style> next"')
  })
})

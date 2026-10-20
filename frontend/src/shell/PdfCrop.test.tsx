import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPageImages } from '../lib/pageImage'
import type { PackPanel, Source } from '../types/project'
import { PdfCrop } from './PdfCrop'
import { PdfPreview } from './SourceDrawer'

const PAGE = '/api/files/f-carton/page.jpg'
const panels: PackPanel[] = [{ name: 'Back', x: 100, y: 50, w: 200, h: 100 }]
const source = (where: Source['where']): Source => ({ fileId: 'f-carton', quote: 'q', quoteChecked: true, where }) as Source

const jpeg = () => new Response('jpeg', { status: 200, headers: { 'X-Page-Width-Mm': '400', 'X-Page-Height-Mm': '300' } })
const pageCalls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter(([u]) => u === PAGE)

beforeEach(() => {
  clearPageImages()
  let n = 0
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:page-${++n}`, revokeObjectURL: () => {} }))
})
afterEach(() => vi.unstubAllGlobals())

describe('shared page image', () => {
  it('fetches page.jpg once for many crops', async () => {
    const f = vi.fn(async () => jpeg())
    vi.stubGlobal('fetch', f)
    render(
      <>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <PdfCrop key={i} source={source({ panel: 'Back', bbox: [120 + i, 60, 20, 10] })} panels={panels} onUnavailable={() => {}} />
        ))}
      </>,
    )
    expect(await screen.findAllByRole('img', { name: 'Back crop with the quote outlined' })).toHaveLength(6)
    expect(pageCalls(f)).toHaveLength(1)
    // A crop mounted later reuses it as well.
    render(<PdfCrop source={source({ panel: 'Back' })} panels={panels} onUnavailable={() => {}} />)
    expect(await screen.findAllByRole('img', { name: 'Back crop with the quote outlined' })).toHaveLength(7)
    expect(pageCalls(f)).toHaveLength(1)
  })
})

describe('PdfCrop', () => {
  it('shows "Drawing the carton…" until the image arrives', async () => {
    let done: (r: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((res) => (done = res))))
    render(<PdfCrop source={source({ panel: 'Back' })} panels={panels} onUnavailable={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Drawing the carton…')
    done(jpeg())
    expect(await screen.findByRole('img', { name: 'Back crop with the quote outlined' })).toBeInTheDocument()
    expect(screen.queryByText('Drawing the carton…')).toBeNull()
  })

  it('positions the page image and the quote outline by their mm values', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jpeg()))
    render(<PdfCrop source={source({ panel: 'Back', bbox: [150, 75, 50, 25] })} panels={panels} onUnavailable={() => {}} />)
    const img = await screen.findByRole('img', { name: 'Back crop with the quote outlined' })
    // Panel 200 x 100 mm at (100, 50) on a 400 x 300 mm page.
    expect(img.style.width).toBe('200%')
    expect(img.style.height).toBe('300%')
    expect(img.style.left).toBe('-50%')
    expect(img.style.top).toBe('-50%')
    const box = document.querySelector<HTMLElement>('[data-highlight]')!
    expect(box.style.left).toBe('25%')
    expect(box.style.top).toBe('25%')
    expect(box.style.width).toBe('25%')
    expect(box.style.height).toBe('25%')
  })

  it('crops around the quote when it has no panel', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jpeg()))
    render(<PdfCrop source={source({ bbox: [40, 30, 20, 10] })} panels={[]} onUnavailable={() => {}} />)
    const img = await screen.findByRole('img', { name: 'Page 1 crop with the quote outlined' })
    // Region: 10 mm margin all round, so x 30, y 20, 40 x 30 mm.
    expect(img.style.width).toBe('1000%')
    expect(img.style.left).toBe(`${(-30 / 40) * 100}%`)
    expect(img.style.top).toBe(`${(-20 / 30) * 100}%`)
  })

  it('tells the caller why when the backend cannot draw the page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'x' }), { status: 415, headers: { 'Content-Type': 'application/json' } })))
    const onUnavailable = vi.fn()
    render(<PdfCrop source={source({ panel: 'Back' })} panels={panels} onUnavailable={onUnavailable} />)
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledWith(expect.stringMatching(/not a PDF/)))
  })
})

describe('PdfPreview error', () => {
  it('shows the reason and a Retry that asks the backend again', async () => {
    let answer = () => new Response('', { status: 404 })
    const f = vi.fn(async () => answer())
    vi.stubGlobal('fetch', f)
    render(<PdfPreview source={source({ panel: 'Back', bbox: [150, 75, 50, 25] })} panels={panels} live />)
    expect(await screen.findByText(/The carton could not be drawn \(the backend does not have this file any more\)/)).toBeInTheDocument()
    answer = jpeg
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('img', { name: 'Back crop with the quote outlined' })).toBeInTheDocument()
    expect(pageCalls(f)).toHaveLength(2)
  })
})

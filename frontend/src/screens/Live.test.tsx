import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import mock from '../mocks/project.json'
import { calls, get, json, post, renderLive, stubFetch } from '../test/renderLive'
import type { Project } from '../types/project'
import { Evidence } from './Evidence'
import { Facts } from './Facts'
import { Questions } from './Questions'

const project = mock as unknown as Project

afterEach(() => vi.unstubAllGlobals())

describe('loading, empty and error states', () => {
  it('shows skeletons while loading, then the screen', async () => {
    let release!: () => void
    const wait = new Promise<void>((r) => (release = r))
    stubFetch((url) => (url === '/api/project' ? wait.then(() => json(project)) : undefined))
    renderLive(<Facts />, { gate: true })
    expect(screen.getByRole('status', { name: 'Loading project' })).toBeInTheDocument()
    release()
    expect(await screen.findByRole('heading', { name: 'Facts', level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading project' })).toBeNull()
  })

  it('shows the empty state when no files are uploaded (404)', async () => {
    stubFetch(get('/api/project', () => json({ detail: 'No files uploaded yet' }, 404)))
    renderLive(<Facts />, { gate: true })
    expect(await screen.findByText(/No files yet — drop your packaging files/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Evidence' })).toHaveAttribute('href', '/evidence')
  })

  it('shows the reason and a Retry that loads the project', async () => {
    let fail = true
    stubFetch((url) => (url === '/api/project' ? (fail ? json({ detail: 'Disk is full' }, 500) : json(project)) : undefined))
    renderLive(<Questions />, { gate: true })
    expect(await screen.findByRole('alert')).toHaveTextContent('Disk is full')
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Questions', level: 1 })).toBeInTheDocument()
  })

  it('says when the backend cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    renderLive(<Facts />, { gate: true })
    expect(await screen.findByRole('alert')).toHaveTextContent(/not reachable/)
  })

  it('partial: a banner names the file that could not be read', async () => {
    const p = structuredClone(project)
    p.files[1] = { ...p.files[1], status: 'error', error: 'Password protected' }
    stubFetch(get('/api/project', () => json(p)))
    renderLive(<Facts />, { gate: true })
    expect(await screen.findByText(/Partial result: 1 of 2 files read/)).toBeInTheDocument()
  })

  it('partial: files uploaded but not analysed yet points to Evidence', async () => {
    const p: Project = { ...structuredClone(project), facts: [], conflicts: [], questions: [], requirements: [] }
    stubFetch(get('/api/project', () => json(p)))
    renderLive(<Facts />, { gate: true })
    expect(await screen.findByText(/uploaded but not analysed yet/)).toBeInTheDocument()
  })
})

describe('Evidence upload flow', () => {
  const pdf = () => new File(['%PDF'], 'carton.pdf', { type: 'application/pdf' })
  const xlsx = () => new File(['x'], 'content.xlsx')
  const input = () => document.querySelector<HTMLInputElement>('input[type="file"]')!
  const nameOf = (init?: RequestInit) => ((init?.body as FormData).get('file') as File).name
  const uploaded = (name: string) => json({ id: name, name, type: 'pdf', status: 'read', pieceCount: 3 })
  const noProject = get('/api/project', () => json({ detail: 'No files uploaded yet' }, 404))

  it('empty state, then upload shows steps, runs the analysis and refreshes the counter', async () => {
    let release!: () => void
    const running = new Promise<void>((r) => (release = r))
    const f = stubFetch(
      noProject,
      post('/api/files', (init) => uploaded(nameOf(init))),
      post('/api/project/run', () => running.then(() => json(project))),
    )
    renderLive(<Evidence />)
    expect(await screen.findByText(/No files yet — drop your packaging files/)).toBeInTheDocument()

    await userEvent.upload(input(), [pdf(), xlsx()])
    const steps = await screen.findByRole('status', { name: 'Progress' })
    await waitFor(() => expect(within(steps).getByText('Reading').closest('li')).toHaveAttribute('data-state', 'current'))
    expect(within(steps).getByText('Uploading').closest('li')).toHaveAttribute('data-state', 'done')
    expect(within(steps).getByText('Checking').closest('li')).toHaveAttribute('data-state', 'pending')

    release()
    expect(await screen.findByText('Analysis finished')).toBeInTheDocument()
    expect(screen.getByTestId('evidence-counter')).toHaveTextContent(`${project.facts.length} facts`)
    expect(calls(f).filter((c) => c !== 'GET /api/project')).toEqual(['POST /api/files', 'POST /api/files', 'POST /api/project/run'])
  })

  it('a file the backend rejects is listed with its reason and the others still run', async () => {
    stubFetch(
      noProject,
      post('/api/files', (init) => (nameOf(init) === 'content.xlsx' ? json({ detail: 'Sheet is empty' }, 415) : uploaded(nameOf(init)))),
      post('/api/project/run', () => json(project)),
    )
    renderLive(<Evidence />)
    await screen.findByText(/drop your packaging files above/)
    await userEvent.upload(input(), [pdf(), xlsx()])
    const alert = await screen.findByText('1 file was not uploaded')
    expect(alert.closest('[role="alert"]')).toHaveTextContent('content.xlsx — Sheet is empty')
    expect(screen.getByRole('button', { name: 'Retry failed files' })).toBeInTheDocument()
    expect(screen.getByTestId('evidence-counter')).toHaveTextContent(`${project.facts.length} facts`)
  })

  it('rejects unsupported types without calling the backend', async () => {
    const f = stubFetch(noProject)
    renderLive(<Evidence />)
    await screen.findByText(/drop your packaging files above/)
    await userEvent.upload(input(), new File(['x'], 'virus.exe'), { applyAccept: false })
    expect(await screen.findByText('1 file was not uploaded')).toBeInTheDocument()
    expect(screen.getByText(/This file type cannot be read/)).toBeInTheDocument()
    expect(calls(f)).toEqual(['GET /api/project'])
  })

  it('analysis failure shows the reason and retries', async () => {
    let ok = false
    stubFetch(
      noProject,
      post('/api/files', (init) => uploaded(nameOf(init))),
      post('/api/project/run', () => (ok ? json(project) : json({ detail: 'AI step failed: quota' }, 502))),
    )
    renderLive(<Evidence />)
    await screen.findByText(/drop your packaging files above/)
    await userEvent.upload(input(), [pdf()])
    expect(await screen.findByText('The analysis did not finish')).toBeInTheDocument()
    expect(screen.getByText('AI step failed: quota')).toBeInTheDocument()
    ok = true
    await userEvent.click(screen.getByRole('button', { name: 'Retry analysis' }))
    expect(await screen.findByText('Analysis finished')).toBeInTheDocument()
  })
})

describe('Questions with the answers route', () => {
  const open = (id: string) => document.querySelector<HTMLElement>(`li[data-question="${id}"]`)!
  const choose = () => userEvent.click(within(open('q-vegan')).getByRole('button', { name: /Keep honey, remove vegan claims/ }))

  it('posts the answer and applies the returned project', async () => {
    const returned = structuredClone(project)
    returned.questions[0] = { ...returned.questions[0], status: 'answered', answer: 'Keep honey, remove vegan claims' }
    returned.questions[1] = { ...returned.questions[1], status: 'answered', answer: 'From the server' }
    const f = stubFetch(
      get('/api/project', () => json(project)),
      post('/api/answers', () => json(returned)),
    )
    renderLive(<Questions />, { gate: true })
    await screen.findByRole('heading', { name: 'Questions', level: 1 })
    await choose()
    await waitFor(() => expect(screen.getByTestId('questions-progress')).toHaveTextContent(`2 of ${project.questions.length} answered`))
    const call = f.mock.calls.find(([u]) => u === '/api/answers')!
    expect(JSON.parse(call[1]!.body as string)).toEqual({ questionId: 'q-vegan', answer: 'Keep honey, remove vegan claims' })
  })

  it('keeps the local answer when the route does not exist', async () => {
    stubFetch(
      get('/api/project', () => json(project)),
      post('/api/answers', () => json({ detail: 'Not Found' }, 404)),
    )
    renderLive(<Questions />, { gate: true })
    await screen.findByRole('heading', { name: 'Questions', level: 1 })
    await choose()
    await waitFor(() => expect(open('q-vegan')).toHaveAttribute('data-status', 'answered'))
    expect(screen.queryByText(/was not saved/)).toBeNull()
  })

  it('reverts the card and shows the reason when the answer is refused', async () => {
    stubFetch(
      get('/api/project', () => json(project)),
      post('/api/answers', () => json({ detail: 'Unknown question' }, 422)),
    )
    renderLive(<Questions />, { gate: true })
    await screen.findByRole('heading', { name: 'Questions', level: 1 })
    await choose()
    expect(await screen.findByText(/The answer was not saved: Unknown question/)).toBeInTheDocument()
    expect(open('q-vegan')).toHaveAttribute('data-status', 'open')
  })
})

describe('Source drawer PDF crop', () => {
  it('falls back to the panel frame and says why when the backend has no raw file', async () => {
    const src = project.facts.flatMap((f) => f.sources).find((s) => s.where.bbox && s.where.panel)!
    const f = stubFetch((url, init) => (url.endsWith('/raw') && init?.method === 'HEAD' ? json({ detail: 'Not Found' }, 404) : undefined))
    const { PdfPreview } = await import('../shell/SourceDrawer')
    renderLive(<PdfPreview source={src} panels={project.pack.panels} live />)
    expect(await screen.findByText(/original PDF is not available from the backend yet/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /panel with the quote highlighted/ })).toBeInTheDocument()
    expect(calls(f)[0]).toMatch(/^HEAD \/api\/files\/.+\/raw$/)
  })
})

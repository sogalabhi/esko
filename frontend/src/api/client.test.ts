import { afterEach, describe, expect, it, vi } from 'vitest'
import mock from '../mocks/project.json'
import type { Project } from '../types/project'
import { api, ApiError, defaultDataSource, isAccepted } from './client'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const stub = (impl: (url: string, init?: RequestInit) => Response) => {
  const f = vi.fn((url: string, init?: RequestInit) => Promise.resolve(impl(url, init)))
  vi.stubGlobal('fetch', f)
  return f
}

afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('uses the mock in tests (the real API otherwise)', () => {
    expect(defaultDataSource()).toBe('mock')
  })

  it('getProject returns the project and fills parts the backend has not built', async () => {
    stub(() => json({ files: (mock as unknown as Project).files }))
    const p = await api.getProject()
    expect(p?.files).toHaveLength(2)
    expect(p?.facts).toEqual([])
    expect(p?.pack).toEqual({ panels: [], blocks: [] })
  })

  it('getProject returns null when no files are uploaded (404)', async () => {
    stub(() => json({ detail: 'No files uploaded yet' }, 404))
    expect(await api.getProject()).toBeNull()
  })

  it('turns a failed network call into a plain reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api.getProject()).rejects.toMatchObject({ status: 0, message: expect.stringContaining('not reachable') })
  })

  it('surfaces the backend detail as the error message', async () => {
    stub(() => json({ detail: 'AI step failed: quota' }, 502))
    const err = await api.runProject().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 502, message: 'AI step failed: quota' })
  })

  it('uploadFile posts multipart form data to /api/files', async () => {
    const f = stub(() => json({ id: 'abc', name: 'a.pdf', type: 'pdf', status: 'read', pieceCount: 12 }))
    const res = await api.uploadFile(new File(['x'], 'a.pdf', { type: 'application/pdf' }))
    expect(res.pieceCount).toBe(12)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/files')
    expect(init?.method).toBe('POST')
    expect((init?.body as FormData).get('file')).toBeInstanceOf(File)
  })

  it('runProject posts to /api/project/run', async () => {
    const f = stub(() => json({ files: [] }))
    await api.runProject()
    expect(f.mock.calls[0]).toEqual(['/api/project/run', { method: 'POST' }])
  })

  it('postAnswer sends camelCase JSON and returns the updated project', async () => {
    const f = stub(() => json({ questions: [] }))
    const p = await api.postAnswer('q-1', 'Keep honey')
    expect(p?.questions).toEqual([])
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/answers')
    expect(JSON.parse(init?.body as string)).toEqual({ questionId: 'q-1', answer: 'Keep honey' })
  })

  it('postAnswer returns null when the route does not exist, and throws on a real 404', async () => {
    stub(() => json({ detail: 'Not Found' }, 404))
    expect(await api.postAnswer('q-1', 'a')).toBeNull()
    stub(() => json({ detail: 'No project yet: run /api/project/run first' }, 404))
    await expect(api.postAnswer('q-1', 'a')).rejects.toThrow(/No project yet/)
  })

  it('skip and undo post to the question routes with no body', async () => {
    const f = stub(() => json({ questions: [] }))
    await api.skipQuestion('q-1')
    await api.undoQuestion('q-1')
    expect(f.mock.calls.map(([u, i]) => `${i?.method} ${u}`)).toEqual(['POST /api/questions/q-1/skip', 'POST /api/questions/q-1/undo'])
  })

  it('resolveConflict sends choice and by (and text for custom); a missing route is null, a 409 throws', async () => {
    const f = stub(() => json({ conflicts: [] }))
    await api.resolveConflict('c-1', 'custom', 'Abhijith', 'Use 9%')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/conflicts/c-1/resolve')
    expect(JSON.parse(init?.body as string)).toEqual({ choice: 'custom', text: 'Use 9%', by: 'Abhijith' })
    stub(() => json({ detail: 'Not Found' }, 404))
    expect(await api.resolveConflict('c-1', 'left', 'A')).toBeNull()
    stub(() => json({ detail: 'already resolved' }, 409))
    await expect(api.resolveConflict('c-1', 'left', 'A')).rejects.toMatchObject({ status: 409, message: 'already resolved' })
  })

  it('accepts the supported extensions only', () => {
    for (const n of ['a.PDF', 'b.xlsx', 'c.docx', 'd.txt', 'e.md', 'f.png', 'g.jpg', 'h.jpeg']) expect(isAccepted(n)).toBe(true)
    for (const n of ['x.exe', 'noext', 'y.zip']) expect(isAccepted(n)).toBe(false)
  })
})

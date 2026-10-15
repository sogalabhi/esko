import type { Project } from '../types/project'

/** Where the app gets its project: the real backend, or the bundled mock (VITE_USE_MOCK=1, and in tests). */
export type DataSource = 'api' | 'mock'

export function defaultDataSource(): DataSource {
  return import.meta.env.VITE_USE_MOCK === '1' || import.meta.env.MODE === 'test' ? 'mock' : 'api'
}

/** File types the backend readers accept (Evidence drop zone and picker). */
export const ACCEPTED_EXTENSIONS = ['pdf', 'xlsx', 'docx', 'txt', 'md', 'png', 'jpg', 'jpeg'] as const
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',')

export function isAccepted(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)
}

/** POST /api/files response: SourceFile plus the number of pieces read. */
export interface UploadedFile {
  id: string
  name: string
  type: string
  pages?: number | null
  status: 'read' | 'unsupported' | 'error'
  error?: string | null
  pieceCount: number
}

/** An API failure with a plain reason a person can read. */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, reason: string) {
    super(reason)
    this.name = 'ApiError'
    this.status = status
  }
}

const UNREACHABLE = 'The backend is not reachable. Check that it is running, then retry.'

async function detailOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail)) return body.detail.map((d: { msg?: string }) => d.msg ?? '').filter(Boolean).join('; ')
  } catch {
    /* not JSON */
  }
  return ''
}

const REASONS: Record<number, string> = {
  413: 'The file is too large.',
  415: 'This file type cannot be read.',
  502: 'An AI step failed.',
  503: 'The AI service is not available (is the key set?).',
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError(0, UNREACHABLE)
  }
  if (!res.ok) {
    const detail = await detailOf(res)
    throw new ApiError(res.status, detail || REASONS[res.status] || `The backend answered ${res.status}.`)
  }
  return (await res.json()) as T
}

export const EMPTY_PROJECT: Project = {
  market: null,
  demoMode: false,
  files: [],
  facts: [],
  conflicts: [],
  questions: [],
  requirements: [],
  rules: [],
  pack: { panels: [], blocks: [] },
  brief: { version: 0, sections: [] },
  trust: { coverage: 0, aiOpen: 0, resolved: 0, selfTest: { caught: 0, total: 0, rows: [] } },
}

/** Fill any part the backend has not built yet, so screens never meet undefined. */
export function normalizeProject(raw: Partial<Project>): Project {
  return { ...EMPTY_PROJECT, ...raw }
}

export const api = {
  /** GET /api/project. Null when no files are uploaded yet (404). */
  async getProject(): Promise<Project | null> {
    try {
      return normalizeProject(await request<Partial<Project>>('/api/project'))
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  },

  /** POST /api/files (multipart). */
  uploadFile(file: File): Promise<UploadedFile> {
    const body = new FormData()
    body.append('file', file)
    return request<UploadedFile>('/api/files', { method: 'POST', body })
  },

  listFiles(): Promise<UploadedFile[]> {
    return request<UploadedFile[]>('/api/files')
  },

  /** POST /api/project/run: read, extract and check every stored file. */
  async runProject(): Promise<Project> {
    return normalizeProject(await request<Partial<Project>>('/api/project/run', { method: 'POST' }))
  },

  /**
   * POST /api/answers. Returns null when the route does not exist (older backend), so the caller keeps
   * the answer locally. A 404 with a reason, such as "No project yet", is a real error.
   */
  async postAnswer(questionId: string, answer: string): Promise<Project | null> {
    try {
      const raw = await request<Partial<Project>>('/api/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, answer }),
      })
      return normalizeProject(raw)
    } catch (e) {
      if (e instanceof ApiError && (e.status === 405 || (e.status === 404 && e.message === 'Not Found'))) return null
      throw e
    }
  },

  /** URL of the original file (PDF.js reads it). The backend route may not exist yet. */
  rawUrl(fileId: string): string {
    return `/api/files/${encodeURIComponent(fileId)}/raw`
  },
}

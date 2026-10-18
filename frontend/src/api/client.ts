import type { AskResult, Brief, BriefSentence, Project, ResolutionChoice } from '../types/project'

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

export interface PackOutResponse {
  fileId: string
  market?: string
  pageW: number
  pageH: number
  panels: Array<{
    name: string
    kind: string
    x: number
    y: number
    w: number
    h: number
    live: [number, number, number, number]
    outline: Array<[number, number]>
  }>
  folds: Array<{
    a: string
    b: string
    x1: number
    y1: number
    x2: number
    y2: number
  }>
  zones: Array<{
    id: string
    panel: string
    kind: string
    label: string
    x: number
    y: number
    w: number
    h: number
  }>
  /** Where the fit engine puts each required item (present after a run). `covers` = the requirement items it carries. */
  blocks?: Array<{
    item: string
    label: string
    panel: string
    x: number
    y: number
    w: number
    h: number
    state: string
    covers?: string[]
  }>
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

/** A "route missing" 404 or 405 (older backend), as opposed to a 404 that carries a reason. */
export function isRouteMissing(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 405 || (e.status === 404 && e.message === 'Not Found'))
}

/** POST a decision; the backend answers with the recomputed project. Null when the route is not there. */
async function postDecision(path: string, body?: unknown): Promise<Project | null> {
  try {
    const init: RequestInit =
      body === undefined ? { method: 'POST' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    return normalizeProject(await request<Partial<Project>>(path, init))
  } catch (e) {
    if (isRouteMissing(e)) return null
    throw e
  }
}

/** What a brief route sends back: the whole project (like the other decision routes) or just the brief. */
export type BriefReply = { project: Project } | { brief: Brief }

function normalizeBrief(raw: Brief): Brief {
  return {
    ...raw,
    sections: (raw.sections ?? []).map((s) => ({
      ...s,
      sentences: (s.sentences ?? []).map(
        (x): BriefSentence => ({ ...x, factIds: x.factIds ?? [], status: x.status ?? 'unproven', problems: x.problems ?? [], source: x.source ?? 'code' }),
      ),
    })),
  }
}

/** Call a brief route. Null when the route is not there (older backend). */
async function sendBrief(path: string, method: 'POST' | 'PATCH', body?: unknown): Promise<BriefReply | null> {
  try {
    const init: RequestInit = body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    const raw = await request<Partial<Project> & Partial<Brief>>(path, init)
    if (!('files' in raw) && 'sections' in raw) return { brief: normalizeBrief(raw as Brief) }
    return { project: normalizeProject({ ...raw, ...(raw.brief ? { brief: normalizeBrief(raw.brief) } : {}) }) }
  } catch (e) {
    if (isRouteMissing(e)) return null
    throw e
  }
}

export const api = {
  /** POST /api/brief/draft: write the brief from the facts and answers. Null when the route does not exist. */
  draftBrief: () => sendBrief('/api/brief/draft', 'POST'),

  /** PATCH /api/brief/sentences: save an edited sentence; the audit runs on the backend. */
  patchSentence: (section: string, index: number, text: string, factIds: string[]) =>
    sendBrief('/api/brief/sentences', 'PATCH', { section, index, text, factIds }),

  /** POST /api/brief/approve: 409 while any sentence is unproven. */
  approveBrief: (name: string) => sendBrief('/api/brief/approve', 'POST', { name }),

  /** GET /api/brief/checklist.json as text, ready to save. */
  async checklistJson(): Promise<string> {
    let res: Response
    try {
      res = await fetch('/api/brief/checklist.json')
    } catch {
      throw new ApiError(0, UNREACHABLE)
    }
    if (!res.ok) throw new ApiError(res.status, (await detailOf(res)) || `The backend answered ${res.status}.`)
    return res.text()
  },

  /** POST /api/ask. Null when the route does not exist. */
  async ask(question: string): Promise<AskResult | null> {
    try {
      return await request<AskResult>('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) })
    } catch (e) {
      if (isRouteMissing(e)) return null
      throw e
    }
  },

  /** POST /api/ask/confirm: the answer becomes a user-sourced fact; the project comes back. */
  confirmAsk: (question: string, answer: string, factIds: string[]) => postDecision('/api/ask/confirm', { question, answer, factIds }),

  /** GET /api/project. Null when no files are uploaded yet (404). */
  async getProject(): Promise<Project | null> {
    try {
      return normalizeProject(await request<Partial<Project>>('/api/project'))
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  },

  /**
   * GET /api/pack. Null when no dieline PDF is available (404). A dieline whose geometry cannot be read
   * (422) throws with the backend's reason, so the screen shows the error instead of an empty pack.
   */
  async getPack(): Promise<PackOutResponse | null> {
    try {
      return await request<PackOutResponse>('/api/pack')
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || isRouteMissing(e))) return null
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
  postAnswer(questionId: string, answer: string): Promise<Project | null> {
    return postDecision('/api/answers', { questionId, answer })
  },

  /** POST /api/questions/{id}/skip. Null when the route does not exist. */
  skipQuestion(questionId: string): Promise<Project | null> {
    return postDecision(`/api/questions/${encodeURIComponent(questionId)}/skip`)
  },

  /** POST /api/questions/{id}/undo: takes back an answer or a skip. Null when the route does not exist. */
  undoQuestion(questionId: string): Promise<Project | null> {
    return postDecision(`/api/questions/${encodeURIComponent(questionId)}/undo`)
  },

  /** POST /api/conflicts/{id}/resolve. Null when the route does not exist; a second resolve is a 409. */
  resolveConflict(conflictId: string, choice: ResolutionChoice, by: string, text?: string): Promise<Project | null> {
    return postDecision(`/api/conflicts/${encodeURIComponent(conflictId)}/resolve`, text ? { choice, text, by } : { choice, by })
  },

  /** URL of the original file (PDF.js reads it). The backend route may not exist yet. */
  rawUrl(fileId: string): string {
    return `/api/files/${encodeURIComponent(fileId)}/raw`
  },
}

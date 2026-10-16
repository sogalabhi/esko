import { ApiError } from './client'
import type { Project } from '../types/project'

export interface DemoStatus {
  available: boolean
  savedAt: string | null
}

async function demoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError(0, 'The backend is not reachable. Check that it is running, then retry.')
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, detail || `The backend answered ${res.status}.`)
  }
  return (await res.json()) as T
}

export const demoApi = {
  status: () => demoRequest<DemoStatus>('/api/demo'),
  /** Restores the saved demo project on the backend (no AI calls) and returns it. */
  load: () => demoRequest<Project>('/api/demo/load', { method: 'POST' }),
}

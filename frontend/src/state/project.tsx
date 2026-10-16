import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { api, ApiError, defaultDataSource, EMPTY_PROJECT, isAccepted, type DataSource } from '../api/client'
import mock from '../mocks/project.json'
import type { Project, Question, QuestionStatus, Resolution, ResolutionChoice, Source } from '../types/project'

export const mockProject = mock as unknown as Project

/** The signed-in person; no login in the demo. */
export const CURRENT_USER = 'Abhijith'

export type UiMarket = 'US' | 'IN'

export type LoadState = { status: 'loading' | 'ready' | 'empty' } | { status: 'error'; reason: string }

export interface FileProblem {
  name: string
  reason: string
}

/** Progress of an upload-and-analyse run. 'running' covers the single POST /api/project/run call. */
export interface RunState {
  phase: 'idle' | 'uploading' | 'running' | 'done' | 'error'
  total: number
  uploaded: number
  fileErrors: FileProblem[]
  reason?: string
}

const IDLE_RUN: RunState = { phase: 'idle', total: 0, uploaded: 0, fileErrors: [] }

interface State {
  project: Project
  load: LoadState
  run: RunState
  /** Answers given in this browser (the backend's `answer` is merged in by the store). */
  answers: Record<string, string>
  /** Conflict resolutions made in this browser, kept across project refreshes until the backend has them. */
  resolutions: Record<string, Resolution>
  answerError: string | null
  drawer: Source | null
  market: UiMarket
  launchDate: string
}

type Action =
  | { type: 'resolve'; id: string; choice: ResolutionChoice; text?: string }
  | { type: 'unresolve'; id: string }
  | { type: 'answer'; id: string; answer: string }
  | { type: 'skip'; id: string }
  | { type: 'undoAnswer'; id: string; prev: QuestionStatus }
  | { type: 'open'; source: Source }
  | { type: 'close' }
  | { type: 'market'; market: UiMarket }
  | { type: 'launch'; date: string }
  | { type: 'reset' }
  | { type: 'loading' }
  | { type: 'loaded'; project: Project | null }
  | { type: 'loadFailed'; reason: string }
  | { type: 'setProject'; project: Project; settled?: string }
  | { type: 'run'; run: RunState }
  | { type: 'answerError'; message: string | null }

const DEFAULT_LAUNCH = '2027-03-01'

type Seed = [Project, DataSource]

function init([project, source]: Seed): State {
  return {
    project: source === 'mock' ? structuredClone(project) : EMPTY_PROJECT,
    load: { status: source === 'mock' ? 'ready' : 'loading' },
    run: IDLE_RUN,
    answers: {},
    resolutions: {},
    answerError: null,
    drawer: null,
    market: 'US',
    launchDate: DEFAULT_LAUNCH,
  }
}

const mapQuestion = (p: Project, id: string, f: (q: Question) => Question): Project => ({
  ...p,
  questions: p.questions.map((q) => (q.id === id ? f(q) : q)),
})

function withResolutions(p: Project, resolutions: Record<string, Resolution>): Project {
  return { ...p, conflicts: p.conflicts.map((c) => (c.resolution || !resolutions[c.id] ? c : { ...c, resolution: resolutions[c.id] })) }
}

function reducer(seed: Seed) {
  return (s: State, a: Action): State => {
    switch (a.type) {
      case 'resolve': {
        const resolution: Resolution = { choice: a.choice, by: CURRENT_USER, at: new Date().toISOString(), ...(a.text ? { text: a.text } : {}) }
        return {
          ...s,
          resolutions: { ...s.resolutions, [a.id]: resolution },
          project: { ...s.project, conflicts: s.project.conflicts.map((c) => (c.id === a.id ? { ...c, resolution } : c)) },
        }
      }
      case 'unresolve': {
        const resolutions = { ...s.resolutions }
        delete resolutions[a.id]
        return { ...s, resolutions, project: { ...s.project, conflicts: s.project.conflicts.map((c) => (c.id === a.id ? { ...c, resolution: undefined } : c)) } }
      }
      case 'answer':
        return {
          ...s,
          answerError: null,
          answers: { ...s.answers, [a.id]: a.answer },
          project: mapQuestion(s.project, a.id, (q) => ({ ...q, status: 'answered', answer: a.answer })),
        }
      case 'skip':
        return { ...s, project: mapQuestion(s.project, a.id, (q) => ({ ...q, status: 'skipped' })) }
      case 'undoAnswer': {
        const answers = { ...s.answers }
        delete answers[a.id]
        return { ...s, answers, project: mapQuestion(s.project, a.id, (q) => ({ ...q, status: a.prev, answer: undefined })) }
      }
      case 'open':
        return { ...s, drawer: a.source }
      case 'close':
        return { ...s, drawer: null }
      case 'market':
        return { ...s, market: a.market }
      case 'launch':
        return { ...s, launchDate: a.date }
      case 'reset':
        return init(seed)
      case 'loading':
        return { ...s, load: { status: 'loading' } }
      case 'loaded':
        return a.project
          ? { ...s, project: withResolutions(a.project, s.resolutions), load: { status: 'ready' } }
          : { ...s, project: EMPTY_PROJECT, load: { status: 'empty' } }
      case 'loadFailed':
        return { ...s, load: { status: 'error', reason: a.reason } }
      case 'setProject': {
        // `settled`: a conflict the backend has now recorded, so the local copy is dropped.
        const resolutions = { ...s.resolutions }
        if (a.settled) delete resolutions[a.settled]
        return { ...s, resolutions, project: withResolutions(a.project, resolutions), answers: {}, load: { status: 'ready' } }
      }
      case 'run':
        return { ...s, run: a.run }
      case 'answerError':
        return { ...s, answerError: a.message }
    }
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')

function useStore(initial: Project, source: DataSource) {
  const seed: Seed = [initial, source]
  const [state, dispatch] = useReducer(reducer(seed), seed, init)
  const latest = useRef(state)
  latest.current = state
  const failedFiles = useRef<File[]>([])

  const reload = useCallback(async () => {
    dispatch({ type: 'loading' })
    try {
      dispatch({ type: 'loaded', project: await api.getProject() })
    } catch (e) {
      dispatch({ type: 'loadFailed', reason: message(e) })
    }
  }, [])

  useEffect(() => {
    if (source === 'api') void reload()
  }, [source, reload])

  /** Fetch the project again without showing the loading state, so the screen matches the backend after a failed decision. */
  const resync = useCallback(async () => {
    try {
      const fresh = await api.getProject()
      if (fresh) dispatch({ type: 'setProject', project: fresh })
    } catch {
      /* keep what is shown */
    }
  }, [])

  /** Resolve at once; in api mode also POST it and take the recomputed project back. Without the route the resolution stays local. */
  const resolveConflict = useCallback(
    async (id: string, choice: ResolutionChoice, text?: string) => {
      dispatch({ type: 'resolve', id, choice, text })
      if (source !== 'api') return
      try {
        const updated = await api.resolveConflict(id, choice, CURRENT_USER, text)
        if (updated) dispatch({ type: 'setProject', project: updated, settled: id })
      } catch (e) {
        dispatch({ type: 'unresolve', id })
        dispatch({ type: 'answerError', message: `The decision was not saved: ${message(e)}` })
        if (e instanceof ApiError && e.status === 409) void resync()
      }
    },
    [source, resync],
  )

  /** Skip at once; in api mode also POST it. A refused skip goes back to what it was. */
  const skipQuestion = useCallback(
    async (id: string) => {
      const prev = latest.current.project.questions.find((q) => q.id === id)?.status ?? 'open'
      dispatch({ type: 'skip', id })
      if (source !== 'api') return
      try {
        const updated = await api.skipQuestion(id)
        if (updated) dispatch({ type: 'setProject', project: updated })
      } catch (e) {
        dispatch({ type: 'undoAnswer', id, prev })
        dispatch({ type: 'answerError', message: `The skip was not saved: ${message(e)}` })
      }
    },
    [source],
  )

  /** Take back an answer or a skip. If the backend refuses, show its state again. */
  const undoAnswer = useCallback(
    async (id: string, prev: QuestionStatus) => {
      dispatch({ type: 'undoAnswer', id, prev })
      if (source !== 'api') return
      try {
        const updated = await api.undoQuestion(id)
        if (updated) dispatch({ type: 'setProject', project: updated })
      } catch (e) {
        dispatch({ type: 'answerError', message: `The undo was not saved: ${message(e)}` })
        void resync()
      }
    },
    [source, resync],
  )
  const openSource = useCallback((src: Source) => dispatch({ type: 'open', source: src }), [])
  const closeDrawer = useCallback(() => dispatch({ type: 'close' }), [])
  const setMarket = useCallback((market: UiMarket) => dispatch({ type: 'market', market }), [])
  const setLaunchDate = useCallback((date: string) => dispatch({ type: 'launch', date }), [])
  const reset = useCallback(() => {
    if (source === 'api') void reload()
    else dispatch({ type: 'reset' })
  }, [source, reload])

  /** Answer locally at once; in api mode also POST it and take the recomputed project back. */
  const answerQuestion = useCallback(
    async (id: string, answer: string) => {
      const prev = latest.current.project.questions.find((q) => q.id === id)?.status ?? 'open'
      dispatch({ type: 'answer', id, answer })
      if (source !== 'api') return
      try {
        const updated = await api.postAnswer(id, answer)
        if (updated) dispatch({ type: 'setProject', project: updated })
      } catch (e) {
        dispatch({ type: 'undoAnswer', id, prev })
        dispatch({ type: 'answerError', message: `The answer was not saved: ${message(e)}` })
      }
    },
    [source],
  )

  /** POST /api/project/run, then show the result. A failure still shows the files that were uploaded. */
  const analyse = useCallback(async (fileErrors: FileProblem[] = [], total = 0) => {
    const uploaded = total - fileErrors.length
    dispatch({ type: 'run', run: { phase: 'running', total, uploaded, fileErrors } })
    try {
      dispatch({ type: 'setProject', project: await api.runProject() })
      dispatch({ type: 'run', run: { phase: 'done', total, uploaded, fileErrors } })
    } catch (e) {
      try {
        const files = await api.getProject()
        if (files) dispatch({ type: 'loaded', project: files })
      } catch {
        /* keep what is shown */
      }
      dispatch({ type: 'run', run: { phase: 'error', total, uploaded, fileErrors, reason: message(e) } })
    }
  }, [])

  /** Upload each file, then run the analysis. Per-file failures are listed; the rest still runs. */
  const ingest = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const fileErrors: FileProblem[] = []
      const failed: File[] = []
      let uploaded = 0
      const progress = () => dispatch({ type: 'run', run: { phase: 'uploading', total: files.length, uploaded, fileErrors: [...fileErrors] } })
      const fail = (f: File, reason: string) => {
        fileErrors.push({ name: f.name, reason })
        failed.push(f)
      }
      progress()
      for (const f of files) {
        if (!isAccepted(f.name)) {
          fail(f, 'This file type cannot be read. Use PDF, XLSX, DOCX, TXT, MD, PNG or JPG.')
        } else {
          try {
            const up = await api.uploadFile(f)
            if (up.status === 'read') uploaded++
            else fail(f, up.error || 'The reader could not use this file.')
          } catch (e) {
            fail(f, message(e))
          }
        }
        progress()
      }
      failedFiles.current = failed
      if (uploaded === 0 && latest.current.project.files.length === 0) {
        dispatch({ type: 'run', run: { phase: 'error', total: files.length, uploaded, fileErrors, reason: 'No file could be uploaded.' } })
        return
      }
      await analyse(fileErrors, files.length)
    },
    [analyse],
  )

  const retryFailed = useCallback(() => ingest(failedFiles.current), [ingest])
  const runAnalysis = useCallback(() => analyse(), [analyse])

  return useMemo(() => {
    // Backend answers (question.answer) plus the ones given in this browser.
    const answers: Record<string, string> = {}
    for (const q of state.project.questions) if (q.answer) answers[q.id] = q.answer
    Object.assign(answers, state.answers)
    return {
      ...state,
      answers,
      source,
      reload,
      ingest,
      retryFailed,
      runAnalysis,
      resolveConflict,
      answerQuestion,
      skipQuestion,
      undoAnswer,
      openSource,
      closeDrawer,
      setMarket,
      setLaunchDate,
      reset,
    }
  }, [state, source, reload, ingest, retryFailed, runAnalysis, resolveConflict, answerQuestion, skipQuestion, undoAnswer, openSource, closeDrawer, setMarket, setLaunchDate, reset])
}

export type Store = ReturnType<typeof useStore>

const Ctx = createContext<Store | null>(null)

export function ProjectProvider({
  children,
  initial = mockProject,
  source = defaultDataSource(),
}: {
  children: ReactNode
  initial?: Project
  source?: DataSource
}) {
  const store = useStore(initial, source)
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useProject(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useProject must be used inside ProjectProvider')
  return s
}

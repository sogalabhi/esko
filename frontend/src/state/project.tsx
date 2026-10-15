import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react'
import mock from '../mocks/project.json'
import type { Project, QuestionStatus, ResolutionChoice, Source } from '../types/project'

export const mockProject = mock as unknown as Project

/** The signed-in person; no login in the demo. */
export const CURRENT_USER = 'Abhijith'

export type UiMarket = 'US' | 'IN'

interface State {
  project: Project
  /** Chosen answer per question id (local until the API exists; not in §9). */
  answers: Record<string, string>
  drawer: Source | null
  market: UiMarket
  launchDate: string
}

type Action =
  | { type: 'resolve'; id: string; choice: ResolutionChoice }
  | { type: 'answer'; id: string; answer: string }
  | { type: 'skip'; id: string }
  | { type: 'undoAnswer'; id: string; prev: QuestionStatus }
  | { type: 'open'; source: Source }
  | { type: 'close' }
  | { type: 'market'; market: UiMarket }
  | { type: 'launch'; date: string }
  | { type: 'reset' }

const DEFAULT_LAUNCH = '2027-03-01'

function init(project: Project): State {
  return { project: structuredClone(project), answers: {}, drawer: null, market: 'US', launchDate: DEFAULT_LAUNCH }
}

function reducer(initial: Project) {
  return (s: State, a: Action): State => {
    switch (a.type) {
      case 'resolve':
        return {
          ...s,
          project: {
            ...s.project,
            conflicts: s.project.conflicts.map((c) =>
              c.id === a.id ? { ...c, resolution: { choice: a.choice, by: CURRENT_USER, at: new Date().toISOString() } } : c,
            ),
          },
        }
      case 'answer':
        return {
          ...s,
          answers: { ...s.answers, [a.id]: a.answer },
          project: { ...s.project, questions: s.project.questions.map((q) => (q.id === a.id ? { ...q, status: 'answered' } : q)) },
        }
      case 'skip':
        return {
          ...s,
          project: { ...s.project, questions: s.project.questions.map((q) => (q.id === a.id ? { ...q, status: 'skipped' } : q)) },
        }
      case 'undoAnswer': {
        const answers = { ...s.answers }
        delete answers[a.id]
        return {
          ...s,
          answers,
          project: { ...s.project, questions: s.project.questions.map((q) => (q.id === a.id ? { ...q, status: a.prev } : q)) },
        }
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
        return init(initial)
    }
  }
}

function useStore(initial: Project) {
  const [state, dispatch] = useReducer(reducer(initial), initial, init)
  const resolveConflict = useCallback((id: string, choice: ResolutionChoice) => dispatch({ type: 'resolve', id, choice }), [])
  const answerQuestion = useCallback((id: string, answer: string) => dispatch({ type: 'answer', id, answer }), [])
  const skipQuestion = useCallback((id: string) => dispatch({ type: 'skip', id }), [])
  const undoAnswer = useCallback((id: string, prev: QuestionStatus) => dispatch({ type: 'undoAnswer', id, prev }), [])
  const openSource = useCallback((source: Source) => dispatch({ type: 'open', source }), [])
  const closeDrawer = useCallback(() => dispatch({ type: 'close' }), [])
  const setMarket = useCallback((market: UiMarket) => dispatch({ type: 'market', market }), [])
  const setLaunchDate = useCallback((date: string) => dispatch({ type: 'launch', date }), [])
  const reset = useCallback(() => dispatch({ type: 'reset' }), [])
  return useMemo(
    () => ({ ...state, resolveConflict, answerQuestion, skipQuestion, undoAnswer, openSource, closeDrawer, setMarket, setLaunchDate, reset }),
    [state, resolveConflict, answerQuestion, skipQuestion, undoAnswer, openSource, closeDrawer, setMarket, setLaunchDate, reset],
  )
}

export type Store = ReturnType<typeof useStore>

const Ctx = createContext<Store | null>(null)

export function ProjectProvider({ children, initial = mockProject }: { children: ReactNode; initial?: Project }) {
  const store = useStore(initial)
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useProject(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useProject must be used inside ProjectProvider')
  return s
}

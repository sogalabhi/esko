import { CircleAlert, CircleCheck, CircleDashed, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QuestionCard } from '../components/QuestionCard'
import { Toast } from '../components/Toast'
import { rankQuestions } from '../lib/questions'
import { useProject } from '../state/project'
import type { Owner, Question, QuestionStatus, Requirement } from '../types/project'

/** A question touches the requirements of the rules it cites (§9 has no direct link). */
function linkedRequirements(q: Question, reqs: Requirement[]): Requirement[] {
  return reqs.filter((r) => q.ruleIds.includes(r.ruleId))
}

type ReqShown = Requirement['status'] | 'decided'
const REQ: Record<ReqShown, { word: string; Icon: LucideIcon; cls: string }> = {
  met: { word: 'Met', Icon: CircleCheck, cls: 'text-ok' },
  decided: { word: 'Decided', Icon: CircleCheck, cls: 'text-ok' },
  missing: { word: 'Missing', Icon: CircleDashed, cls: 'text-warn' },
  conflict: { word: 'Conflict', Icon: TriangleAlert, cls: 'text-bad' },
}

interface Undo {
  id: string
  prev: QuestionStatus
  items: number
}

export function Questions() {
  const { project, answers, answerError, answerQuestion, skipQuestion, undoAnswer } = useProject()
  const ordered = useMemo(() => rankQuestions(project.questions), [project.questions])
  const refs = useRef(new Map<string, HTMLElement>())
  const [current, setCurrent] = useState<string | null>(null)
  const focusId = useRef<string | null>(null)
  const [toast, setToast] = useState<Undo | null>(null)

  const pending = ordered.filter((q) => q.status !== 'answered')
  const answered = project.questions.filter((q) => q.status === 'answered')
  const unlocked = answered.reduce((n, q) => n + q.unlocks, 0)
  const active = pending.find((q) => q.id === current) ?? pending[0]

  // Move focus after the list re-renders (answer, skip, J/K).
  useEffect(() => {
    if (!focusId.current) return
    refs.current.get(focusId.current)?.focus()
    focusId.current = null
  })

  const nextAfter = useCallback(
    (id: string) => {
      const i = ordered.findIndex((q) => q.id === id)
      const rest = [...ordered.slice(i + 1), ...ordered.slice(0, i)].filter((q) => q.status !== 'answered')
      return rest[0]?.id ?? null
    },
    [ordered],
  )

  const answer = useCallback(
    (q: Question, a: string) => {
      const next = nextAfter(q.id)
      answerQuestion(q.id, a)
      setToast({ id: q.id, prev: q.status, items: q.unlocks })
      setCurrent(next)
      focusId.current = next
    },
    [answerQuestion, nextAfter],
  )

  const skip = useCallback(
    (q: Question) => {
      const next = nextAfter(q.id) ?? q.id
      skipQuestion(q.id)
      setCurrent(next)
      focusId.current = next
    },
    [skipQuestion, nextAfter],
  )

  const undo = () => {
    if (!toast) return
    undoAnswer(toast.id, toast.prev)
    setCurrent(toast.id)
    focusId.current = toast.id
    setToast(null)
  }
  const dismiss = useCallback(() => setToast(null), [])

  // J / K move between cards; 1–4 answer the current card when focus is outside it (§8).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return
      const k = e.key.toLowerCase()
      if (k === 'j' || k === 'k') {
        if (!pending.length) return
        const i = pending.findIndex((q) => refs.current.get(q.id)?.contains(document.activeElement))
        const n = i < 0 ? 0 : k === 'j' ? Math.min(pending.length - 1, i + 1) : Math.max(0, i - 1)
        e.preventDefault()
        setCurrent(pending[n].id)
        refs.current.get(pending[n].id)?.focus()
        refs.current.get(pending[n].id)?.scrollIntoView?.({ block: 'nearest' })
        return
      }
      const n = Number(e.key)
      if (active && Number.isInteger(n) && n >= 1 && n <= Math.min(4, active.answers.length)) {
        e.preventDefault()
        answer(active, active.answers[n - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, active, answer])

  const ownerFor = (q: Question): Owner | undefined =>
    project.conflicts.find((c) => !c.resolution && c.factIds.some((f) => q.factIds.includes(f)))?.owner

  const affected = useMemo(() => {
    const byReq = new Map<string, { req: Requirement; qs: Question[] }>()
    for (const q of project.questions) {
      for (const r of linkedRequirements(q, project.requirements)) {
        const e = byReq.get(r.id) ?? { req: r, qs: [] }
        e.qs.push(q)
        byReq.set(r.id, e)
      }
    }
    return [...byReq.values()]
  }, [project.questions, project.requirements])

  if (project.questions.length === 0) {
    return (
      <section className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center">
        <CircleCheck size={24} aria-hidden="true" className="mx-auto text-ok" />
        <h1 className="mt-3 text-[20px] font-semibold">No questions</h1>
        <p className="mt-1 text-ink-2">The files cover every requirement, or no files have been read yet.</p>
      </section>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,720px)_300px] lg:grid-cols-[minmax(0,1fr)_260px]">
      <section aria-labelledby="questions-title" className="min-w-0">
        <h1 id="questions-title" className="text-[20px] font-semibold">
          Questions
        </h1>
        <p aria-live="polite" data-testid="questions-progress" className="mt-1 text-[14px] text-ink-2">
          <span className="font-mono">{answered.length}</span> of <span className="font-mono">{project.questions.length}</span> answered ·{' '}
          <span className="font-mono">{unlocked}</span> requirement{unlocked === 1 ? '' : 's'} unlocked
        </p>
        <p className="mt-1 text-[12px] text-ink-2">
          Keys: <kbd className="font-mono">J</kbd>/<kbd className="font-mono">K</kbd> move between cards, <kbd className="font-mono">1</kbd>–
          <kbd className="font-mono">4</kbd> pick an answer.
        </p>
        {answerError && (
          <p role="alert" className="mt-3 flex items-start gap-1.5 rounded-card border border-bad/30 bg-bad/10 p-3 text-[14px]">
            <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
            {answerError}
          </p>
        )}
        {pending.length === 0 && (
          <p className="mt-3 flex items-center gap-1.5 rounded-card border border-ok/30 bg-ok/10 p-3 text-[14px] font-medium text-ok">
            <CircleCheck size={16} aria-hidden="true" />
            All questions answered
          </p>
        )}
        <ol className="mt-4 space-y-3">
          {ordered.map((q) => (
            <li key={q.id} data-question={q.id} data-status={q.status} onFocusCapture={() => q.status !== 'answered' && setCurrent(q.id)}>
              <QuestionCard
                ref={(el) => {
                  if (el) refs.current.set(q.id, el)
                  else refs.current.delete(q.id)
                }}
                question={q}
                rules={project.rules.filter((r) => q.ruleIds.includes(r.id))}
                askTo={ownerFor(q)}
                answer={answers[q.id]}
                onAnswer={(a) => answer(q, a)}
                onSkip={() => skip(q)}
              />
            </li>
          ))}
        </ol>
      </section>

      <aside aria-labelledby="affected-title" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
        <h2 id="affected-title" className="text-[14px] font-semibold">
          Affected requirements
        </h2>
        <p className="mt-0.5 text-[12px] text-ink-2">Highlighted: touched by the current question.</p>
        <ul className="mt-2 space-y-1.5">
          {affected.map(({ req, qs }) => {
            const decided = qs.every((q) => q.status === 'answered')
            const shown: ReqShown = req.status !== 'met' && decided ? 'decided' : req.status
            const st = REQ[shown]
            const hot = !!active && qs.some((q) => q.id === active.id)
            return (
              <li
                key={req.id}
                data-req={req.id}
                data-shown={shown}
                className={`rounded-chip border bg-surface px-3 py-2 text-[13px] ${hot ? 'border-accent' : 'border-border'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 font-medium">{req.item}</span>
                  <span key={shown} className={`fade-in flex shrink-0 items-center gap-1 text-[12px] font-medium ${st.cls}`}>
                    <st.Icon size={14} aria-hidden="true" />
                    {st.word}
                  </span>
                </div>
                {req.panel && <p className="text-[12px] text-ink-2">{req.panel}</p>}
                {hot && <span className="sr-only">Touched by the current question</span>}
              </li>
            )
          })}
        </ul>
      </aside>

      {toast && (
        <Toast
          message={`Answer applied to ${toast.items} item${toast.items === 1 ? '' : 's'}`}
          actionLabel="Undo"
          onAction={undo}
          onDismiss={dismiss}
        />
      )}
    </div>
  )
}

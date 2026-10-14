import { CircleCheck } from 'lucide-react'
import { forwardRef, useId, useState, type KeyboardEvent } from 'react'
import { askMessage } from '../lib/labels'
import type { Owner, Question, Rule } from '../types/project'
import { AskMessage } from './AskMessage'
import { RuleChip } from './RuleChip'

interface Props {
  question: Question
  rules?: Rule[]
  /** Who "Ask someone" writes to. */
  askTo?: Owner
  /** The chosen answer once answered. */
  answer?: string
  onAnswer: (answer: string) => void
  onSkip: () => void
}

const big =
  'flex w-full items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left text-[14px] font-medium hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info'
const small =
  'rounded-chip border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info'

export const QuestionCard = forwardRef<HTMLElement, Props>(function QuestionCard(
  { question, rules = [], askTo, answer, onAnswer, onSkip },
  ref,
) {
  const titleId = useId()
  const otherId = useId()
  const [other, setOther] = useState('')
  const [asking, setAsking] = useState(false)
  const choices = question.answers.slice(0, 4)

  if (question.status === 'answered') {
    return (
      <article ref={ref} tabIndex={-1} aria-labelledby={titleId} className="flex items-start gap-2 rounded-card border border-border bg-surface px-4 py-3 text-[14px]">
        <CircleCheck size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-ok" />
        <div>
          <p id={titleId} className="text-ink-2">
            {question.text}
          </p>
          <p className="font-medium">Answered · {answer ?? 'answer recorded'}</p>
        </div>
      </article>
    )
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const t = e.target as HTMLElement
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
    const n = Number(e.key)
    if (Number.isInteger(n) && n >= 1 && n <= choices.length) {
      e.preventDefault()
      onAnswer(choices[n - 1])
    }
  }

  return (
    <article
      ref={ref}
      tabIndex={0}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className="rounded-card border border-border bg-surface p-4 focus-visible:outline-2 focus-visible:outline-info"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id={titleId} className="text-[16px] font-semibold leading-6">
          {question.text}
        </h3>
        <span className="shrink-0 rounded-chip bg-info/10 px-2 py-0.5 text-[12px] font-medium text-info">
          Unlocks {question.unlocks} requirement{question.unlocks === 1 ? '' : 's'}
        </span>
      </div>
      <p className="mt-1 text-[13px] text-ink-2">
        <span className="font-medium text-ink">Why we ask: </span>
        {question.why}
      </p>
      {rules.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {rules.map((r) => (
            <RuleChip key={r.id} rule={r} />
          ))}
        </div>
      )}
      {question.status === 'skipped' && <p className="mt-2 text-[12px] text-warn">Skipped for now</p>}

      {choices.length > 0 && (
        <ul className="mt-3 space-y-2">
          {choices.map((a, i) => (
            <li key={a}>
              <button type="button" className={big} onClick={() => onAnswer(a)}>
                <kbd className="rounded-[4px] border border-border px-1.5 font-mono text-[12px] text-ink-2">{i + 1}</kbd>
                {a}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (other.trim()) onAnswer(other.trim())
        }}
      >
        <label htmlFor={otherId} className="sr-only">
          Other answer
        </label>
        <input
          id={otherId}
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="Other…"
          className="min-w-0 flex-1 rounded-chip border border-border bg-surface px-3 py-1.5 text-[14px] focus-visible:outline-2 focus-visible:outline-info"
        />
        <button type="submit" className={small} disabled={!other.trim()}>
          Use answer
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={small} aria-expanded={asking} onClick={() => setAsking((v) => !v)}>
          Ask someone
        </button>
        <button type="button" className={small} onClick={onSkip}>
          Skip for now
        </button>
      </div>
      {asking && <AskMessage message={askMessage(askTo, question.text, `Why: ${question.why}`)} />}
    </article>
  )
})

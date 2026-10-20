import { Check, CircleAlert, Hourglass, MessageCircleQuestionMark, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { askAboutFinding, ownerOf } from '../lib/checks'
import { OWNER_LABEL } from '../lib/labels'
import { readApprover, saveApprover } from '../lib/letterhead'
import { useProject } from '../state/project'
import type { Finding } from '../types/project'
import { AskMessage } from './AskMessage'

const btn =
  'inline-flex items-center gap-1.5 rounded-chip border px-3 py-1.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-info'

/**
 * The Needs review controls: "It's fine" / "It's a problem" / "Ask someone", a note and the decider's name
 * (remembered in this browser like the approver name elsewhere). Every decision is logged by the backend.
 */
export function ReviewDecision({ finding }: { finding: Finding }) {
  const { project, waiting, decideFinding, askAbout } = useProject()
  const [name, setName] = useState(readApprover)
  const [note, setNote] = useState('')
  const [needName, setNeedName] = useState(false)
  const [asking, setAsking] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const nameId = useId()
  const noteId = useId()
  const owner = ownerOf(finding, project.conflicts)
  const wait = waiting[finding.id]

  const decide = (verdict: 'pass' | 'fail') => {
    const by = name.trim()
    if (!by) {
      setNeedName(true)
      nameRef.current?.focus()
      return
    }
    saveApprover(by)
    void decideFinding(finding.id, verdict, by, note.trim() || undefined)
  }

  const ask = () => {
    setAsking(true)
    askAbout(finding.id, owner ? OWNER_LABEL[owner] : undefined)
  }

  return (
    <div data-review-controls className="mt-3 space-y-3 rounded-card border border-warn/40 bg-warn/10 p-3">
      <p className="text-[13px] font-medium">A person decides this one. The decision is logged with your name.</p>
      {wait && (
        <p data-waiting className="flex items-center gap-1.5 text-[13px] font-medium">
          <Hourglass size={14} aria-hidden="true" />
          Waiting for {wait.owner ?? 'an answer'}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div>
          <label htmlFor={nameId} className="text-[12px] font-medium text-ink-2">
            Your name
          </label>
          <input
            ref={nameRef}
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNeedName(false)
            }}
            aria-invalid={needName || undefined}
            aria-describedby={needName ? `${nameId}-err` : undefined}
            autoComplete="name"
            className="mt-1 w-full rounded-chip border border-border bg-surface px-2 py-1.5 text-[14px] focus-visible:outline-2 focus-visible:outline-info"
          />
        </div>
        <div>
          <label htmlFor={noteId} className="text-[12px] font-medium text-ink-2">
            Note (optional)
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1 w-full resize-y rounded-chip border border-border bg-surface px-2 py-1.5 text-[14px] focus-visible:outline-2 focus-visible:outline-info"
          />
        </div>
      </div>
      {needName && (
        <p id={`${nameId}-err`} role="alert" className="flex items-center gap-1.5 text-[13px] font-medium text-bad">
          <CircleAlert size={14} aria-hidden="true" />
          Add your name first. Decisions are logged with it.
        </p>
      )}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Decide: ${finding.title}`}>
        <button type="button" className={`${btn} border-ok bg-surface text-ok hover:bg-ok/10`} onClick={() => decide('pass')} aria-keyshortcuts="1">
          <Check size={15} aria-hidden="true" />
          It's fine
        </button>
        <button type="button" className={`${btn} border-bad bg-surface text-bad hover:bg-bad/10`} onClick={() => decide('fail')} aria-keyshortcuts="2">
          <X size={15} aria-hidden="true" />
          It's a problem
        </button>
        <button
          type="button"
          className={`${btn} border-border bg-surface text-ink hover:border-ink-2`}
          aria-expanded={asking}
          onClick={asking ? () => setAsking(false) : ask}
          aria-keyshortcuts="3"
        >
          <MessageCircleQuestionMark size={15} aria-hidden="true" />
          Ask someone
        </button>
      </div>
      {asking && <AskMessage message={askAboutFinding(finding, owner)} />}
    </div>
  )
}

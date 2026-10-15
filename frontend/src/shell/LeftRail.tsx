import { Box, ChevronsLeft, ChevronsRight, FileText, FolderOpen, ListChecks, Network, ShieldCheck, Tag, CircleQuestionMark, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router'
import { usePersistedFlag } from '../lib/usePersistedFlag'
import { useProject } from '../state/project'

type Dot = 'ok' | 'warn' | 'bad' | 'idle'
const DOT: Record<Dot, { cls: string; word: string }> = {
  ok: { cls: 'bg-ok', word: 'done' },
  warn: { cls: 'bg-warn', word: 'needs input' },
  bad: { cls: 'bg-bad', word: 'has conflicts' },
  idle: { cls: 'border border-ink-2 bg-transparent', word: 'not started' },
}

interface Item {
  to: string
  label: string
  Icon: LucideIcon
  step?: number
  dot?: Dot
  count?: number
  /** Overrides the dot's default word for screen readers and the tooltip. */
  word?: string
}

function RailLink({ item, collapsed }: { item: Item; collapsed: boolean }) {
  const { to, label, Icon, step, dot, count, word } = item
  const name = step ? `${step} ${label}` : label
  return (
    <NavLink
      to={to}
      title={name}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-chip px-2.5 py-2 text-[14px] focus-visible:outline-2 focus-visible:outline-info ${
          isActive ? 'bg-accent/10 font-semibold text-accent' : 'text-ink hover:bg-bg'
        }`
      }
    >
      <Icon size={18} aria-hidden="true" className="shrink-0" />
      <span className={`hidden flex-1 truncate ${collapsed ? '' : 'lg:inline'}`}>
        {step && <span className="mr-1 font-mono text-ink-2">{step}</span>}
        {label}
      </span>
      <span className={`sr-only ${collapsed ? '' : 'lg:hidden'}`}>{name}</span>
      {dot && (
        <span className={`hidden items-center gap-1.5 ${collapsed ? '' : 'lg:flex'}`}>
          {count != null && <span className="font-mono text-[12px] text-ink-2">{count}</span>}
          <span className={`inline-block h-2 w-2 rounded-full ${DOT[dot].cls}`} aria-hidden="true" title={word ?? DOT[dot].word} />
          <span className="sr-only">
            {count != null ? `${count}, ` : ''}
            {word ?? DOT[dot].word}
          </span>
        </span>
      )}
    </NavLink>
  )
}

export function LeftRail() {
  const { project } = useProject()
  const [collapsed, toggleCollapsed] = usePersistedFlag('bf.rail.collapsed')
  const openConflicts = project.conflicts.filter((c) => !c.resolution).length
  const openQuestions = project.questions.filter((q) => q.status !== 'answered').length
  const filesDone = project.files.every((f) => f.status === 'done')
  const filesFailed = project.files.filter((f) => f.status === 'error').length
  const evidence: Pick<Item, 'dot' | 'word'> =
    project.files.length === 0
      ? { dot: 'idle', word: 'no files yet' }
      : filesFailed
        ? { dot: 'bad', word: `${filesFailed} could not be read` }
        : filesDone
          ? { dot: 'ok', word: 'all files read' }
          : { dot: 'warn', word: 'reading' }
  const questions: Pick<Item, 'dot' | 'word'> =
    project.questions.length === 0
      ? { dot: 'idle', word: 'no questions' }
      : openQuestions
        ? { dot: 'warn', word: 'to answer' }
        : { dot: 'ok', word: 'all answered' }

  const steps: Item[] = [
    { to: '/evidence', label: 'Evidence', Icon: FolderOpen, step: 1, count: project.files.length, ...evidence },
    { to: '/facts', label: 'Facts', Icon: ListChecks, step: 2, count: project.facts.length, dot: openConflicts ? 'bad' : 'ok' },
    { to: '/questions', label: 'Questions', Icon: CircleQuestionMark, step: 3, count: openQuestions, ...questions },
    { to: '/pack', label: 'Pack', Icon: Box, step: 4, dot: 'idle' },
    { to: '/brief', label: 'Brief', Icon: FileText, step: 5, dot: project.brief.approvedBy ? 'ok' : 'idle' },
  ]
  const more: Item[] = [
    { to: '/rules', label: 'Rules map', Icon: Network },
    { to: '/claims', label: 'Claims', Icon: Tag },
    { to: '/trust', label: 'Trust', Icon: ShieldCheck },
  ]

  return (
    <nav
      aria-label="Steps"
      data-collapsed={collapsed || undefined}
      className={`sticky top-14 h-[calc(100vh-56px)] w-14 shrink-0 border-r border-border bg-surface p-2 transition-[width] duration-200 ease-out ${
        collapsed ? '' : 'lg:w-[220px] lg:p-3'
      }`}
    >
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        className="mb-2 hidden w-full items-center gap-2.5 rounded-chip px-2.5 py-2 text-[13px] text-ink-2 hover:bg-bg focus-visible:outline-2 focus-visible:outline-info lg:flex"
      >
        {collapsed ? <ChevronsRight size={18} aria-hidden="true" /> : <ChevronsLeft size={18} aria-hidden="true" />}
        {!collapsed && <span>Collapse</span>}
      </button>
      <ul className="space-y-0.5">
        {steps.map((i) => (
          <li key={i.to}>
            <RailLink item={i} collapsed={collapsed} />
          </li>
        ))}
      </ul>
      <hr className="my-3 border-border" />
      <ul className="space-y-0.5">
        {more.map((i) => (
          <li key={i.to}>
            <RailLink item={i} collapsed={collapsed} />
          </li>
        ))}
      </ul>
    </nav>
  )
}

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  ArrowRight,
  CircleCheck,
  CircleDashed,
  ExternalLink,
  FileSearch,
  Info,
  MessageCircleQuestion,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent } from 'react'
import { Link } from 'react-router'
import { RuleChip } from '../components/RuleChip'
import { StateBadge, type BadgeState } from '../components/StateBadge'
import { formatValue } from '../lib/labels'
import { prefersReducedMotion } from '../lib/motion'
import {
  buildRulesGraph,
  countsText,
  nodeStates,
  REQ_WORD,
  relatedIds,
  RULE_WORD,
  SIZE,
  type FactNode,
  type MapNode,
  type ReqShown,
  type RequirementNode,
  type RuleNode,
  type RulesGraph,
  type RuleShown,
} from '../lib/rulesGraph'
import { useProject } from '../state/project'
import type { Fact, Project, Rule } from '../types/project'
import './rulesMap.css'

type Tone = 'ok' | 'warn' | 'bad' | 'ai'

const REQ_LOOK: Record<ReqShown, { Icon: LucideIcon; tone: Tone }> = {
  met: { Icon: CircleCheck, tone: 'ok' },
  decided: { Icon: CircleCheck, tone: 'ok' },
  missing: { Icon: CircleDashed, tone: 'warn' },
  conflict: { Icon: TriangleAlert, tone: 'bad' },
}
const RULE_TONE: Record<RuleShown, ReqShown> = { met: 'met', missing: 'missing', conflict: 'conflict' }
const FACT_TONE: Record<BadgeState, Tone> = { confirmed: 'ok', pass: 'ok', ai_suggested: 'ai', missing: 'warn', conflict: 'bad' }
const TONE_CLS: Record<Tone, string> = { ok: 'text-ok bg-ok/10', warn: 'text-warn bg-warn/10', bad: 'text-bad bg-bad/10', ai: 'text-ai bg-ai/10' }

/** Requirement and rule state: same icons and colours as StateBadge, with the map's own words. */
function MapBadge({ state, word }: { state: ReqShown; word: string }) {
  const { Icon, tone } = REQ_LOOK[state]
  return (
    <span data-state={state} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-chip px-2 py-0.5 text-[12px] font-medium ${TONE_CLS[tone]}`}>
      <Icon size={14} aria-hidden="true" strokeWidth={2} />
      {word}
    </span>
  )
}

const toneOf = (n: MapNode): Tone =>
  n.kind === 'fact' ? FACT_TONE[n.state] : n.kind === 'rule' ? REQ_LOOK[RULE_TONE[n.state]].tone : REQ_LOOK[n.state].tone

// ---------- change tracking ----------

/** Last state seen per node, kept across visits so a change made on another screen shows on return. */
const seen = new Map<string, { state: string; changedAt: number }>()
const CHANGED_MS = 4000

/** For tests: forget what the map saw before. */
export function forgetSeenStates() {
  seen.clear()
}

function useChangedNodes(graph: RulesGraph): Set<string> {
  const [, tick] = useState(0)
  const changed = useMemo(() => {
    const now = Date.now()
    for (const [id, state] of nodeStates(graph)) {
      const prev = seen.get(id)
      if (!prev) seen.set(id, { state, changedAt: 0 })
      else if (prev.state !== state) seen.set(id, { state, changedAt: now })
    }
    const out = new Set<string>()
    for (const id of nodeStates(graph).keys()) if (now - (seen.get(id)?.changedAt ?? 0) < CHANGED_MS) out.add(id)
    return out
  }, [graph])
  // Clear the "Updated" marks once they expire.
  useEffect(() => {
    if (changed.size === 0) return
    const t = window.setTimeout(() => tick((n) => n + 1), CHANGED_MS)
    return () => window.clearTimeout(t)
  }, [changed])
  return changed
}

// ---------- nodes ----------

type NodeData = {
  node: MapNode
  selected: boolean
  related: boolean
  changed: boolean
  onPick: (n: MapNode) => void
}
type HeadingData = { text: string; count: number }
type MapFlowNode = Node<NodeData, 'map'>
type HeadingFlowNode = Node<HeadingData, 'heading'>

function MapNodeView({ data, positionAbsoluteX, positionAbsoluteY, width = 0, height = 0 }: NodeProps<MapFlowNode>) {
  const { node, selected, related, changed, onPick } = data
  const rf = useReactFlow()

  // Keyboard focus on a node that is off screen (after zooming in) pans it into view.
  const keepInView = (e: FocusEvent<HTMLButtonElement>) => {
    const pane = e.currentTarget.closest('.react-flow')
    if (!pane) return
    const a = e.currentTarget.getBoundingClientRect()
    const b = pane.getBoundingClientRect()
    const inside = a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom
    if (inside || b.width === 0) return
    void rf.setCenter(positionAbsoluteX + width / 2, positionAbsoluteY + height / 2, {
      zoom: rf.getZoom(),
      duration: prefersReducedMotion() ? 0 : 200,
    })
  }

  const ring = selected ? 'border-ink outline-2 outline-ink' : related ? 'border-ink-2' : 'border-border'
  return (
    <>
      {node.kind !== 'fact' && <Handle type="target" position={Position.Left} isConnectable={false} />}
      <button
        type="button"
        data-node-button={node.id}
        data-kind={node.kind}
        data-state={node.state}
        aria-label={changed ? `${node.label}, just updated` : node.label}
        aria-pressed={selected}
        onClick={() => onPick(node)}
        onFocus={keepInView}
        style={{ borderLeftColor: `var(--${toneOf(node)})` }}
        className={`flex h-full w-full flex-col justify-center gap-1 overflow-hidden rounded-card border border-l-4 bg-surface px-2.5 py-1.5 text-left text-ink hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info ${ring} ${changed ? 'rules-node-changed' : ''}`}
      >
        <NodeBody node={node} changed={changed} />
      </button>
      {node.kind !== 'requirement' && <Handle type="source" position={Position.Right} isConnectable={false} />}
    </>
  )
}

function Updated() {
  return (
    <span className="shrink-0 rounded-chip border border-info/40 px-1.5 text-[11px] font-medium leading-4 text-info">Updated</span>
  )
}

function NodeBody({ node, changed }: { node: MapNode; changed: boolean }) {
  if (node.kind === 'fact') {
    return (
      <>
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-[18px]" title={node.field}>
            {node.field}
          </span>
          {changed && <Updated />}
        </span>
        <span className="flex items-center gap-1.5">
          {node.value != null ? (
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2" title={node.value}>
              {node.value}
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-[12px] italic text-warn">missing</span>
          )}
          <StateBadge state={node.state} />
        </span>
      </>
    )
  }
  if (node.kind === 'rule') {
    const items = node.requirementIds.length
    return (
      <>
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold leading-[18px]" title={node.ref}>
            {node.ref}
          </span>
          {changed && <Updated />}
        </span>
        <span className="flex items-center gap-1.5">
          <MapBadge state={RULE_TONE[node.state]} word={RULE_WORD[node.state]} />
          <span className="truncate text-[12px] text-ink-2">
            <span className="font-mono">{items}</span> pack item{items === 1 ? '' : 's'}
          </span>
        </span>
      </>
    )
  }
  return (
    <>
      <span className="line-clamp-2 text-[13px] font-medium leading-[17px]" title={node.requirement.item}>
        {node.requirement.item}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">{node.requirement.panel ?? 'Any panel'}</span>
        {changed && <Updated />}
        <MapBadge state={node.state} word={REQ_WORD[node.state]} />
      </span>
    </>
  )
}

function HeadingView({ data }: NodeProps<HeadingFlowNode>) {
  return (
    <h2 className="flex items-baseline gap-1.5 text-[14px] font-semibold text-ink">
      {data.text}
      <span className="font-mono text-[12px] font-normal text-ink-2">{data.count}</span>
    </h2>
  )
}

const nodeTypes: NodeTypes = { map: MapNodeView, heading: HeadingView }

// ---------- canvas ----------

const PAD = 24

function ViewportFit({ graph, width }: { graph: RulesGraph; width: number }) {
  const rf = useReactFlow()
  useEffect(() => {
    if (!width) return
    const zoom = Math.min(1, (width - 2 * PAD) / graph.width)
    void rf.setViewport({ x: Math.max(PAD, (width - graph.width * zoom) / 2), y: PAD / 2, zoom })
  }, [rf, width, graph.width, graph.height])
  return null
}

/** Pan a node out from under the side panel when it is picked. */
function KeepClearOfPanel({ node, width, panel }: { node: MapNode | null; width: number; panel: number }) {
  const rf = useReactFlow()
  useEffect(() => {
    if (!node || !width) return
    const vp = rf.getViewport()
    const right = vp.x + (node.x + node.w) * vp.zoom
    const limit = width - panel - 16
    if (right > limit) void rf.setViewport({ ...vp, x: vp.x - (right - limit) }, { duration: prefersReducedMotion() ? 0 : 200 })
  }, [rf, node, width, panel])
  return null
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

const PANEL_W = 340

// ---------- screen ----------

export function RulesMap() {
  const { project, openSource } = useProject()
  const graph = useMemo(() => buildRulesGraph(project), [project])
  const changed = useChangedNodes(graph)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [wrapRef, width] = useWidth<HTMLDivElement>()

  const all: MapNode[] = useMemo(() => [...graph.facts, ...graph.rules, ...graph.requirements], [graph])
  const selected = all.find((n) => n.id === selectedId) ?? null
  const related = useMemo(() => relatedIds(graph, selectedId), [graph, selectedId])
  const panelOpen = !!selected && !(selected.kind === 'fact' && selected.fact && selected.fact.sources.length > 0)

  const close = () => {
    const id = selectedId
    setSelectedId(null)
    if (id) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-node-button="${CSS.escape(id)}"]`)?.focus())
  }
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  const pick = (n: MapNode) => {
    // A fact with a source opens the file at the quote; the path through it stays highlighted.
    if (n.kind === 'fact' && n.fact && n.fact.sources.length > 0) {
      setSelectedId(n.id)
      openSource(n.fact.sources[0])
      return
    }
    setSelectedId((cur) => (cur === n.id ? null : n.id))
  }
  const pickRef = useRef(pick)
  pickRef.current = pick
  const onPick = useMemo(() => (n: MapNode) => pickRef.current(n), [])

  const nodes = useMemo<(MapFlowNode | HeadingFlowNode)[]>(() => {
    const heading = (id: string, x: number, w: number, text: string, count: number): HeadingFlowNode => ({
      id,
      type: 'heading',
      position: { x, y: 0 },
      width: w,
      height: 28,
      data: { text, count },
      selectable: false,
      focusable: false,
      draggable: false,
    })
    return [
      heading('h-facts', graph.columns.fact, SIZE.fact.w, 'Product facts', graph.facts.length),
      heading('h-rules', graph.columns.rule, SIZE.rule.w, 'Rules', graph.rules.length),
      heading('h-reqs', graph.columns.requirement, SIZE.requirement.w, 'Required pack items', graph.requirements.length),
      ...all.map(
        (n): MapFlowNode => ({
          id: n.id,
          type: 'map',
          position: { x: n.x, y: n.y },
          width: n.w,
          height: n.h,
          data: { node: n, selected: n.id === selectedId, related: related.has(n.id), changed: changed.has(n.id), onPick },
          focusable: false,
          draggable: false,
          selectable: false,
        }),
      ),
    ]
  }, [graph, all, selectedId, related, changed, onPick])

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((e) => {
        const hot = selectedId != null && related.has(e.source) && related.has(e.target)
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          focusable: false,
          selectable: false,
          style: { stroke: hot ? 'var(--ink)' : 'var(--ink-2)', strokeOpacity: hot ? 1 : 0.35, strokeWidth: hot ? 2 : 1.25 },
        }
      }),
    [graph, related, selectedId],
  )

  const reqCounts = useMemo(() => {
    const c: Record<ReqShown, number> = { met: 0, decided: 0, missing: 0, conflict: 0 }
    for (const r of graph.requirements) c[r.state]++
    return c
  }, [graph])

  const approved = project.demoMode === false
  const zoom = width ? Math.min(1, (width - 2 * PAD) / graph.width) : 1
  const canvasH = Math.max(360, Math.round(graph.height * zoom + PAD * 1.5))

  if (graph.requirements.length === 0) {
    return (
      <section className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center">
        <ShieldCheck size={24} aria-hidden="true" className="mx-auto text-ink-2" />
        <h1 className="mt-3 text-[20px] font-semibold">Rules map</h1>
        <p className="mt-1 text-ink-2">
          No required pack items yet: no fact in the files has triggered a rule.
          {project.rules.length > 0 && ` ${project.rules.length} rule${project.rules.length === 1 ? '' : 's'} checked, nothing needed.`}
        </p>
        <Link to="/facts" className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium text-info underline">
          See the facts
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </section>
    )
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <header>
        <h1 className="text-[20px] font-semibold">Rules map</h1>
        <p className="mt-1 text-[14px] text-ink-2">
          Why each item must be on the pack: your facts trigger rules, rules require pack content. Pick a rule to read it and see why it applies.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
          <p data-testid="rules-summary">
            <span className="font-mono">{graph.requirements.length}</span> required pack items:{' '}
            <span className="font-mono">{reqCounts.met + reqCounts.decided}</span> met or decided ·{' '}
            <span className="font-mono">{reqCounts.missing}</span> missing · <span className="font-mono">{reqCounts.conflict}</span> in conflict
          </p>
          <p data-testid="other-rules" className="text-ink-2">
            {graph.otherRules > 0
              ? `${graph.otherRules} other rule${graph.otherRules === 1 ? '' : 's'} checked, nothing needed`
              : 'Every rule checked needs something on this pack'}
          </p>
          {!approved && (
            <p className="inline-flex items-center gap-1 text-warn">
              <ShieldAlert size={14} aria-hidden="true" />
              Draft rules: not approved by your legal team yet
            </p>
          )}
        </div>
        <ul aria-label="Legend" className="mt-2 flex flex-wrap gap-2">
          <li>
            <MapBadge state="met" word="Met" />
          </li>
          <li>
            <MapBadge state="decided" word="Decided (answered)" />
          </li>
          <li>
            <MapBadge state="missing" word="Missing or needs an answer" />
          </li>
          <li>
            <MapBadge state="conflict" word="Conflict" />
          </li>
        </ul>
      </header>

      <div ref={wrapRef} className="rules-map relative mt-4 rounded-card border border-border bg-surface" style={{ height: canvasH }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            aria-label="Rules map: product facts on the left, rules in the middle, required pack items on the right"
            defaultViewport={{ x: PAD, y: PAD / 2, zoom }}
            minZoom={0.3}
            maxZoom={2}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            zoomOnScroll={false}
            zoomOnDoubleClick={false}
            panOnScroll={false}
            preventScrolling={false}
            deleteKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            onPaneClick={() => selectedId && setSelectedId(null)}
          >
            <Background gap={24} size={1} color="var(--border)" />
            <Controls showInteractive={false} position="top-left" fitViewOptions={{ padding: 0.04 }} />
            <ViewportFit graph={graph} width={width} />
            <KeepClearOfPanel node={panelOpen ? selected : null} width={width} panel={PANEL_W} />
          </ReactFlow>
        </ReactFlowProvider>

        {panelOpen && selected && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10" style={{ width: Math.min(PANEL_W, Math.max(0, width - 32)) || PANEL_W }}>
            <div className="pointer-events-auto sticky top-[72px] max-h-[calc(100vh-96px)] overflow-y-auto">
              <SidePanel
                node={selected}
                graph={graph}
                project={project}
                approved={approved}
                onClose={close}
                onPick={pick}
                onSource={(f) => f.sources[0] && openSource(f.sources[0])}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- side panel ----------

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

function day(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : DAY.format(d)
}

export function ruleDates(rule: Rule): string {
  if (rule.status === 'upcoming') return rule.from ? `Applies from ${day(rule.from)}` : 'Coming, no start date in the market pack'
  if (rule.status === 'repealed') return rule.to ? `Repealed on ${day(rule.to)}` : 'Repealed'
  const since = rule.from ? `In force since ${day(rule.from)}` : 'In force (no start date in the market pack)'
  return rule.to ? `${since}, until ${day(rule.to)}` : since
}

interface PanelProps {
  node: MapNode
  graph: RulesGraph
  project: Project
  approved: boolean
  onClose: () => void
  onPick: (n: MapNode) => void
  onSource: (f: Fact) => void
}

function SidePanel(props: PanelProps) {
  const { node, onClose } = props
  const title = node.kind === 'rule' ? 'Rule' : node.kind === 'requirement' ? 'Required pack item' : 'Product fact'
  return (
    <aside aria-labelledby="rules-panel-title" className="m-2 rounded-card border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 id="rules-panel-title" className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="-m-1 rounded-chip p-1 text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-info"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {node.kind === 'rule' && <RulePanel {...props} node={node} />}
      {node.kind === 'requirement' && <RequirementPanel {...props} node={node} />}
      {node.kind === 'fact' && <FactPanel {...props} node={node} />}
    </aside>
  )
}

function FactRow({ factNode, onSource, onPick }: { factNode: FactNode; onSource: (f: Fact) => void; onPick: (n: MapNode) => void }) {
  const f = factNode.fact
  const hasSource = !!f && f.sources.length > 0
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => (hasSource && f ? onSource(f) : onPick(factNode))}
        className="min-w-0 flex-1 truncate text-left text-[13px] underline decoration-border underline-offset-2 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-info"
        title={hasSource ? 'Open the file at the quote' : 'No file has this fact'}
      >
        {factNode.field}
        {f && f.value != null && f.state !== 'missing' && <span className="ml-1 font-mono text-[12px] text-ink-2">{formatValue(f)}</span>}
      </button>
      <StateBadge state={factNode.state} />
    </li>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </section>
  )
}

function RulePanel({ node, graph, project, approved, onPick, onSource }: PanelProps & { node: RuleNode }) {
  const rule = node.rule
  const facts = graph.facts.filter((f) => node.factIds.includes(f.factId))
  const reqs = graph.requirements.filter((r) => r.ruleId === node.ruleId)
  const conflicts = project.conflicts.filter((c) => c.ruleId === node.ruleId && !c.resolution)
  return (
    <>
      <p className="mt-1 font-mono text-[16px] font-semibold">{node.ref}</p>
      {rule && (
        <div className="mt-1">
          <RuleChip rule={rule} />
        </div>
      )}
      <p className="mt-3 text-[14px] leading-6">{rule?.summary ?? 'This rule is cited by a requirement but is not in the market pack data.'}</p>
      {rule && (
        <>
          <a href={rule.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-info underline">
            Read the official text
            <ExternalLink size={13} aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <p className="mt-2 text-[13px] text-ink-2">{ruleDates(rule)}</p>
        </>
      )}
      {approved ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-chip bg-ok/10 p-2 text-[13px] text-ok">
          <ShieldCheck size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          Approved for use by your company.
        </p>
      ) : (
        <p data-testid="rule-approval" className="mt-3 flex items-start gap-1.5 rounded-chip bg-warn/10 p-2 text-[13px] text-warn">
          <ShieldAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">Not approved yet.</strong> This rule is a draft written from the official text for the demo. Nobody on
            your legal team has signed it off, so treat what it requires as advice until they do.
          </span>
        </p>
      )}

      <Section title="Why it applies here">
        <p className="text-[13px] text-ink-2">
          {facts.length === 1 ? 'This product fact falls under the rule:' : `These ${facts.length} product facts fall under the rule:`}
        </p>
        <ul className="mt-1.5 space-y-1.5">
          {facts.map((f) => (
            <FactRow key={f.id} factNode={f} onSource={onSource} onPick={onPick} />
          ))}
        </ul>
        {conflicts.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {conflicts.map((c) => (
              <li key={c.id} className="flex items-start gap-1.5 text-[13px]">
                <TriangleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
                <span>
                  <span className="font-medium text-bad">Open conflict:</span> {c.explanation}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`What it requires on the pack (${countsText(node.counts)})`}>
        <ul className="space-y-1.5">
          {reqs.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onPick(r)}
                className="min-w-0 flex-1 truncate text-left text-[13px] underline decoration-border underline-offset-2 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-info"
              >
                {r.requirement.item}
                {r.requirement.panel && <span className="ml-1 text-ink-2">· {r.requirement.panel}</span>}
              </button>
              <MapBadge state={r.state} word={REQ_WORD[r.state]} />
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}

const Q_STATUS = { open: 'Open', answered: 'Answered', skipped: 'Skipped' } as const

function QuestionLinks({ ids, project }: { ids: string[]; project: Project }) {
  const qs = project.questions.filter((q) => ids.includes(q.id))
  if (qs.length === 0) return <p className="text-[13px] text-ink-2">No question is open for this.</p>
  return (
    <ul className="space-y-2">
      {qs.map((q) => (
        <li key={q.id} className="rounded-chip border border-border p-2 text-[13px]">
          <p>{q.text}</p>
          <p className="mt-1 flex items-center justify-between gap-2">
            <span className="text-ink-2">
              {Q_STATUS[q.status]}
              {q.status === 'answered' && q.answer ? `: ${q.answer}` : ''}
            </span>
            <Link
              to={`/questions#${q.id}`}
              className="inline-flex shrink-0 items-center gap-1 font-medium text-info underline focus-visible:outline-2 focus-visible:outline-info"
            >
              <MessageCircleQuestion size={14} aria-hidden="true" />
              {q.status === 'answered' ? 'See the answer' : 'Answer it'}
            </Link>
          </p>
        </li>
      ))}
    </ul>
  )
}

function RequirementPanel({ node, graph, project, onPick, onSource }: PanelProps & { node: RequirementNode }) {
  const r = node.requirement
  const rule = graph.rules.find((x) => x.ruleId === r.ruleId)
  const facts = graph.facts.filter((f) => r.factIds.includes(f.factId))
  const conflicts = project.conflicts.filter((c) => !c.resolution && c.ruleId === r.ruleId && c.factIds.some((id) => r.factIds.includes(id)))
  return (
    <>
      <p className="mt-1 text-[16px] font-semibold leading-6">{r.item}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
        <MapBadge state={node.state} word={REQ_WORD[node.state]} />
        {r.panel ? `Goes on: ${r.panel}` : 'Any panel'}
      </p>
      {node.state === 'decided' && (
        <p className="mt-2 text-[13px] text-ink-2">Answered on the Questions screen; the brief takes the answer.</p>
      )}
      {rule && (
        <Section title="Required by">
          <button
            type="button"
            onClick={() => onPick(rule)}
            className="text-left font-mono text-[13px] underline decoration-border underline-offset-2 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-info"
          >
            {rule.ref}
          </button>
          {rule.rule && <p className="mt-1 text-[13px] text-ink-2">{rule.rule.summary}</p>}
        </Section>
      )}
      <Section title="Product facts behind it">
        <ul className="space-y-1.5">
          {facts.map((f) => (
            <FactRow key={f.id} factNode={f} onSource={onSource} onPick={onPick} />
          ))}
        </ul>
        {conflicts.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {conflicts.map((c) => (
              <li key={c.id} className="flex items-start gap-1.5 text-[13px]">
                <TriangleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
                <span>
                  <span className="font-medium text-bad">Open conflict:</span> {c.explanation}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Related question">
        <QuestionLinks ids={node.questionIds} project={project} />
      </Section>
    </>
  )
}

function FactPanel({ node, graph, project, onPick }: PanelProps & { node: FactNode }) {
  const reqs = graph.requirements.filter((r) => node.requirementIds.includes(r.requirement.id))
  const qIds = project.questions.filter((q) => q.factIds.includes(node.factId)).map((q) => q.id)
  return (
    <>
      <p className="mt-1 text-[16px] font-semibold leading-6">{node.field}</p>
      <p className="mt-1 flex items-center gap-2">
        <StateBadge state={node.state} />
      </p>
      <p className="mt-2 flex items-start gap-1.5 text-[13px] text-ink-2">
        <FileSearch size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
        {node.fact ? 'No file has this yet, so there is no quote to show. A question asks for it.' : 'A requirement needs this fact but no file has it.'}
      </p>
      <Section title="Needed for">
        <ul className="space-y-1.5">
          {reqs.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onPick(r)}
                className="min-w-0 flex-1 truncate text-left text-[13px] underline decoration-border underline-offset-2 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-info"
              >
                {r.requirement.item}
              </button>
              <MapBadge state={r.state} word={REQ_WORD[r.state]} />
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Related question">
        <QuestionLinks ids={qIds} project={project} />
      </Section>
      <p className="mt-4 flex items-start gap-1.5 text-[12px] text-ink-2">
        <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
        Answering the question fills this fact and turns the items above green.
      </p>
    </>
  )
}

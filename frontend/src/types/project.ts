// Mirrors docs/UI.md §9 (GET /api/project). Will be replaced by types generated
// from the backend OpenAPI schema; keep names identical to §9.

/** pdf = dieline, document = plain PDF, sheet = Excel, docx = Word, text = .txt/.md notes, image = PNG/JPG. */
export type FileType = 'pdf' | 'document' | 'sheet' | 'docx' | 'text' | 'image'
export type FileStatus = 'queued' | 'reading' | 'done' | 'error'

export interface SkippedItem {
  item: string
  reason: string
}

export interface ProjectFile {
  id: string
  name: string
  type: FileType
  /** Unit count: pages (pdf, document), sheets (sheet), paragraphs (docx), lines (text), 1 (image). */
  pages: number
  status: FileStatus
  skipped: SkippedItem[]
  /** Plain reason when status is 'error'. */
  error?: string
}

/** x, y, w, h in mm on the page (same frame as pack panels and conflict locations). */
export type BBox = [number, number, number, number]

export interface SourceWhere {
  panel?: string
  page?: number
  bbox?: BBox
  sheet?: string
  cell?: string
  /** Word paragraph number and notes line number (1-based). Not in the backend SourceWhere yet. */
  paragraph?: number
  line?: number
}

export interface Source {
  fileId: string
  where: SourceWhere
  quote: string
  quoteChecked: boolean
}

export type FactGroup =
  | 'identity'
  | 'ingredients'
  | 'allergens'
  | 'nutrition'
  | 'quantity'
  | 'claims'
  | 'company'
  | 'packaging'

/** 'pass' marks a fact whose code check passed (e.g. UPC check digit). */
export type FactState = 'confirmed' | 'ai_suggested' | 'missing' | 'pass'

export interface Fact {
  id: string
  group: FactGroup
  field: string
  value: string | null
  unit: string | null
  state: FactState
  sources: Source[]
  /** Set by a person's answer (backend). */
  action?: 'keep' | 'change' | 'add' | 'remove'
}

export type ConflictKind = 'value' | 'list' | 'math' | 'rule' | 'meaning'
export type Severity = 'high' | 'medium' | 'low'
export type Owner = 'legal' | 'rnd' | 'brand'
export type ResolutionChoice = 'intended' | 'left' | 'right' | 'custom'

export interface ConflictSide {
  value: string
  /** Empty when the value is computed by code or stated by a rule. */
  sources: Source[]
}

export interface Resolution {
  choice: ResolutionChoice
  by: string
  at: string
  /** The person's own answer when choice is 'custom'. */
  text?: string
}

/** A spot on the flat dieline, in mm. Shared by every lens. */
export interface ConflictLocation {
  fileId: string
  panel: string
  x: number
  y: number
  w: number
  h: number
}

export interface Conflict {
  id: string
  kind: ConflictKind
  severity: Severity
  owner: Owner
  factIds: string[]
  left: ConflictSide
  right: ConflictSide
  ruleId?: string
  explanation: string
  resolution?: Resolution
  locations: ConflictLocation[]
}

export type QuestionStatus = 'open' | 'answered' | 'skipped'

export interface Question {
  id: string
  text: string
  why: string
  ruleIds: string[]
  factIds: string[]
  unlocks: number
  answers: string[]
  status: QuestionStatus
  /** Chosen answer (backend, once answered). */
  answer?: string
  kind?: 'conflict' | 'missing' | 'design'
  requirementIds?: string[]
}

export type RequirementStatus = 'met' | 'missing' | 'conflict'

export interface Requirement {
  id: string
  ruleId: string
  item: string
  panel?: string
  status: RequirementStatus
  factIds: string[]
}

export type Market = 'US' | 'IN' | 'company'
export type RuleStatus = 'in_force' | 'upcoming' | 'repealed'

export interface Rule {
  id: string
  market: Market
  ref: string
  summary: string
  url: string
  status: RuleStatus
  from?: string
  to?: string
}

export interface PackPanel {
  name: string
  x: number
  y: number
  w: number
  h: number
}

export type BlockState = 'existing' | 'new' | 'moved' | 'removed' | 'overflow' | 'locked'

export interface PackBlock {
  item: string
  panel: string
  x: number
  y: number
  w: number
  h: number
  state: BlockState
}

export interface Pack {
  panels: PackPanel[]
  blocks: PackBlock[]
}

export interface BriefSentence {
  text: string
  factIds: string[]
}

export interface BriefSection {
  title: string
  sentences: BriefSentence[]
}

export interface Brief {
  version: number
  sections: BriefSection[]
  approvedBy?: string
  approvedAt?: string
}

export interface SelfTestRow {
  problem: string
  result: 'caught' | 'missed'
  reason?: string
}

export interface Trust {
  coverage: number
  aiOpen: number
  resolved: number
  selfTest: { caught: number; total: number; rows: SelfTestRow[] }
}

export interface Project {
  /** Market pack id the backend analysed with, e.g. 'us'. */
  market?: string | null
  /** True while unapproved rules are in use. */
  demoMode?: boolean
  files: ProjectFile[]
  facts: Fact[]
  conflicts: Conflict[]
  questions: Question[]
  requirements: Requirement[]
  rules: Rule[]
  pack: Pack
  brief: Brief
  trust: Trust
}

import { FileSpreadsheet, FileText, FileType as FileTypeIcon, Image as ImageIcon, StickyNote, type LucideIcon } from 'lucide-react'
import type { Conflict, ConflictKind, ConflictSide, Fact, FactGroup, FileType, Owner, ProjectFile, ResolutionChoice, Rule, Severity, Source } from '../types/project'

interface FileMeta {
  /** Chip prefix. */
  short: string
  /** Drawer heading prefix. */
  long: string
  /** Evidence card kind line. */
  kind: string
  /** Word for the unit count: [one, many]. */
  unit: [string, string]
  Icon: LucideIcon
}

// §9 has no display label for a file; derive one from its type.
export const FILE_META: Record<FileType, FileMeta> = {
  pdf: { short: 'Carton', long: 'Carton', kind: 'Dieline PDF', unit: ['page', 'pages'], Icon: FileText },
  document: { short: 'Spec', long: 'Document', kind: 'PDF document', unit: ['page', 'pages'], Icon: FileText },
  sheet: { short: 'Sheet', long: 'Content sheet', kind: 'Content spreadsheet', unit: ['sheet', 'sheets'], Icon: FileSpreadsheet },
  docx: { short: 'Word', long: 'Word document', kind: 'Word document', unit: ['paragraph', 'paragraphs'], Icon: FileTypeIcon },
  text: { short: 'Notes', long: 'Notes', kind: 'Text notes', unit: ['line', 'lines'], Icon: StickyNote },
  image: { short: 'Image', long: 'Image', kind: 'Image', unit: ['image', 'images'], Icon: ImageIcon },
}

export function fileShort(file?: ProjectFile): string {
  return file ? FILE_META[file.type].short : 'File'
}

export function fileLong(file?: ProjectFile): string {
  return file ? FILE_META[file.type].long : 'File'
}

export function fileIcon(file?: ProjectFile): LucideIcon {
  return file ? FILE_META[file.type].Icon : FileText
}

/** "3 pages", "1 sheet", "12 lines" ... the count with the right word for the file type. */
export function fileUnits(file: ProjectFile): string {
  const [one, many] = FILE_META[file.type].unit
  return `${file.pages} ${file.pages === 1 ? one : many}`
}

export function sourceShort(source: Source, file?: ProjectFile): string {
  const w = source.where
  const type = file?.type
  let spot = ''
  if (type === 'image') spot = ''
  else if (w.cell) spot = w.cell
  else if (w.panel) spot = w.panel
  else if (w.line != null) spot = `line ${w.line}`
  else if (w.paragraph != null) spot = `¶${w.paragraph}`
  else if (w.page != null) spot = `p.${w.page}`
  return spot ? `${fileShort(file)} · ${spot}` : fileShort(file)
}

export function sourceLong(source: Source, file?: ProjectFile): string {
  const w = source.where
  const name = fileLong(file)
  if (file?.type === 'image') return name
  if (w.cell) return `${name} · ${w.cell}`
  if (w.panel) return `${name} · ${/flap/i.test(w.panel) ? w.panel : `${w.panel} panel`}`
  if (w.line != null) return `${name} · line ${w.line}`
  if (w.paragraph != null) return `${name} · paragraph ${w.paragraph}`
  if (w.page != null) return `${name} · page ${w.page}`
  return name
}

export const GROUPS: { id: FactGroup; label: string }[] = [
  { id: 'identity', label: 'Identity' },
  { id: 'ingredients', label: 'Ingredients' },
  { id: 'allergens', label: 'Allergens' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'quantity', label: 'Quantity & barcode' },
  { id: 'claims', label: 'Claims & marks' },
  { id: 'company', label: 'Company & address' },
  { id: 'packaging', label: 'Packaging' },
]

export const KIND_LABEL: Record<ConflictKind, string> = {
  value: 'Value conflict',
  list: 'List conflict',
  math: 'Math check',
  rule: 'Rule',
  meaning: 'Meaning (AI)',
}

export const OWNER_LABEL: Record<Owner, string> = { legal: 'Legal', rnd: 'R&D', brand: 'Brand' }

export const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
export const SEVERITY_LABEL: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low' }

export function formatValue(fact: Fact): string {
  if (fact.value == null) return ''
  if (!fact.unit) return fact.value
  return fact.unit === '%' ? `${fact.value}%` : `${fact.value} ${fact.unit}`
}

export function sideName(side: ConflictSide, kind: ConflictKind, files: ProjectFile[]): string {
  const first = side.sources[0]
  if (first) return fileShort(files.find((f) => f.id === first.fileId)).toLowerCase()
  return kind === 'math' ? 'computed' : 'rule'
}

export function resolutionText(conflict: Conflict, choice: ResolutionChoice, files: ProjectFile[]): string {
  if (choice === 'intended') return 'intended change'
  if (choice === 'custom') return conflict.resolution?.text ? `own answer: ${conflict.resolution.text}` : 'own answer'
  const side = choice === 'left' ? conflict.left : conflict.right
  return `use ${sideName(side, conflict.kind, files)} value`
}

export function ruleStatusText(rule: Rule): string {
  if (rule.status === 'in_force') return 'in force'
  if (rule.status === 'upcoming') return rule.from ? `from ${rule.from}` : 'upcoming'
  return rule.to ? `repealed ${rule.to}` : 'repealed'
}

export function marketCode(market: Rule['market']): string {
  return market === 'company' ? 'Company' : market
}

export function askMessage(owner: Owner | undefined, subject: string, detail: string): string {
  const who = owner ? OWNER_LABEL[owner] : 'team'
  return `Hi ${who}, could you confirm this for the pack brief?\n\n${subject}\n${detail}\n\nThank you.`
}

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (_, pre: string, ch: string) => pre + ch.toUpperCase())
}

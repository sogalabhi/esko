import type { Conflict, ConflictKind, ConflictSide, Fact, FactGroup, Owner, ProjectFile, ResolutionChoice, Rule, Severity, Source } from '../types/project'

// §9 has no display label for a file; derive one from its type for now.
export function fileShort(file?: ProjectFile): string {
  if (!file) return 'File'
  return file.type === 'sheet' ? 'Sheet' : 'Carton'
}

export function fileLong(file?: ProjectFile): string {
  if (!file) return 'File'
  return file.type === 'sheet' ? 'Content sheet' : 'Carton'
}

export function sourceShort(source: Source, file?: ProjectFile): string {
  const w = source.where
  const spot = w.cell ?? w.panel ?? (w.page != null ? `p. ${w.page}` : '')
  return spot ? `${fileShort(file)} · ${spot}` : fileShort(file)
}

export function sourceLong(source: Source, file?: ProjectFile): string {
  const w = source.where
  if (w.cell) return `${fileLong(file)} · ${w.cell}`
  if (w.panel) return `${fileLong(file)} · ${/flap/i.test(w.panel) ? w.panel : `${w.panel} panel`}`
  if (w.page != null) return `${fileLong(file)} · page ${w.page}`
  return fileLong(file)
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

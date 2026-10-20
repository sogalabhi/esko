import type { RuleCheckType, Source, SourceWhere } from '../types/project'

/** What the checker does with a rulebook rule, in plain words. */
export const CHECK_TYPE_LABEL: Record<RuleCheckType, string> = {
  present: 'Checks the item is on the pack',
  absent: 'Checks the pack does not carry banned words or items',
  exact: 'Compares the copy word for word with the approved information',
  size: 'Measures the text size on the pack',
  word_list: 'Looks for words from a list',
  evidence_on_file: 'Needs proof on file, so a person confirms it',
  unsupported: 'No automatic check, so a person reviews it',
}

/** "paragraph 14", "page 3", "line 7" ... where in the rulebook a quote came from. */
export function whereInFile(where: SourceWhere): string {
  if (where.paragraph != null) return `paragraph ${where.paragraph}`
  if (where.page != null) return `page ${where.page}`
  if (where.line != null) return `line ${where.line}`
  return 'position not recorded'
}

export const sourceWhere = (s: Source): string => whereInFile(s.where)

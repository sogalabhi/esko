import type { FindingKind } from '../types/project'

/** Plain words for what kind of check produced a finding. */
export const KIND_LABELS: Record<FindingKind, string> = {
  missing: 'Missing item',
  mismatch: 'Copy differs',
  math: 'Math check',
  rule: 'Rule check',
  claim: 'Claim',
  format: 'Format',
  hidden: 'Hidden copy',
  text_size: 'Text size',
  approval: 'Approval',
}

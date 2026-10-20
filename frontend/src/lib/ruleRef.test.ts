import { describe, expect, it } from 'vitest'
import { tidyRef } from './ruleRef'

describe('tidyRef', () => {
  it('shows the clause once when it starts with the regulation section', () => {
    expect(tidyRef('21 CFR 101.9 101.9(c)(6)(iii)')).toBe('21 CFR 101.9(c)(6)(iii)')
  })

  it('handles a regulation that lists two citations', () => {
    expect(tidyRef('FD&C Act 403(w)(1), 21 U.S.C. 343(w)(1) 21 U.S.C. 343(w)(1)(A)')).toBe('FD&C Act 403(w)(1), 21 U.S.C. 343(w)(1)(A)')
  })

  it('leaves a ref alone when nothing repeats', () => {
    expect(tidyRef('21 CFR 101.9')).toBe('21 CFR 101.9')
    expect(tidyRef('Company rule 4 Allergens')).toBe('Company rule 4 Allergens')
    expect(tidyRef('')).toBe('')
  })
})

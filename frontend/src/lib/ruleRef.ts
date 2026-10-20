/**
 * A market rule's `ref` is the regulation and the clause joined with a space, and the clause usually
 * starts with the section the regulation already names ("21 CFR 101.9 101.9(c)(6)(iii)"). Show it once:
 * where the end of the regulation is the start of the clause, the clause replaces it
 * ("21 CFR 101.9(c)(6)(iii)"). A ref with no such overlap is shown as it is.
 */
export function tidyRef(ref: string): string {
  const spaces = [...ref.matchAll(/ /g)].map((m) => m.index as number)
  let best: string | null = null
  let bestLen = 0
  for (const at of spaces) {
    const reg = ref.slice(0, at)
    const clause = ref.slice(at + 1)
    if (!clause) continue
    // The longest tail of the regulation (from a word start) that the clause begins with.
    for (let i = 0; i < reg.length; i++) {
      if (i > 0 && reg[i - 1] !== ' ') continue
      const tail = reg.slice(i)
      if (/\d/.test(tail) && clause.length >= tail.length && clause.startsWith(tail)) {
        if (tail.length > bestLen) {
          bestLen = tail.length
          best = reg.slice(0, i) + clause
        }
        break
      }
    }
  }
  return best ?? ref
}

import { diffIngredients, ingredientKey, splitIngredients } from './ingredients'

describe('ingredients', () => {
  it('splits on top-level commas and full stops only', () => {
    expect(splitIngredients('INGREDIENTS: Oats (79%), Oil (Rapeseed, Sunflower), Salt. Natural Flavoring.')).toEqual([
      'Oats (79%)',
      'Oil (Rapeseed, Sunflower)',
      'Salt',
      'Natural Flavoring',
    ])
  })

  it('normalises names for comparison', () => {
    expect(ingredientKey('Dried Blueberries')).toBe(ingredientKey('Blueberries'))
    expect(ingredientKey('Vegetable Oils (in varying proportions)')).toBe(ingredientKey('Vegetable Oil (Rapeseed and Sunflower)'))
  })

  it('marks added, missing and duplicate items', () => {
    const d = diffIngredients('Oats, Walnuts, Honey', 'Oats, Honey, Honey, Salt')
    expect(d.left.map((x) => x.status)).toEqual(['same', 'added', 'same'])
    expect(d.right.map((x) => x.status)).toEqual(['same', 'same', 'duplicate', 'missing'])
  })
})

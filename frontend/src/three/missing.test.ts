import { describe, expect, it } from 'vitest'
import type { Requirement } from '../types/project'
import { itemLabel, placeMissing } from './missing'

const req = (item: string, status: Requirement['status'] = 'missing'): Requirement => ({ id: `r-${item}`, ruleId: 'x', item, status, factIds: [] })

describe('placeMissing', () => {
  it('puts a missing item where the fit engine placed it, matched by item or by what a block covers', () => {
    const { ghosts, unslotted } = placeMissing(
      [req('net_quantity_ounces'), req('allergen_declaration')],
      [
        { item: 'net_quantity', label: 'Net quantity statement', panel: 'Front', x: 239, y: 144, w: 27, h: 7, state: 'new', covers: ['net_quantity', 'net_quantity_ounces'] },
        { item: 'allergen_declaration', label: 'Allergen "Contains" statement', panel: 'Back', x: 45, y: 237, w: 39, h: 21, state: 'new' },
      ],
    )
    expect(ghosts).toEqual([
      { panel: 'Front', x: 239, y: 144, w: 27, h: 7, label: 'Net quantity statement' },
      { panel: 'Back', x: 45, y: 237, w: 39, h: 21, label: 'Allergen "Contains" statement' },
    ])
    expect(unslotted).toEqual([])
  })

  it('lists an item without a slot (or only an overflow) instead of drawing it anywhere', () => {
    const { ghosts, unslotted } = placeMissing(
      [req("Maker's name and place of business"), req('net_quantity'), req('net_quantity'), req('ingredient_list', 'met')],
      [{ item: 'net_quantity', panel: 'Front', x: 1, y: 1, w: 10, h: 5, state: 'overflow' }],
    )
    expect(ghosts).toEqual([])
    expect(unslotted).toEqual(["Maker's name and place of business", 'Net quantity'])
  })

  it('turns an item id into words', () => {
    expect(itemLabel('allergen_declaration')).toBe('Allergen declaration')
    expect(itemLabel('Net quantity in oz')).toBe('Net quantity in oz')
  })
})

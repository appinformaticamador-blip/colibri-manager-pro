import { describe, expect, it } from 'vitest'
import { buildMarginProducts, includedMarginAverage } from './profitabilityModel'

describe('profitabilityModel', () => {
  const masters = [{ id: 'm1', name: 'Producto', base_unit: 'ud', manual_unit_cost: 2 }]
  const links = [
    { id: 'l1', master_item_id: 'm1', numier_article_code: 'A', sale_price: 5, quantity_factor: 1 },
    { id: 'l2', master_item_id: 'm1', numier_article_code: 'B', sale_price: 8, quantity_factor: 1 },
  ]
  it('uses one corrected cost for multiple NUMIER links and different margins', () => {
    const rows = buildMarginProducts({ links, masters, recipes: [], ingredients: [], purchaseItems: [], numierCatalog: [] })
    expect(rows).toHaveLength(2)
    expect(rows[0].cost).toBe(2)
    expect(rows[0].margin).toBe(60)
    expect(rows[1].margin).toBe(75)
  })
  it('removes excluded products from the global average without hiding them', () => {
    const rows = buildMarginProducts({ links, masters: [{ ...masters[0], excluded_from_margin: true }], recipes: [], ingredients: [], purchaseItems: [], numierCatalog: [] })
    expect(rows).toHaveLength(2)
    expect(includedMarginAverage(rows)).toBeNull()
  })
})

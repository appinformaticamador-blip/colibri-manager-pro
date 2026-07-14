import { describe, expect, it } from 'vitest'
import { calculateRecipe, convertQuantity, resolveMasterUnitCost } from './recipeCosting'
import type { MasterItem, PurchaseItem, Recipe, RecipeIngredient } from './types'

const flour: MasterItem = { id: 'flour', name: 'Harina', base_unit: 'g', waste_percent: 0 }
const invoiceItems: PurchaseItem[] = [{
  id: 'line-1',
  master_item_id: 'flour',
  quantity: 5,
  pack_units: 1,
  unit: 'kg',
  net_total: 10,
  review_status: 'confirmed',
  purchase_invoices: { invoice_date: '2026-07-01', purchase_suppliers: { name: 'Proveedor' } },
}]

describe('recipeCosting', () => {
  it('converts compatible mass and volume units', () => {
    expect(convertQuantity(1.5, 'kg', 'g')).toBe(1500)
    expect(convertQuantity(2, 'l', 'ml')).toBe(2000)
    expect(convertQuantity(1, 'kg', 'ml')).toBeNull()
  })

  it('normalizes the latest invoice cost to the master base unit', () => {
    const cost = resolveMasterUnitCost(flour, invoiceItems)
    expect(cost.unitCost).toBeCloseTo(0.002)
    expect(cost.source).toBe('invoice')
    expect(cost.supplier).toBe('Proveedor')
  })

  it('ignores invoice lines that have not been confirmed', () => {
    const pending: PurchaseItem = {
      ...invoiceItems[0],
      id: 'pending-line',
      net_total: 100,
      review_status: 'pending',
      purchase_invoices: { invoice_date: '2026-07-10' },
    }
    const cost = resolveMasterUnitCost(flour, [pending, ...invoiceItems])
    expect(cost.purchaseItemId).toBe('line-1')
    expect(cost.unitCost).toBeCloseTo(0.002)
  })

  it('uses pack units when a purchase is billed by boxes or packages', () => {
    const napkins: MasterItem = { id: 'napkins', name: 'Servilletas', base_unit: 'ud' }
    const cost = resolveMasterUnitCost(napkins, [{
      id: 'line-box',
      master_item_id: 'napkins',
      quantity: 2,
      pack_units: 100,
      unit: 'caja',
      net_total: 20,
      review_status: 'confirmed',
    }])
    expect(cost.unitCost).toBeCloseTo(0.1)
  })

  it('calculates waste, batch cost, cost per yield and target price', () => {
    const recipe: Recipe = {
      id: 'recipe-1',
      name: 'Pan',
      numier_article_code: 'PAN',
      sale_price: 4,
      yield_quantity: 2,
      target_margin_pct: 75,
      extra_cost_percent: 10,
    }
    const ingredients: RecipeIngredient[] = [{
      master_item_id: 'flour',
      quantity: 1000,
      unit: 'g',
      waste_percent: 20,
    }]
    const result = calculateRecipe(recipe, ingredients, [flour], invoiceItems)
    expect(result.ingredientCost).toBeCloseTo(2.5)
    expect(result.batchCost).toBeCloseTo(2.75)
    expect(result.costPerYield).toBeCloseTo(1.375)
    expect(result.marginPct).toBeCloseTo(65.625)
    expect(result.recommendedSalePrice).toBeCloseTo(5.5)
  })
})

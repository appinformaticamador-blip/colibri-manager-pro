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
    expect(convertQuantity(60, 'g', 'kg')).toBeCloseTo(0.06)
    expect(convertQuantity(25, 'ml', 'l')).toBeCloseTo(0.025)
    expect(convertQuantity(3, 'ud', 'unidad')).toBe(3)
    expect(convertQuantity(1, 'kg', 'ml')).toBeNull()
  })

  it('normalizes the latest invoice cost to the master base unit', () => {
    const cost = resolveMasterUnitCost(flour, invoiceItems)
    expect(cost.unitCost).toBeCloseTo(0.002)
    expect(cost.source).toBe('latest')
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

  it('prioritizes manual cost and falls back to an average when invoices have no date', () => {
    const undated = invoiceItems.map(item => ({ ...item, purchase_invoices: { purchase_suppliers: { name: 'Proveedor' } } }))
    expect(resolveMasterUnitCost(flour, undated).source).toBe('average')
    expect(resolveMasterUnitCost({ ...flour, manual_unit_cost: 0.003 }, undated).source).toBe('manual')
    expect(resolveMasterUnitCost({ ...flour, manual_unit_cost: 0.003 }, undated).unitCost).toBe(0.003)
  })

  it('does not invent a zero cost when no confirmed purchase exists', () => {
    const cost = resolveMasterUnitCost(flour, [])
    expect(cost.source).toBe('missing')
    expect(cost.unitCost).toBeNull()
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

  it('calculates nested subrecipes and rejects circular graphs', () => {
    const base: Recipe = { id: 'base', name: 'Salsa', numier_article_code: 'S', yield_quantity: 1, yield_unit: 'kg' }
    const plate: Recipe = { id: 'plate', name: 'Plato', numier_article_code: 'P', yield_quantity: 1, yield_unit: 'unidad', sale_price: 8 }
    const nested: RecipeIngredient[] = [
      { recipe_id: 'base', master_item_id: 'flour', quantity: 1000, unit: 'g' },
      { recipe_id: 'plate', subrecipe_id: 'base', quantity: 250, unit: 'g' },
    ]
    const result = calculateRecipe(plate, nested.filter(item => item.recipe_id === 'plate'), [flour], invoiceItems, 8, { recipes: [base, plate], ingredients: nested })
    expect(result.ingredientCost).toBeCloseTo(0.5)
    expect(result.complete).toBe(true)
    const circularIngredients: RecipeIngredient[] = [
      { recipe_id: 'base', subrecipe_id: 'plate', quantity: 1, unit: 'ud' },
      { recipe_id: 'plate', subrecipe_id: 'base', quantity: 1, unit: 'ud' },
    ]
    const circular = calculateRecipe(plate, circularIngredients.filter(item => item.recipe_id === 'plate'), [], [], 8, { recipes: [base, plate], ingredients: circularIngredients })
    expect(circular.circular).toBe(true)
    expect(circular.complete).toBe(false)
  })
})

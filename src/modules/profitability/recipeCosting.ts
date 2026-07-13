import type {
  CostUnit,
  IngredientCalculation,
  MasterItem,
  PurchaseItem,
  Recipe,
  RecipeCalculation,
  RecipeIngredient,
  UnitCostResolution,
} from './types'

type UnitDefinition = { dimension: 'mass' | 'volume' | 'count'; toSmallest: number }

const UNIT_DEFINITIONS: Record<CostUnit, UnitDefinition> = {
  g: { dimension: 'mass', toSmallest: 1 },
  kg: { dimension: 'mass', toSmallest: 1000 },
  ml: { dimension: 'volume', toSmallest: 1 },
  l: { dimension: 'volume', toSmallest: 1000 },
  ud: { dimension: 'count', toSmallest: 1 },
}

const UNIT_ALIASES: Record<string, CostUnit> = {
  g: 'g', gr: 'g', gramo: 'g', gramos: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  ml: 'ml', mililitro: 'ml', mililitros: 'ml',
  l: 'l', lt: 'l', litro: 'l', litros: 'l',
  ud: 'ud', uds: 'ud', u: 'ud', unidad: 'ud', unidades: 'ud',
  caja: 'ud', cajas: 'ud', paquete: 'ud', paquetes: 'ud', bolsa: 'ud', bolsas: 'ud',
}

export function normalizeCostUnit(value: unknown): CostUnit | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  return UNIT_ALIASES[normalized] ?? null
}

export function convertQuantity(quantity: number, fromValue: unknown, toValue: unknown): number | null {
  const from = normalizeCostUnit(fromValue)
  const to = normalizeCostUnit(toValue)
  if (!from || !to) return null
  const fromDefinition = UNIT_DEFINITIONS[from]
  const toDefinition = UNIT_DEFINITIONS[to]
  if (fromDefinition.dimension !== toDefinition.dimension) return null
  return Number(quantity || 0) * fromDefinition.toSmallest / toDefinition.toSmallest
}

function invoiceTimestamp(item: PurchaseItem): number {
  const value = item.purchase_invoices?.invoice_date || item.created_at || ''
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function resolveMasterUnitCost(master: MasterItem, items: PurchaseItem[]): UnitCostResolution {
  const baseUnit = normalizeCostUnit(master.base_unit)
  const manualCost = Number(master.manual_unit_cost || 0)
  if (manualCost > 0 && baseUnit) {
    return {
      unitCost: manualCost,
      baseUnit,
      source: 'manual',
      supplier: null,
      invoiceDate: null,
      purchaseItemId: null,
      message: null,
    }
  }

  if (!baseUnit) {
    return {
      unitCost: null,
      baseUnit: null,
      source: 'incompatible',
      supplier: null,
      invoiceDate: null,
      purchaseItemId: null,
      message: `La unidad base “${master.base_unit || '-'}” no es compatible con escandallos.`,
    }
  }

  const candidates = items
    .filter((item) => (
      String(item.master_item_id) === String(master.id)
      && item.review_status === 'confirmed'
      && Number(item.net_total || 0) > 0
    ))
    .sort((a, b) => invoiceTimestamp(b) - invoiceTimestamp(a))

  for (const item of candidates) {
    const billedQuantity = Math.max(0, Number(item.quantity || 0))
    const packUnits = Math.max(1, Number(item.pack_units || 1))
    const baseQuantity = convertQuantity(billedQuantity * packUnits, item.unit || baseUnit, baseUnit)
    if (!baseQuantity || baseQuantity <= 0) continue
    return {
      unitCost: Number(item.net_total || 0) / baseQuantity,
      baseUnit,
      source: 'invoice',
      supplier: item.purchase_invoices?.purchase_suppliers?.name || null,
      invoiceDate: item.purchase_invoices?.invoice_date || null,
      purchaseItemId: item.id,
      message: null,
    }
  }

  const hasPurchases = candidates.length > 0
  return {
    unitCost: null,
    baseUnit,
    source: hasPurchases ? 'incompatible' : 'missing',
    supplier: null,
    invoiceDate: null,
    purchaseItemId: null,
    message: hasPurchases
      ? 'Las compras existentes usan una unidad incompatible. Configura un coste manual normalizado.'
      : 'No existe una compra confirmada ni un coste manual para este ingrediente.',
  }
}

export function calculateIngredient(
  ingredient: RecipeIngredient,
  masters: MasterItem[],
  purchaseItems: PurchaseItem[],
): IngredientCalculation {
  const master = masters.find((item) => String(item.id) === String(ingredient.master_item_id)) || null
  if (!master) {
    return {
      ingredient,
      master: null,
      requestedBaseQuantity: null,
      effectiveBaseQuantity: null,
      cost: null,
      unitCost: {
        unitCost: null,
        baseUnit: null,
        source: 'missing',
        supplier: null,
        invoiceDate: null,
        purchaseItemId: null,
        message: 'El ingrediente ya no existe en el catálogo maestro.',
      },
      warning: 'Ingrediente sin artículo maestro.',
    }
  }

  const unitCost = resolveMasterUnitCost(master, purchaseItems)
  const requestedBaseQuantity = convertQuantity(
    Number(ingredient.quantity || 0),
    ingredient.unit,
    unitCost.baseUnit || master.base_unit,
  )
  if (requestedBaseQuantity === null) {
    return {
      ingredient,
      master,
      requestedBaseQuantity: null,
      effectiveBaseQuantity: null,
      cost: null,
      unitCost,
      warning: `No se puede convertir ${ingredient.unit} a ${master.base_unit || '-'}.`,
    }
  }

  const wastePercent = Math.min(95, Math.max(0, Number(ingredient.waste_percent ?? master.waste_percent ?? 0)))
  const effectiveBaseQuantity = requestedBaseQuantity / (1 - wastePercent / 100)
  const cost = unitCost.unitCost === null ? null : effectiveBaseQuantity * unitCost.unitCost
  return {
    ingredient,
    master,
    requestedBaseQuantity,
    effectiveBaseQuantity,
    cost,
    unitCost,
    warning: unitCost.message,
  }
}

export function calculateRecipe(
  recipe: Recipe,
  ingredients: RecipeIngredient[],
  masters: MasterItem[],
  purchaseItems: PurchaseItem[],
  numierSalePrice = 0,
): RecipeCalculation {
  const ingredientCalculations = ingredients.map((ingredient) => calculateIngredient(ingredient, masters, purchaseItems))
  const ingredientCost = ingredientCalculations.reduce((total, item) => total + Number(item.cost || 0), 0)
  const extraCost = ingredientCost * Math.max(0, Number(recipe.extra_cost_percent || 0)) / 100
  const batchCost = ingredientCost + extraCost
  const yieldQuantity = Math.max(0.000001, Number(recipe.yield_quantity || 1))
  const costPerYield = batchCost / yieldQuantity
  const salePrice = Math.max(0, Number(recipe.sale_price || numierSalePrice || 0))
  const profitPerYield = salePrice - costPerYield
  const marginPct = salePrice > 0 ? profitPerYield / salePrice * 100 : 0
  const targetMargin = Math.min(95, Math.max(0, Number(recipe.target_margin_pct || 65)))
  const recommendedSalePrice = costPerYield > 0 ? costPerYield / (1 - targetMargin / 100) : 0
  const warnings = ingredientCalculations.flatMap((item) => item.warning ? [`${item.master?.name || 'Ingrediente'}: ${item.warning}`] : [])
  if (!ingredients.length) warnings.push('El escandallo no contiene ingredientes.')
  if (!salePrice) warnings.push('No hay PVP disponible en NUMIER ni configurado manualmente.')

  return {
    ingredients: ingredientCalculations,
    ingredientCost,
    extraCost,
    batchCost,
    costPerYield,
    salePrice,
    profitPerYield,
    marginPct,
    recommendedSalePrice,
    warnings,
  }
}

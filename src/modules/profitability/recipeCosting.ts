import type {
  CostHistoryEntry,
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
type RecipeContext = { recipes: Recipe[]; ingredients: RecipeIngredient[]; visited?: Set<string> }

const UNIT_DEFINITIONS: Record<CostUnit, UnitDefinition> = {
  g: { dimension: 'mass', toSmallest: 1 }, kg: { dimension: 'mass', toSmallest: 1000 },
  ml: { dimension: 'volume', toSmallest: 1 }, l: { dimension: 'volume', toSmallest: 1000 },
  ud: { dimension: 'count', toSmallest: 1 },
}
const UNIT_ALIASES: Record<string, CostUnit> = {
  g: 'g', gr: 'g', gramo: 'g', gramos: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  ml: 'ml', mililitro: 'ml', mililitros: 'ml', l: 'l', lt: 'l', litro: 'l', litros: 'l',
  ud: 'ud', uds: 'ud', u: 'ud', unidad: 'ud', unidades: 'ud', racion: 'ud', 'ración': 'ud', raciones: 'ud', caja: 'ud', cajas: 'ud', paquete: 'ud', paquetes: 'ud', bolsa: 'ud', bolsas: 'ud',
}

export function normalizeCostUnit(value: unknown): CostUnit | null {
  return UNIT_ALIASES[String(value ?? '').trim().toLowerCase()] ?? null
}

export function convertQuantity(quantity: number, fromValue: unknown, toValue: unknown): number | null {
  const from = normalizeCostUnit(fromValue), to = normalizeCostUnit(toValue)
  if (!from || !to || UNIT_DEFINITIONS[from].dimension !== UNIT_DEFINITIONS[to].dimension) return null
  return Number(quantity || 0) * UNIT_DEFINITIONS[from].toSmallest / UNIT_DEFINITIONS[to].toSmallest
}

function invoiceTimestamp(item: PurchaseItem): number {
  const timestamp = Date.parse(item.purchase_invoices?.invoice_date || item.created_at || '')
  return Number.isFinite(timestamp) ? timestamp : 0
}

function normalizedPurchaseCost(item: PurchaseItem, baseUnit: CostUnit): number | null {
  const billedQuantity = Math.max(0, Number(item.quantity || 0))
  const packUnits = Math.max(1, Number(item.pack_units || 1))
  const baseQuantity = convertQuantity(billedQuantity * packUnits, item.unit || baseUnit, baseUnit)
  return baseQuantity && baseQuantity > 0 ? Number(item.net_total || 0) / baseQuantity : null
}

export function resolveMasterUnitCost(master: MasterItem, items: PurchaseItem[]): UnitCostResolution {
  const baseUnit = normalizeCostUnit(master.base_unit)
  const empty = (source: UnitCostResolution['source'], message: string): UnitCostResolution => ({
    unitCost: null, latestCost: null, averageCost: null, baseUnit, source,
    supplier: null, invoiceDate: null, invoiceNumber: null, purchaseItemId: null, history: [], message,
  })
  if (!baseUnit) return empty('incompatible', `La unidad base “${master.base_unit || '-'}” no es compatible con escandallos.`)

  const confirmed = items
    .filter(item => String(item.master_item_id) === String(master.id) && item.review_status === 'confirmed' && Number(item.net_total || 0) > 0)
    .sort((a, b) => invoiceTimestamp(b) - invoiceTimestamp(a))
  const history: CostHistoryEntry[] = confirmed.flatMap(item => {
    const unitCost = normalizedPurchaseCost(item, baseUnit)
    return unitCost === null ? [] : [{
      purchaseItemId: item.id, unitCost,
      supplier: item.purchase_invoices?.purchase_suppliers?.name || null,
      invoiceDate: item.purchase_invoices?.invoice_date || null,
      invoiceNumber: item.purchase_invoices?.invoice_number || null,
    }]
  })
  const datedLatest = history.find(entry => Boolean(entry.invoiceDate)) || null
  const averageCost = history.length ? history.reduce((total, entry) => total + entry.unitCost, 0) / history.length : null
  const manualCost = Number(master.manual_unit_cost || 0)
  if (manualCost > 0) return {
    unitCost: manualCost, latestCost: datedLatest?.unitCost ?? null, averageCost, baseUnit, source: 'manual',
    supplier: datedLatest?.supplier ?? null, invoiceDate: datedLatest?.invoiceDate ?? null,
    invoiceNumber: datedLatest?.invoiceNumber ?? null, purchaseItemId: datedLatest?.purchaseItemId ?? null, history, message: null,
  }
  if (datedLatest) return {
    unitCost: datedLatest.unitCost, latestCost: datedLatest.unitCost, averageCost, baseUnit, source: 'latest',
    supplier: datedLatest.supplier, invoiceDate: datedLatest.invoiceDate, invoiceNumber: datedLatest.invoiceNumber,
    purchaseItemId: datedLatest.purchaseItemId, history, message: null,
  }
  if (averageCost !== null) return {
    unitCost: averageCost, latestCost: null, averageCost, baseUnit, source: 'average', supplier: null,
    invoiceDate: null, invoiceNumber: null, purchaseItemId: null, history, message: null,
  }
  return empty(confirmed.length ? 'incompatible' : 'missing', confirmed.length
    ? 'Las compras confirmadas usan unidades incompatibles. Corrige la unidad base o configura un coste manual.'
    : 'No existe una compra confirmada ni un coste manual para este ingrediente.')
}

export function calculateIngredient(ingredient: RecipeIngredient, masters: MasterItem[], purchaseItems: PurchaseItem[]): IngredientCalculation {
  const master = masters.find(item => String(item.id) === String(ingredient.master_item_id)) || null
  if (!master) return {
    ingredient, master: null, subrecipe: null, requestedBaseQuantity: null, effectiveBaseQuantity: null, cost: null,
    unitCost: { unitCost: null, latestCost: null, averageCost: null, baseUnit: null, source: 'missing', supplier: null, invoiceDate: null, invoiceNumber: null, purchaseItemId: null, history: [], message: 'La materia prima no existe.' },
    warning: 'Ingrediente sin artículo maestro.',
  }
  const unitCost = resolveMasterUnitCost(master, purchaseItems)
  const requestedBaseQuantity = convertQuantity(Number(ingredient.quantity || 0), ingredient.unit, unitCost.baseUnit || master.base_unit)
  if (requestedBaseQuantity === null) return { ingredient, master, subrecipe: null, requestedBaseQuantity: null, effectiveBaseQuantity: null, cost: null, unitCost, warning: `No se puede convertir ${ingredient.unit} a ${master.base_unit || '-'}.` }
  const waste = Math.min(95, Math.max(0, Number(ingredient.waste_percent ?? master.waste_percent ?? 0)))
  const effectiveBaseQuantity = requestedBaseQuantity / (1 - waste / 100)
  return { ingredient, master, subrecipe: null, requestedBaseQuantity, effectiveBaseQuantity, cost: unitCost.unitCost === null ? null : effectiveBaseQuantity * unitCost.unitCost, unitCost, warning: unitCost.message }
}

function missingSubrecipeCalculation(ingredient: RecipeIngredient, warning: string, subrecipe: Recipe | null = null): IngredientCalculation {
  return {
    ingredient, master: null, subrecipe, requestedBaseQuantity: Number(ingredient.quantity || 0), effectiveBaseQuantity: null, cost: null,
    unitCost: { unitCost: null, latestCost: null, averageCost: null, baseUnit: 'ud', source: 'missing', supplier: null, invoiceDate: null, invoiceNumber: null, purchaseItemId: null, history: [], message: warning }, warning,
  }
}

export function calculateRecipe(
  recipe: Recipe,
  ingredients: RecipeIngredient[],
  masters: MasterItem[],
  purchaseItems: PurchaseItem[],
  numierSalePrice = 0,
  context?: RecipeContext,
): RecipeCalculation {
  const visited = new Set(context?.visited || [])
  const circular = visited.has(String(recipe.id))
  if (circular) return { ingredients: [], ingredientCost: 0, extraCost: 0, fixedCost: 0, batchCost: 0, costPerYield: 0, effectiveCost: null, salePrice: Number(numierSalePrice || recipe.sale_price || 0), profitPerYield: null, marginPct: null, marginOnCostPct: null, recommendedSalePrice: 0, complete: false, circular: true, warnings: [`Referencia circular detectada en ${recipe.name}.`] }
  visited.add(String(recipe.id))

  const ingredientCalculations = ingredients.map(ingredient => {
    if (!ingredient.subrecipe_id) return calculateIngredient(ingredient, masters, purchaseItems)
    const subrecipe = context?.recipes.find(candidate => String(candidate.id) === String(ingredient.subrecipe_id)) || null
    if (!subrecipe) return missingSubrecipeCalculation(ingredient, 'La subreceta ya no existe.')
    const subIngredients = context?.ingredients.filter(item => String(item.recipe_id) === String(subrecipe.id)) || []
    const subCalculation = calculateRecipe(subrecipe, subIngredients, masters, purchaseItems, 0, { recipes: context?.recipes || [], ingredients: context?.ingredients || [], visited })
    if (!subCalculation.complete || subCalculation.effectiveCost === null) return missingSubrecipeCalculation(ingredient, subCalculation.circular ? 'Referencia circular entre subrecetas.' : `La subreceta “${subrecipe.name}” está incompleta.`, subrecipe)
    const subrecipeUnit = normalizeCostUnit(subrecipe.yield_unit || 'ud') || 'ud'
    const requestedQuantity = convertQuantity(Number(ingredient.quantity || 0), ingredient.unit, subrecipeUnit)
    if (requestedQuantity === null) return missingSubrecipeCalculation(ingredient, `No se puede convertir ${ingredient.unit} a ${subrecipe.yield_unit || 'ud'}.`, subrecipe)
    const waste = Math.min(95, Math.max(0, Number(ingredient.waste_percent || 0)))
    const effectiveQuantity = requestedQuantity / (1 - waste / 100)
    const cost = subCalculation.effectiveCost * effectiveQuantity
    return {
      ingredient, master: null, subrecipe, requestedBaseQuantity: requestedQuantity, effectiveBaseQuantity: effectiveQuantity, cost,
      unitCost: { unitCost: subCalculation.effectiveCost, latestCost: subCalculation.effectiveCost, averageCost: null, baseUnit: subrecipeUnit, source: 'latest' as const, supplier: null, invoiceDate: subrecipe.published_at || null, invoiceNumber: `Versión ${subrecipe.version || 1}`, purchaseItemId: null, history: [], message: null }, warning: null,
    }
  })
  const warnings = ingredientCalculations.flatMap(item => item.warning ? [`${item.master?.name || item.subrecipe?.name || 'Ingrediente'}: ${item.warning}`] : [])
  if (!ingredients.length) warnings.push('El escandallo no contiene ingredientes.')
  const complete = ingredients.length > 0 && ingredientCalculations.every(item => item.cost !== null) && !warnings.some(warning => warning.includes('circular'))
  const ingredientCost = ingredientCalculations.reduce((total, item) => total + Number(item.cost || 0), 0)
  const fixedCost = Math.max(0, Number(recipe.fixed_cost || 0))
  const extraCost = ingredientCost * Math.max(0, Number(recipe.extra_cost_percent || 0)) / 100
  const batchCost = ingredientCost + extraCost + fixedCost
  const yieldQuantity = Math.max(0.000001, Number(recipe.yield_quantity || 1))
  const costPerYield = batchCost / yieldQuantity
  const manualCost = Number(recipe.manual_cost || 0)
  const effectiveCost = manualCost > 0 ? manualCost : complete ? costPerYield : null
  const salePrice = Math.max(0, Number(numierSalePrice || recipe.sale_price || 0))
  const profit = effectiveCost !== null && salePrice > 0 ? salePrice - effectiveCost : null
  const marginPct = profit !== null ? profit / salePrice * 100 : null
  const marginOnCostPct = profit !== null && effectiveCost !== null && effectiveCost > 0 ? profit / effectiveCost * 100 : null
  const targetMargin = Math.min(95, Math.max(0, Number(recipe.target_margin_pct || 65)))
  const recommendedSalePrice = effectiveCost !== null ? effectiveCost / (1 - targetMargin / 100) : 0
  if (!salePrice) warnings.push('No hay PVP disponible en NUMIER ni configurado manualmente.')
  return { ingredients: ingredientCalculations, ingredientCost, extraCost, fixedCost, batchCost, costPerYield, effectiveCost, salePrice, profitPerYield: profit, marginPct, marginOnCostPct, recommendedSalePrice, complete, circular: warnings.some(warning => warning.toLowerCase().includes('circular')), warnings }
}

export function wouldCreateCircularReference(recipeId: string | undefined, candidateId: string, ingredients: RecipeIngredient[]): boolean {
  if (!recipeId) return false
  if (String(recipeId) === String(candidateId)) return true
  const graph = new Map<string, string[]>()
  ingredients.filter(item => item.recipe_id && item.subrecipe_id).forEach(item => {
    const key = String(item.recipe_id); graph.set(key, [...(graph.get(key) || []), String(item.subrecipe_id)])
  })
  const stack = [String(candidateId)], seen = new Set<string>()
  while (stack.length) {
    const current = stack.pop()!; if (current === String(recipeId)) return true; if (seen.has(current)) continue; seen.add(current); stack.push(...(graph.get(current) || []))
  }
  return false
}

export function findAffectedRecipeIds(masterItemId: string, recipes: Recipe[], ingredients: RecipeIngredient[]): string[] {
  const affected = new Set(ingredients.filter(item => String(item.master_item_id) === String(masterItemId)).map(item => String(item.recipe_id)))
  let changed = true
  while (changed) {
    changed = false
    for (const item of ingredients.filter(item => item.subrecipe_id && item.recipe_id)) {
      if (affected.has(String(item.subrecipe_id)) && !affected.has(String(item.recipe_id))) { affected.add(String(item.recipe_id)); changed = true }
    }
  }
  return recipes.filter(recipe => affected.has(String(recipe.id))).map(recipe => recipe.id)
}

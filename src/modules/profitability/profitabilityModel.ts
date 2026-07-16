import { resolveLinkSalePrice } from './numierPricing'
import { calculateRecipe, findAffectedRecipeIds, resolveMasterUnitCost } from './recipeCosting'
import type { MasterItem, NumierArticle, NumierLink, PurchaseItem, Recipe, RecipeCalculation, RecipeIngredient, UnitCostResolution } from './types'

export interface MarginProduct {
  id: string
  entityType: 'master_item' | 'recipe'
  entityId: string
  productName: string
  articleName: string
  articleCode: string
  linkedArticles: NumierLink[]
  cost: number | null
  automaticCost: number | null
  sale: number | null
  profit: number | null
  margin: number | null
  marginOnCost: number | null
  excluded: boolean
  corrected: boolean
  complete: boolean
  costResolution: UnitCostResolution | null
  recipeCalculation: RecipeCalculation | null
  affectedRecipeIds: string[]
  source: MasterItem | Recipe
}

interface BuildMarginProductsInput {
  links: NumierLink[]
  masters: MasterItem[]
  recipes: Recipe[]
  ingredients: RecipeIngredient[]
  purchaseItems: PurchaseItem[]
  numierCatalog: NumierArticle[]
}

function metrics(cost: number | null, sale: number | null) {
  if (cost === null || sale === null || sale <= 0) return { profit: null, margin: null, marginOnCost: null }
  const profit = sale - cost
  return { profit, margin: profit / sale * 100, marginOnCost: cost > 0 ? profit / cost * 100 : null }
}

export function buildMarginProducts({ links, masters, recipes, ingredients, purchaseItems, numierCatalog }: BuildMarginProductsInput): MarginProduct[] {
  const direct = links.flatMap(link => {
    const master = masters.find(item => String(item.id) === String(link.master_item_id))
    if (!master) return []
    const resolution = resolveMasterUnitCost(master, purchaseItems)
    const factor = Math.max(0, Number(link.quantity_factor || 1))
    const cost = resolution.unitCost === null ? null : resolution.unitCost * factor
    const automaticUnit = resolution.source === 'manual' ? resolution.latestCost ?? resolution.averageCost : resolution.unitCost
    const automaticCost = automaticUnit === null ? null : automaticUnit * factor
    const article = numierCatalog.find(item => String(item.article_code) === String(link.numier_article_code))
    const resolvedSale = resolveLinkSalePrice(article, link.sale_price)
    const sale = resolvedSale > 0 ? resolvedSale : null
    return [{
      id: `master:${master.id}:${link.id}`, entityType: 'master_item' as const, entityId: master.id,
      productName: master.name, articleName: link.numier_article_name || article?.article_name || link.numier_article_code,
      articleCode: link.numier_article_code, linkedArticles: links.filter(item => String(item.master_item_id) === String(master.id)),
      cost, automaticCost, sale, ...metrics(cost, sale), excluded: Boolean(master.excluded_from_margin),
      corrected: Number(master.manual_unit_cost || 0) > 0, complete: cost !== null && sale !== null,
      costResolution: resolution, recipeCalculation: null,
      affectedRecipeIds: findAffectedRecipeIds(master.id, recipes, ingredients), source: master,
    }]
  })

  const recipeRows = recipes.filter(recipe => recipe.active !== false).map(recipe => {
    const recipeIngredients = ingredients.filter(item => String(item.recipe_id) === String(recipe.id))
    const article = numierCatalog.find(item => String(item.article_code) === String(recipe.numier_article_code))
    const calculation = calculateRecipe(recipe, recipeIngredients, masters, purchaseItems, Number(article?.sale_price || 0), { recipes, ingredients })
    const automaticCost = calculation.complete ? calculation.costPerYield : null
    const cost = calculation.effectiveCost
    const sale = calculation.salePrice > 0 ? calculation.salePrice : null
    return {
      id: `recipe:${recipe.id}`, entityType: 'recipe' as const, entityId: recipe.id, productName: recipe.name,
      articleName: recipe.numier_article_name || article?.article_name || recipe.numier_article_code,
      articleCode: recipe.numier_article_code, linkedArticles: [], cost, automaticCost, sale, ...metrics(cost, sale),
      excluded: Boolean(recipe.excluded_from_margin), corrected: Number(recipe.manual_cost || 0) > 0,
      complete: calculation.complete && cost !== null && sale !== null, costResolution: null,
      recipeCalculation: calculation, affectedRecipeIds: [], source: recipe,
    }
  })
  return [...direct, ...recipeRows]
}

export function includedMarginAverage(rows: MarginProduct[]): number | null {
  const values = rows.filter(row => !row.excluded && row.margin !== null).map(row => Number(row.margin))
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null
}

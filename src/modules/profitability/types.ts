export type CostUnit = 'g' | 'kg' | 'ml' | 'l' | 'ud'

export interface PurchaseSupplier {
  name?: string | null
}

export interface PurchaseInvoiceRelation {
  invoice_date?: string | null
  purchase_suppliers?: PurchaseSupplier | null
}

export interface PurchaseItem {
  id: string
  master_item_id?: string | null
  quantity?: number | null
  pack_units?: number | null
  unit?: string | null
  net_total?: number | null
  unit_cost?: number | null
  review_status?: string | null
  created_at?: string | null
  purchase_invoices?: PurchaseInvoiceRelation | null
}

export interface MasterItem {
  id: string
  name: string
  base_unit?: string | null
  waste_percent?: number | null
  manual_unit_cost?: number | null
  usage_type?: string | null
  active?: boolean | null
}

export interface NumierArticle {
  article_code: string | number
  article_name?: string | null
  family?: string | null
  category_name?: string | null
  sale_price?: number | null
}

export interface Recipe {
  id: string
  name: string
  numier_article_code: string
  numier_article_name?: string | null
  sale_price?: number | null
  yield_quantity?: number | null
  yield_unit?: string | null
  category?: string | null
  notes?: string | null
  target_margin_pct?: number | null
  extra_cost_percent?: number | null
  active?: boolean | null
  version?: number | null
  updated_at?: string | null
}

export interface RecipeIngredient {
  id?: string
  recipe_id?: string
  master_item_id: string
  quantity: number
  unit: CostUnit
  waste_percent?: number | null
  notes?: string | null
  position?: number | null
}

export interface UnitCostResolution {
  unitCost: number | null
  baseUnit: CostUnit | null
  source: 'manual' | 'invoice' | 'missing' | 'incompatible'
  supplier: string | null
  invoiceDate: string | null
  purchaseItemId: string | null
  message: string | null
}

export interface IngredientCalculation {
  ingredient: RecipeIngredient
  master: MasterItem | null
  requestedBaseQuantity: number | null
  effectiveBaseQuantity: number | null
  cost: number | null
  unitCost: UnitCostResolution
  warning: string | null
}

export interface RecipeCalculation {
  ingredients: IngredientCalculation[]
  ingredientCost: number
  extraCost: number
  batchCost: number
  costPerYield: number
  salePrice: number
  profitPerYield: number
  marginPct: number
  recommendedSalePrice: number
  warnings: string[]
}

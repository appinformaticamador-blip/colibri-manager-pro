export type CostUnit = 'g' | 'kg' | 'ml' | 'l' | 'ud'
export type CostSource = 'manual' | 'latest' | 'average' | 'missing' | 'incompatible'

export interface PurchaseSupplier { id?: string | null; name?: string | null }

export interface PurchaseInvoiceRelation {
  id?: string | null
  invoice_number?: string | null
  invoice_date?: string | null
  total?: number | null
  purchase_suppliers?: PurchaseSupplier | null
}

export interface PurchaseItem {
  id: string
  master_item_id?: string | null
  product_name?: string | null
  quantity?: number | null
  pack_units?: number | null
  unit?: string | null
  net_total?: number | null
  unit_cost?: number | null
  review_status?: string | null
  created_at?: string | null
  purchase_invoices?: PurchaseInvoiceRelation | null
}

export interface CostHistoryEntry {
  purchaseItemId: string
  unitCost: number
  supplier: string | null
  invoiceDate: string | null
  invoiceNumber: string | null
}

export interface MarginControlFields {
  excluded_from_margin?: boolean | null
  excluded_reason?: string | null
  excluded_at?: string | null
  excluded_by?: string | null
}

export interface MasterItem extends MarginControlFields {
  id: string
  name: string
  category?: string | null
  base_unit?: string | null
  waste_percent?: number | null
  manual_unit_cost?: number | null
  manual_unit_cost_reason?: string | null
  manual_unit_cost_updated_at?: string | null
  manual_unit_cost_updated_by?: string | null
  usage_type?: string | null
  active?: boolean | null
}

export interface NumierArticle {
  [key: string]: unknown
  article_code: string | number
  article_name?: string | null
  family?: string | null
  category_name?: string | null
  price?: number | null
  sale_price?: number | null
  price_source?: 'catalog' | 'last_sale' | 'manual' | null
  price_checked?: boolean
  price_loading?: boolean
  price_error?: boolean
  sales_quantity?: number
}

export interface Recipe extends MarginControlFields {
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
  fixed_cost?: number | null
  manual_cost?: number | null
  manual_cost_reason?: string | null
  manual_cost_updated_at?: string | null
  manual_cost_updated_by?: string | null
  status?: 'draft' | 'published' | null
  draft_payload?: Record<string, unknown> | null
  draft_ingredients?: RecipeIngredient[] | null
  draft_updated_at?: string | null
  draft_updated_by?: string | null
  published_at?: string | null
  published_by?: string | null
  active?: boolean | null
  version?: number | null
  updated_at?: string | null
}

export interface RecipeIngredient {
  id?: string
  recipe_id?: string
  master_item_id?: string | null
  subrecipe_id?: string | null
  quantity: number
  unit: CostUnit
  waste_percent?: number | null
  notes?: string | null
  position?: number | null
  _search?: string
}

export interface RecipeVersion {
  id: string
  recipe_id: string
  version: number
  snapshot: { recipe?: Recipe; ingredients?: RecipeIngredient[]; restored_from_version?: number }
  published_by?: string | null
  cost_total?: number | null
  margin_pct?: number | null
  sale_price?: number | null
  created_at: string
}

export interface UnitCostResolution {
  unitCost: number | null
  latestCost: number | null
  averageCost: number | null
  baseUnit: CostUnit | null
  source: CostSource
  supplier: string | null
  invoiceDate: string | null
  invoiceNumber: string | null
  purchaseItemId: string | null
  history: CostHistoryEntry[]
  message: string | null
}

export interface IngredientCalculation {
  ingredient: RecipeIngredient
  master: MasterItem | null
  subrecipe: Recipe | null
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
  fixedCost: number
  batchCost: number
  costPerYield: number
  effectiveCost: number | null
  salePrice: number
  profitPerYield: number | null
  marginPct: number | null
  marginOnCostPct: number | null
  recommendedSalePrice: number
  complete: boolean
  circular: boolean
  warnings: string[]
}

export interface NumierLink {
  id: string
  master_item_id: string
  numier_article_code: string
  numier_article_name?: string | null
  sale_price?: number | null
  quantity_factor?: number | null
  is_primary?: boolean | null
}

export interface ArticleManualCost {
  article_code: string
  manual_unit_cost?: number | null
  reason?: string | null
  updated_at?: string | null
  updated_by?: string | null
  excluded_from_margin?: boolean | null
}

export interface CostControlEvent {
  id: string
  entity_type: 'master_item' | 'recipe' | 'numier_article'
  entity_id: string
  event_type: string
  previous_cost?: number | null
  new_cost?: number | null
  reason: string
  actor: string
  created_at: string
}

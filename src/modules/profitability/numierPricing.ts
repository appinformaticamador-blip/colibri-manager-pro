export type NumierPriceSource = 'catalog' | 'last_sale' | 'manual' | null

export interface NumierCatalogRow {
  article_code: string | number
  article_name?: string | null
  price?: number | null
  sale_price?: number | null
  price_source?: NumierPriceSource
  price_checked?: boolean
  price_loading?: boolean
  price_error?: boolean
  sales_quantity?: number
  [key: string]: unknown
}

export interface NumierTicketLine {
  articulo?: string | number | null
  descripcion?: string | null
  precio?: number | null
  importe?: number | null
  cantidad?: number | null
  cab_id?: string | number | null
  line_key?: string | null
}

export interface MarginValues {
  cost: number
  sale: number
  profit: number
  margin: number
}

export function positiveNumber(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

export function numierTicketLinePrice(line: NumierTicketLine | null | undefined): number | null {
  const directPrice = positiveNumber(line?.precio)
  if (directPrice !== null) return directPrice
  const total = positiveNumber(line?.importe)
  const quantity = Math.abs(Number(line?.cantidad || 0))
  return total !== null && quantity > 0 ? total / quantity : null
}

export function latestSalePrices(lines: NumierTicketLine[]): Map<string, number> {
  const prices = new Map<string, number>()
  for (const line of lines) {
    const code = String(line.articulo || '').trim()
    if (!code || prices.has(code)) continue
    const price = numierTicketLinePrice(line)
    if (price !== null) prices.set(code, price)
  }
  return prices
}

export function buildNumierCatalog(
  articles: NumierCatalogRow[],
  recentLines: NumierTicketLine[],
): NumierCatalogRow[] {
  const historicalPrices = latestSalePrices(recentLines)
  const salesQuantities = recentLines.reduce((totals, line) => {
    const code = String(line.articulo || '').trim()
    if (code) totals.set(code, (totals.get(code) || 0) + Math.abs(Number(line.cantidad || 0)))
    return totals
  }, new Map<string, number>())
  return articles.map((article) => {
    const code = String(article.article_code || '').trim()
    const catalogPrice = positiveNumber(article.price)
    const lastSalePrice = historicalPrices.get(code) || null
    const salePrice = catalogPrice || lastSalePrice
    return {
      ...article,
      article_code: code,
      sale_price: salePrice,
      price_source: catalogPrice ? 'catalog' : lastSalePrice ? 'last_sale' : null,
      price_checked: Boolean(salePrice),
      price_loading: false,
      price_error: false,
      sales_quantity: salesQuantities.get(code) || 0,
    }
  })
}

export function mergeResolvedNumierPrice(
  article: NumierCatalogRow,
  line: NumierTicketLine | null,
  hasError = false,
): NumierCatalogRow {
  const price = numierTicketLinePrice(line)
  return {
    ...article,
    sale_price: price,
    price_source: price ? 'last_sale' : null,
    price_checked: true,
    price_loading: false,
    price_error: hasError,
  }
}

export function resolveLinkSalePrice(article: NumierCatalogRow | undefined, manualFallback: unknown): number {
  return positiveNumber(article?.sale_price) || positiveNumber(manualFallback) || 0
}

export function numierPriceText(article: NumierCatalogRow | undefined): string {
  if (article?.price_loading) return 'Consultando precio en NUMIER…'
  if (article?.price_error) return 'No se pudo comprobar el precio en NUMIER'
  const price = positiveNumber(article?.sale_price)
  if (price === null) return 'Precio no disponible en NUMIER'
  const source = article?.price_source === 'catalog' ? 'Catálogo NUMIER' : 'Última venta NUMIER'
  return `${source} · ${price.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`
}

export function calculateMarginValues(costValue: unknown, saleValue: unknown): MarginValues {
  const cost = Math.max(0, Number(costValue || 0))
  const sale = Math.max(0, Number(saleValue || 0))
  const profit = sale - cost
  const margin = sale > 0 ? profit / sale * 100 : 0
  return { cost, sale, profit, margin }
}

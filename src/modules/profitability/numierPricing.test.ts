import { describe, expect, it } from 'vitest'
import {
  buildNumierCatalog,
  calculateMarginValues,
  numierPriceText,
  resolveLinkSalePrice,
} from './numierPricing'

describe('numierPricing', () => {
  it('recovers PROMO 00432 from the real NUMIER ticket-line columns', () => {
    const [promo] = buildNumierCatalog(
      [{ article_code: '00432', article_name: 'PROMO', price: 0 }],
      [{ articulo: '00432', descripcion: 'PROMO', cantidad: 4, precio: 1.3, importe: 5.2, cab_id: 235443 }],
    )
    expect(promo.sale_price).toBe(1.3)
    expect(promo.price_source).toBe('last_sale')
    expect(numierPriceText(promo)).toContain('1,30')
  })

  it('prioritizes a real catalog price over historical sales', () => {
    const [article] = buildNumierCatalog(
      [{ article_code: 'A', article_name: 'Artículo', price: 6 }],
      [{ articulo: 'A', precio: 5 }],
    )
    expect(article.sale_price).toBe(6)
    expect(article.price_source).toBe('catalog')
  })

  it('shows unavailable instead of formatting a false zero price', () => {
    const [article] = buildNumierCatalog(
      [{ article_code: 'SIN-PVP', article_name: 'Sin precio', price: 0 }],
      [],
    )
    expect(article.sale_price).toBeNull()
    expect(numierPriceText(article)).toBe('Precio no disponible en NUMIER')
  })

  it('keeps the manual value only as fallback when NUMIER has no price', () => {
    expect(resolveLinkSalePrice({ article_code: 'A', sale_price: 8.5 }, 7)).toBe(8.5)
    expect(resolveLinkSalePrice({ article_code: 'B', sale_price: null }, 7)).toBe(7)
  })

  it('supports two links with different real prices and recalculates their margins', () => {
    const catalog = buildNumierCatalog(
      [
        { article_code: 'A', price: 0 },
        { article_code: 'B', price: 0 },
      ],
      [
        { articulo: 'A', precio: 3.3 },
        { articulo: 'B', precio: 1.5 },
      ],
    )
    const first = calculateMarginValues(1, resolveLinkSalePrice(catalog[0], null))
    const second = calculateMarginValues(1, resolveLinkSalePrice(catalog[1], null))
    expect(first).toMatchObject({ sale: 3.3, profit: 2.3 })
    expect(first.margin).toBeCloseTo(69.6969)
    expect(second).toMatchObject({ sale: 1.5, profit: 0.5 })
    expect(second.margin).toBeCloseTo(33.3333)
  })
})

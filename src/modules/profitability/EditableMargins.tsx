import { useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildMarginProducts, includedMarginAverage, type MarginProduct } from './profitabilityModel'
import type { ArticleManualCost, CostControlEvent, MasterItem, NumierArticle, NumierLink, PurchaseItem, Recipe, RecipeIngredient } from './types'

interface Props {
  supabase: SupabaseClient | null
  links: NumierLink[]
  masterItems: MasterItem[]
  recipes: Recipe[]
  recipeIngredients: RecipeIngredient[]
  purchaseItems: PurchaseItem[]
  numierCatalog: NumierArticle[]
  articleCosts: ArticleManualCost[]
  onRefresh: (showLoading?: boolean) => Promise<void>
  currentUser?: string
}
type Filter = 'all' | 'included' | 'excluded' | 'corrected' | 'critical' | 'no_pvp'
const money = (value: number | null | undefined) => value === null || value === undefined ? 'No disponible' : value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('es-ES') : '—'

export default function EditableMargins({ supabase, links, masterItems, recipes, recipeIngredients, purchaseItems, numierCatalog, articleCosts, onRefresh, currentUser = 'Alfonso' }: Props) {
  const [filter, setFilter] = useState<Filter>('included')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<MarginProduct | null>(null)
  const [manualCost, setManualCost] = useState('')
  const [reason, setReason] = useState('')
  const [events, setEvents] = useState<CostControlEvent[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const rows = useMemo(() => buildMarginProducts({ links, masters: masterItems, recipes, ingredients: recipeIngredients, purchaseItems, numierCatalog, articleCosts }), [links, masterItems, numierCatalog, articleCosts, purchaseItems, recipeIngredients, recipes])
  const average = includedMarginAverage(rows)
  const filtered = rows.filter(row => {
    const matches = !query || `${row.productName} ${row.articleName} ${row.articleCode}`.toLowerCase().includes(query.toLowerCase())
    if (!matches) return false
    if (filter === 'included') return !row.excluded
    if (filter === 'excluded') return row.excluded
    if (filter === 'corrected') return row.corrected
    if (filter === 'critical') return !row.excluded && row.margin !== null && row.margin < 40
    if (filter === 'no_pvp') return row.sale === null
    return true
  }).sort((a, b) => (a.margin ?? 999) - (b.margin ?? 999))

  function notify(type: 'success' | 'error', text: string) {
    setMessage({ type, text }); window.setTimeout(() => setMessage(null), 4500)
  }
  async function open(row: MarginProduct) {
    setSelected(row); setManualCost(row.corrected ? String(row.cost || '') : ''); setReason('')
    if (!supabase) return
    if (row.entityType === 'numier_article') { setEvents([]); return }
    const { data } = await supabase.from('profitability_cost_events').select('*').eq('entity_type', row.entityType).eq('entity_id', row.entityId).order('created_at', { ascending: false }).limit(50)
    setEvents((data || []) as CostControlEvent[])
  }
  async function control(action: 'set_manual' | 'restore_auto' | 'exclude' | 'include') {
    if (!selected || !supabase) return
    const needsReason = action === 'set_manual' || action === 'exclude'
    if (needsReason && !reason.trim()) return notify('error', 'El motivo es obligatorio para conservar la trazabilidad.')
    if (action === 'set_manual' && Number(manualCost) <= 0) return notify('error', 'El coste corregido debe ser mayor que cero.')
    if (action === 'exclude' && !window.confirm('¿Excluir este producto de medias, rankings, alertas y previsiones?')) return
    setBusy(true)
    let error = null
    if (selected.entityType === 'numier_article') {
      if (action === 'restore_auto') {
        const result = await supabase.from('profitability_article_costs').delete().eq('article_code', selected.articleCode)
        error = result.error
      } else {
        const previous = articleCosts.find(item => String(item.article_code) === String(selected.articleCode))
        const payload = {
          article_code: selected.articleCode,
          manual_unit_cost: action === 'set_manual' ? Number(manualCost) : Number(previous?.manual_unit_cost || selected.cost || 0) || null,
          reason: reason.trim() || previous?.reason || 'Actualización manual',
          updated_by: currentUser,
          updated_at: new Date().toISOString(),
          excluded_from_margin: action === 'exclude' ? true : action === 'include' ? false : Boolean(previous?.excluded_from_margin),
        }
        const result = await supabase.from('profitability_article_costs').upsert(payload, { onConflict: 'article_code' })
        error = result.error
      }
    } else {
      const result = await supabase.rpc('set_profitability_cost_control', {
        p_entity_type: selected.entityType,
        p_entity_id: selected.entityId,
        p_action: action,
        p_manual_cost: action === 'set_manual' ? Number(manualCost) : null,
        p_reason: reason.trim() || (action === 'restore_auto' ? 'Restauración del coste automático' : 'Restauración de inclusión'),
        p_actor: currentUser,
      })
      error = result.error
    }
    if (error) { setBusy(false); return notify('error', `${error.message}. Ejecuta la migración Inteligencia y Costes Manuales.`) }
    await onRefresh(false); setBusy(false); setSelected(null)
    const affected = selected.entityType === 'master_item' ? selected.affectedRecipeIds.length : 0
    notify('success', `${action === 'exclude' ? 'Producto excluido' : action === 'include' ? 'Producto incluido' : action === 'restore_auto' ? 'Coste automático restaurado' : 'Coste corregido'}${affected ? `. ${affected} escandallo${affected === 1 ? '' : 's'} recalculado${affected === 1 ? '' : 's'}.` : '.'}`)
  }

  return <section className="editableMargins">
    <div className="grid profitKpis marginKpis">
      <div className="kpi"><span>Margen medio incluido</span><b>{average === null ? '—' : `${average.toFixed(1)}%`}</b></div>
      <div className="kpi"><span>Incluidos</span><b>{rows.filter(row => !row.excluded).length}</b></div>
      <div className="kpi"><span>Excluidos</span><b>{rows.filter(row => row.excluded).length}</b></div>
      <div className="kpi"><span>Coste corregido</span><b>{rows.filter(row => row.corrected).length}</b></div>
    </div>
    <div className="card marginToolbar">
      <div><h2>Márgenes editables</h2><p>Pulsa cualquier producto para corregir su coste, excluirlo o consultar su trazabilidad.</p></div>
      <div className="marginControls"><input placeholder="Buscar producto o código" value={query} onChange={event => setQuery(event.target.value)} /><select value={filter} onChange={event => setFilter(event.target.value as Filter)}><option value="all">Todos</option><option value="included">Incluidos</option><option value="excluded">Excluidos</option><option value="corrected">Coste corregido</option><option value="critical">Margen crítico</option><option value="no_pvp">Sin PVP</option></select></div>
    </div>
    <div className="marginCards editableMarginCards">{filtered.map(row => <button className={`editableMarginCard ${row.excluded ? 'excluded' : ''} ${!row.complete ? 'incomplete' : ''}`} key={row.id} onClick={() => open(row)}>
      <div><b>{row.productName}</b><small>{row.articleName} · {row.articleCode} · {row.entityType === 'recipe' ? 'Escandallo' : row.entityType === 'numier_article' ? 'Artículo NUMIER' : 'Venta directa'}</small>{row.linkedArticles.length > 1 && <em>{row.linkedArticles.length} vínculos NUMIER</em>}</div>
      <span>Coste efectivo <b>{money(row.cost)}</b>{row.corrected && <small>Corregido manualmente</small>}</span>
      <span>PVP <b>{money(row.sale)}</b></span>
      <span>Beneficio <b>{money(row.profit)}</b></span>
      <strong className={row.margin === null ? 'info' : row.margin >= 60 ? 'ok' : row.margin >= 40 ? 'info' : 'bad'}>{row.excluded ? 'Excluido' : row.margin === null ? 'Incompleto' : `${row.margin.toFixed(1)}%`}</strong>
    </button>)}</div>
    {!filtered.length && <div className="emptyState"><b>No hay productos para este filtro.</b></div>}

    {selected && <div className="modal" onClick={() => !busy && setSelected(null)}><div className="card marginEditorModal" onClick={event => event.stopPropagation()}>
      <div className="row between marginEditorTitle"><div><span className="sectionEyebrow">{selected.entityType === 'recipe' ? 'ESCANDALLO' : selected.entityType === 'numier_article' ? 'ARTÍCULO NUMIER' : 'PRODUCTO DIRECTO'}</span><h2>{selected.productName}</h2><p>{selected.articleName} · Código {selected.articleCode}</p></div><button className="red" onClick={() => setSelected(null)}>Cerrar</button></div>
      <div className="marginTraceGrid">
        <p><span>Coste detectado</span><b>{money(selected.automaticCost)}</b></p><p><span>Coste manual</span><b>{selected.corrected ? money(selected.cost) : 'No configurado'}</b></p><p className="featured"><span>Coste efectivo usado</span><b>{money(selected.cost)}</b></p><p><span>PVP real NUMIER</span><b>{money(selected.sale)}</b></p><p><span>Beneficio unitario</span><b>{money(selected.profit)}</b></p><p><span>Margen / venta</span><b>{selected.margin === null ? 'No disponible' : `${selected.margin.toFixed(1)}%`}</b></p><p><span>Margen / coste</span><b>{selected.marginOnCost === null ? 'No disponible' : `${selected.marginOnCost.toFixed(1)}%`}</b></p><p><span>Estado</span><b>{selected.excluded ? 'Excluido' : 'Incluido'}</b></p>
      </div>
      <div className="linkedTrace"><h3>Vínculos NUMIER</h3>{selected.linkedArticles.length ? selected.linkedArticles.map(link => <span key={link.id}><b>{link.numier_article_name}</b> · {link.numier_article_code} · PVP guardado {money(Number(link.sale_price || 0) || null)}</span>) : <span><b>{selected.articleName}</b> · {selected.articleCode}</span>}</div>
      {selected.entityType === 'numier_article' && <div className="infoText">Este artículo existe en NUMIER aunque no proceda de una factura ni tenga escandallo. El coste que indiques se utilizará en Inteligencia para calcular margen y beneficio real.</div>}
      {selected.costResolution && <><div className="costOrigin"><p><span>Fuente usada</span><b>{selected.costResolution.source === 'manual' ? 'Coste corregido' : selected.costResolution.source === 'latest' ? 'Última compra confirmada' : selected.costResolution.source === 'average' ? 'Coste medio histórico' : 'Sin coste'}</b></p><p><span>Proveedor</span><b>{selected.costResolution.supplier || 'No disponible'}</b></p><p><span>Última factura</span><b>{selected.costResolution.invoiceNumber || 'No disponible'}</b></p><p><span>Última compra</span><b>{dateTime(selected.costResolution.invoiceDate)}</b></p><p><span>Coste medio</span><b>{money(selected.costResolution.averageCost)}</b></p></div><div className="costHistory"><h3>Histórico de costes</h3>{selected.costResolution.history.map(entry => <div key={entry.purchaseItemId}><span>{entry.supplier || 'Proveedor'} · {entry.invoiceNumber || 'Sin número'} · {dateTime(entry.invoiceDate)}</span><b>{money(entry.unitCost)}</b></div>)}{!selected.costResolution.history.length && <p>No hay compras confirmadas compatibles.</p>}</div></>}
      <div className="costCorrection"><h3>Corregir coste efectivo</h3><div className="formGrid"><label>Coste manual<input type="number" min="0" step="0.0001" value={manualCost} onChange={event => setManualCost(event.target.value)} /></label><label className="wideField">Motivo obligatorio<textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explica por qué se corrige o excluye" /></label><label>Fecha<input value={new Date().toLocaleString('es-ES')} disabled /></label><label>Usuario<input value={currentUser} disabled /></label></div><div className="row wrap"><button disabled={busy} onClick={() => control('set_manual')}>Guardar coste corregido</button>{selected.corrected && <button className="secondaryButton" disabled={busy} onClick={() => control('restore_auto')}>Restaurar coste automático</button>}{selected.excluded ? <button disabled={busy} onClick={() => control('include')}>Volver a incluir</button> : <button className="red" disabled={busy} onClick={() => control('exclude')}>Excluir del cálculo</button>}</div>{selected.affectedRecipeIds.length > 0 && <p className="infoText">Este cambio recalculará {selected.affectedRecipeIds.length} escandallo{selected.affectedRecipeIds.length === 1 ? '' : 's'} relacionado{selected.affectedRecipeIds.length === 1 ? '' : 's'}.</p>}</div>
      <div className="costEvents"><h3>Auditoría de cambios</h3>{events.map(event => <div key={event.id}><span>{dateTime(event.created_at)} · {event.actor}</span><b>{event.event_type}</b><small>{event.reason}</small></div>)}{!events.length && <p>Sin correcciones ni exclusiones registradas.</p>}</div>
    </div></div>}
    {message && <div className={`profitToast ${message.type}`} role="status"><b>{message.type === 'success' ? 'Correcto' : 'Revisión necesaria'}</b><span>{message.text}</span></div>}
  </section>
}

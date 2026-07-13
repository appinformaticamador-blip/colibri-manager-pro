import { useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateIngredient, calculateRecipe, normalizeCostUnit } from './recipeCosting'
import type {
  CostUnit,
  MasterItem,
  NumierArticle,
  PurchaseItem,
  Recipe,
  RecipeIngredient,
} from './types'

interface ProfessionalRecipesProps {
  supabase: SupabaseClient | null
  recipes: Recipe[]
  recipeIngredients: RecipeIngredient[]
  masterItems: MasterItem[]
  purchaseItems: PurchaseItem[]
  numierCatalog: NumierArticle[]
  onRefresh: (showLoading?: boolean) => Promise<void>
}

interface RecipeEditor extends Omit<Recipe, 'id'> {
  id?: string
  ingredients: RecipeIngredient[]
}

interface ToastState {
  type: 'success' | 'error'
  message: string
}

const moneyFormatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const amountFormatter = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 4 })

function money(value: number | null | undefined) {
  return moneyFormatter.format(Number(value || 0))
}

function dateLabel(value: string | null) {
  if (!value) return 'Sin fecha'
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-ES')
}

function unitOptions(baseUnit: unknown): CostUnit[] {
  const unit = normalizeCostUnit(baseUnit)
  if (unit === 'g' || unit === 'kg') return ['g', 'kg']
  if (unit === 'ml' || unit === 'l') return ['ml', 'l']
  return ['ud']
}

function emptyEditor(): RecipeEditor {
  return {
    name: '',
    numier_article_code: '',
    numier_article_name: '',
    sale_price: 0,
    yield_quantity: 1,
    yield_unit: 'ración',
    category: 'Plato',
    notes: '',
    target_margin_pct: 65,
    extra_cost_percent: 0,
    active: true,
    version: 1,
    ingredients: [],
  }
}

export default function ProfessionalRecipes({
  supabase,
  recipes,
  recipeIngredients,
  masterItems,
  purchaseItems,
  numierCatalog,
  onRefresh,
}: ProfessionalRecipesProps) {
  const [editor, setEditor] = useState<RecipeEditor | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'active' | 'archived' | 'all'>('active')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const numierPrices = useMemo(() => new Map(
    numierCatalog.map((article) => [String(article.article_code), Number(article.sale_price || 0)]),
  ), [numierCatalog])

  const recipeRows = useMemo(() => recipes.map((recipe) => {
    const ingredients = recipeIngredients
      .filter((ingredient) => String(ingredient.recipe_id) === String(recipe.id))
      .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
    const calculation = calculateRecipe(
      recipe,
      ingredients,
      masterItems,
      purchaseItems,
      Number(numierPrices.get(String(recipe.numier_article_code)) || 0),
    )
    return { recipe, ingredients, calculation }
  }), [masterItems, numierPrices, purchaseItems, recipeIngredients, recipes])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-ES')
    return recipeRows.filter(({ recipe }) => {
      if (status === 'active' && recipe.active === false) return false
      if (status === 'archived' && recipe.active !== false) return false
      if (!normalizedQuery) return true
      return [recipe.name, recipe.numier_article_name, recipe.category, recipe.numier_article_code]
        .some((value) => String(value || '').toLocaleLowerCase('es-ES').includes(normalizedQuery))
    })
  }, [query, recipeRows, status])

  const editorCalculation = useMemo(() => {
    if (!editor) return null
    return calculateRecipe(
      { ...editor, id: editor.id || 'new' },
      editor.ingredients,
      masterItems,
      purchaseItems,
      Number(numierPrices.get(String(editor.numier_article_code)) || 0),
    )
  }, [editor, masterItems, numierPrices, purchaseItems])
  const editorNumierArticle = editor
    ? numierCatalog.find((article) => String(article.article_code) === String(editor.numier_article_code))
    : null
  const editorNumierPrice = Number(editorNumierArticle?.sale_price || 0)

  const activeRows = recipeRows.filter(({ recipe }) => recipe.active !== false)
  const averageMargin = activeRows.length
    ? activeRows.reduce((total, row) => total + row.calculation.marginPct, 0) / activeRows.length
    : 0
  const incompleteRows = activeRows.filter((row) => row.calculation.warnings.length > 0)

  function notify(type: ToastState['type'], message: string) {
    setToast({ type, message })
    window.setTimeout(() => setToast(null), 4200)
  }

  function openRecipe(recipe: Recipe) {
    setEditor({
      ...recipe,
      ingredients: recipeIngredients
        .filter((ingredient) => String(ingredient.recipe_id) === String(recipe.id))
        .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
        .map((ingredient) => ({ ...ingredient })),
    })
  }

  function duplicateRecipe(recipe: Recipe) {
    setEditor({
      ...recipe,
      id: undefined,
      name: `${recipe.name} · copia`,
      numier_article_code: '',
      numier_article_name: '',
      sale_price: 0,
      version: 1,
      active: true,
      ingredients: recipeIngredients
        .filter((ingredient) => String(ingredient.recipe_id) === String(recipe.id))
        .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
        .map(({ id: _id, recipe_id: _recipeId, ...ingredient }) => ({ ...ingredient })),
    })
  }

  function updateIngredient(index: number, patch: Partial<RecipeIngredient>) {
    if (!editor) return
    const ingredients = editor.ingredients.map((ingredient, itemIndex) => (
      itemIndex === index ? { ...ingredient, ...patch } : ingredient
    ))
    setEditor({ ...editor, ingredients })
  }

  function addIngredient() {
    if (!editor) return
    setEditor({
      ...editor,
      ingredients: [...editor.ingredients, {
        master_item_id: '',
        quantity: 0,
        unit: 'g',
        waste_percent: null,
        notes: '',
      }],
    })
  }

  async function saveRecipe() {
    if (!editor || !supabase) return
    if (!editor.name.trim()) return notify('error', 'Indica el nombre del escandallo.')
    if (!editor.numier_article_code) return notify('error', 'Selecciona el artículo de venta de NUMIER.')
    if (Number(editor.yield_quantity || 0) <= 0) return notify('error', 'El rendimiento debe ser mayor que cero.')
    const validIngredients = editor.ingredients.filter((item) => item.master_item_id && Number(item.quantity) > 0)
    if (!validIngredients.length) return notify('error', 'Añade al menos un ingrediente con cantidad válida.')
    if (validIngredients.length !== editor.ingredients.length) return notify('error', 'Revisa los ingredientes incompletos antes de guardar.')

    setSaving(true)
    const recipePayload = {
      id: editor.id || null,
      name: editor.name.trim(),
      numier_article_code: String(editor.numier_article_code),
      numier_article_name: editor.numier_article_name || null,
      sale_price: Number(editor.sale_price || 0),
      yield_quantity: Number(editor.yield_quantity || 1),
      yield_unit: editor.yield_unit || 'ración',
      category: editor.category || null,
      notes: editor.notes || null,
      target_margin_pct: Number(editor.target_margin_pct || 0),
      extra_cost_percent: Number(editor.extra_cost_percent || 0),
      active: editor.active !== false,
    }
    const ingredientPayload = validIngredients.map((ingredient, position) => ({
      master_item_id: ingredient.master_item_id,
      quantity: Number(ingredient.quantity),
      unit: ingredient.unit,
      waste_percent: ingredient.waste_percent === null || ingredient.waste_percent === undefined
        ? null
        : Number(ingredient.waste_percent),
      notes: ingredient.notes || null,
      position,
    }))
    const { error } = await supabase.rpc('save_profitability_recipe', {
      p_recipe: recipePayload,
      p_ingredients: ingredientPayload,
    })
    if (error) {
      setSaving(false)
      return notify('error', `${error.message}. Comprueba que la migración RC 3.9.0 esté aplicada.`)
    }
    await onRefresh(false)
    setSaving(false)
    setEditor(null)
    notify('success', editor.id ? 'Escandallo actualizado correctamente.' : 'Escandallo creado correctamente.')
  }

  async function toggleRecipe(recipe: Recipe) {
    if (!supabase) return
    const nextActive = recipe.active === false
    const { error } = await supabase
      .from('profitability_recipes')
      .update({ active: nextActive, updated_at: new Date().toISOString() })
      .eq('id', recipe.id)
    if (error) return notify('error', error.message)
    await onRefresh(false)
    notify('success', nextActive ? 'Escandallo reactivado.' : 'Escandallo archivado sin perder su histórico.')
  }

  return <section className="professionalRecipes">
    <div className="grid profitKpis recipeKpis">
      <div className="kpi"><span>Escandallos activos</span><b>{activeRows.length}</b></div>
      <div className="kpi"><span>Margen medio</span><b>{averageMargin.toFixed(1)}%</b></div>
      <div className="kpi"><span>Requieren revisión</span><b className={incompleteRows.length ? 'bad' : 'ok'}>{incompleteRows.length}</b></div>
      <div className="kpi"><span>Materias primas</span><b>{masterItems.filter((item) => item.usage_type === 'recipe').length}</b></div>
    </div>

    <div className="card recipeCommandBar">
      <div>
        <h2>Escandallos profesionales</h2>
        <p>Coste trazable por gramo, litro o unidad, conectado con compras y PVP de NUMIER.</p>
      </div>
      <div className="recipeFilters">
        <input
          aria-label="Buscar escandallo"
          placeholder="Buscar plato o código NUMIER"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select aria-label="Filtrar escandallos" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="active">Activos</option>
          <option value="archived">Archivados</option>
          <option value="all">Todos</option>
        </select>
        <button onClick={() => setEditor(emptyEditor())}>Nuevo escandallo</button>
      </div>
    </div>

    <div className="professionalRecipeGrid">
      {filteredRows.map(({ recipe, ingredients, calculation }) => {
        const target = Number(recipe.target_margin_pct || 65)
        const hasSalePrice = calculation.salePrice > 0
        const marginClass = !hasSalePrice ? 'info' : calculation.marginPct >= target ? 'ok' : calculation.marginPct >= Math.max(0, target - 15) ? 'info' : 'bad'
        return <article className={`card professionalRecipeCard ${recipe.active === false ? 'archived' : ''}`} key={recipe.id}>
          <div className="recipeCardHeader">
            <div>
              <span className="sectionEyebrow">{recipe.category || 'PLATO'} · NUMIER {recipe.numier_article_code}</span>
              <h3>{recipe.name}</h3>
              <p>{ingredients.length} ingredientes · {amountFormatter.format(Number(recipe.yield_quantity || 1))} {recipe.yield_unit || 'ración'}</p>
            </div>
            <strong className={marginClass}>{hasSalePrice ? `${calculation.marginPct.toFixed(1)}%` : '—'}</strong>
          </div>
          <div className="recipeCostSummary">
            <p><span>Coste por {recipe.yield_unit || 'ración'}</span><b>{money(calculation.costPerYield)}</b></p>
            <p><span>PVP aplicado</span><b>{hasSalePrice ? money(calculation.salePrice) : 'Precio no disponible en NUMIER'}</b></p>
            <p><span>Beneficio bruto</span><b>{hasSalePrice ? money(calculation.profitPerYield) : 'Pendiente de PVP'}</b></p>
            <p><span>PVP objetivo</span><b>{money(calculation.recommendedSalePrice)}</b></p>
          </div>
          {calculation.warnings.length > 0 && <div className="recipeWarning">
            <b>{calculation.warnings.length} revisión{calculation.warnings.length === 1 ? '' : 'es'} pendiente{calculation.warnings.length === 1 ? '' : 's'}</b>
            <span>{calculation.warnings[0]}</span>
          </div>}
          <div className="recipeCardActions">
            <button onClick={() => openRecipe(recipe)}>Editar</button>
            <button className="secondaryButton" onClick={() => duplicateRecipe(recipe)}>Duplicar</button>
            <button className="secondaryButton" onClick={() => toggleRecipe(recipe)}>{recipe.active === false ? 'Reactivar' : 'Archivar'}</button>
          </div>
        </article>
      })}
    </div>

    {!filteredRows.length && <div className="emptyState">
      <b>No hay escandallos para este filtro.</b>
      <p>Crea el primero o cambia el estado de búsqueda.</p>
    </div>}

    {editor && editorCalculation && <div className="modal" onClick={() => !saving && setEditor(null)}>
      <div className="card recipeModal professionalRecipeModal" onClick={(event) => event.stopPropagation()}>
        <div className="row between recipeEditorHeader">
          <div>
            <span className="sectionEyebrow">{editor.id ? `VERSIÓN ${editor.version || 1}` : 'NUEVO ESCANDALLO'}</span>
            <h2>{editor.id ? editor.name : 'Crear escandallo profesional'}</h2>
            <p>Los costes se recalculan con la compra más reciente de cada ingrediente.</p>
          </div>
          <button className="red" disabled={saving} onClick={() => setEditor(null)}>Cerrar</button>
        </div>

        <div className="recipeEditorGrid">
          <label className="wideField">Producto NUMIER
            <select value={editor.numier_article_code} onChange={(event) => {
              const article = numierCatalog.find((item) => String(item.article_code) === String(event.target.value))
              setEditor({
                ...editor,
                numier_article_code: event.target.value,
                numier_article_name: article?.article_name || '',
                name: editor.name || article?.article_name || '',
                sale_price: Number(article?.sale_price || editor.sale_price || 0),
              })
            }}>
              <option value="">Seleccionar artículo de venta…</option>
              {numierCatalog.map((article) => <option key={article.article_code} value={article.article_code}>
                {article.article_name || article.article_code} · {Number(article.sale_price || 0) > 0 ? money(article.sale_price) : 'Precio no disponible en NUMIER'}
              </option>)}
            </select>
          </label>
          <label>Nombre
            <input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
          </label>
          <label>Categoría
            <select value={editor.category || 'Plato'} onChange={(event) => setEditor({ ...editor, category: event.target.value })}>
              <option>Plato</option><option>Tapa</option><option>Menú</option><option>Bebida elaborada</option><option>Producción</option><option>Otro</option>
            </select>
          </label>
          {editorNumierPrice > 0 ? <div className="numierPricePanel recipeNumierPrice"><span>PVP recuperado de NUMIER</span><b>{money(editorNumierPrice)}</b><small>{editorNumierArticle?.price_source === 'catalog' ? 'Catálogo NUMIER' : 'Última venta real'}</small></div> : <label>PVP manual opcional
            <input type="number" min="0" step="0.01" placeholder="Solo si NUMIER no tiene precio" value={editor.sale_price || ''} onChange={(event) => setEditor({ ...editor, sale_price: Number(event.target.value) })} />
          </label>}
          <label>Rendimiento
            <input type="number" min="0.001" step="0.001" value={editor.yield_quantity || ''} onChange={(event) => setEditor({ ...editor, yield_quantity: Number(event.target.value) })} />
          </label>
          <label>Unidad resultante
            <select value={editor.yield_unit || 'ración'} onChange={(event) => setEditor({ ...editor, yield_unit: event.target.value })}>
              <option value="ración">ración</option><option value="unidad">unidad</option><option value="kg">kg</option><option value="l">litro</option>
            </select>
          </label>
          <label>Margen objetivo %
            <input type="number" min="0" max="95" step="0.1" value={editor.target_margin_pct || ''} onChange={(event) => setEditor({ ...editor, target_margin_pct: Number(event.target.value) })} />
          </label>
          <label>Costes indirectos %
            <input type="number" min="0" max="100" step="0.1" value={editor.extra_cost_percent || ''} onChange={(event) => setEditor({ ...editor, extra_cost_percent: Number(event.target.value) })} />
          </label>
          <label className="wideField">Notas de elaboración
            <textarea rows={3} value={editor.notes || ''} onChange={(event) => setEditor({ ...editor, notes: event.target.value })} />
          </label>
        </div>

        <div className="recipeIngredientHeading">
          <div><h3>Ingredientes</h3><p>Cantidad neta utilizada y merma específica del plato.</p></div>
          <button onClick={addIngredient}>+ Añadir ingrediente</button>
        </div>
        <div className="professionalIngredientList">
          {editor.ingredients.map((ingredient, index) => {
            const master = masterItems.find((item) => String(item.id) === String(ingredient.master_item_id))
            const calculation = calculateIngredient(ingredient, masterItems, purchaseItems)
            const options = unitOptions(master?.base_unit)
            return <div className={`professionalIngredient ${calculation.warning ? 'needsReview' : ''}`} key={`${ingredient.id || 'new'}-${index}`}>
              <label className="ingredientName">Materia prima
                <select value={ingredient.master_item_id} onChange={(event) => {
                  const selected = masterItems.find((item) => String(item.id) === String(event.target.value))
                  updateIngredient(index, {
                    master_item_id: event.target.value,
                    unit: unitOptions(selected?.base_unit)[0],
                  })
                }}>
                  <option value="">Seleccionar…</option>
                  {masterItems
                    .filter((item) => item.active !== false && ['recipe', 'sale', 'purchase'].includes(item.usage_type || 'purchase'))
                    .map((item) => <option key={item.id} value={item.id}>{item.name} · base {item.base_unit || 'ud'}</option>)}
                </select>
              </label>
              <label>Cantidad
                <input type="number" min="0" step="0.001" value={ingredient.quantity || ''} onChange={(event) => updateIngredient(index, { quantity: Number(event.target.value) })} />
              </label>
              <label>Unidad
                <select value={ingredient.unit} onChange={(event) => updateIngredient(index, { unit: event.target.value as CostUnit })}>
                  {options.map((unit) => <option key={unit}>{unit}</option>)}
                </select>
              </label>
              <label>Merma %
                <input type="number" min="0" max="95" step="0.1" placeholder={String(master?.waste_percent || 0)} value={ingredient.waste_percent ?? ''} onChange={(event) => updateIngredient(index, { waste_percent: event.target.value === '' ? null : Number(event.target.value) })} />
              </label>
              <div className="ingredientTrace">
                <span>Coste</span><b>{calculation.cost === null ? 'Pendiente' : money(calculation.cost)}</b>
                <small>{calculation.unitCost.source === 'invoice'
                  ? `${calculation.unitCost.supplier || 'Proveedor'} · ${dateLabel(calculation.unitCost.invoiceDate)}`
                  : calculation.unitCost.source === 'manual' ? 'Coste manual' : calculation.warning}</small>
              </div>
              <button className="red ingredientRemove" aria-label={`Eliminar ingrediente ${index + 1}`} onClick={() => setEditor({
                ...editor,
                ingredients: editor.ingredients.filter((_, itemIndex) => itemIndex !== index),
              })}>×</button>
            </div>
          })}
          {!editor.ingredients.length && <div className="emptyState"><b>Sin ingredientes.</b><p>Añade las materias primas que componen el plato.</p></div>}
        </div>

        <div className="professionalRecipeTotals">
          <p><span>Ingredientes</span><b>{money(editorCalculation.ingredientCost)}</b></p>
          <p><span>Indirectos</span><b>{money(editorCalculation.extraCost)}</b></p>
          <p><span>Coste lote</span><b>{money(editorCalculation.batchCost)}</b></p>
          <p className="featured"><span>Coste por {editor.yield_unit || 'ración'}</span><b>{money(editorCalculation.costPerYield)}</b></p>
          <p><span>Margen actual</span><b className={editorCalculation.marginPct >= Number(editor.target_margin_pct || 65) ? 'ok' : 'bad'}>{editorCalculation.marginPct.toFixed(1)}%</b></p>
          <p><span>PVP recomendado</span><b>{money(editorCalculation.recommendedSalePrice)}</b></p>
        </div>
        {editorCalculation.warnings.length > 0 && <div className="recipeValidationSummary">
          <b>Revisa el escandallo antes de darlo por definitivo</b>
          {editorCalculation.warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>}
        <div className="recipeSaveBar">
          <span>Los cambios se guardan de forma atómica y conservan la versión del escandallo.</span>
          <button disabled={saving} onClick={saveRecipe}>{saving ? 'Guardando…' : 'Guardar escandallo'}</button>
        </div>
      </div>
    </div>}

    {toast && <div className={`profitToast ${toast.type}`} role="status">
      <b>{toast.type === 'success' ? 'Correcto' : 'No se ha podido completar'}</b>
      <span>{toast.message}</span>
    </div>}
  </section>
}

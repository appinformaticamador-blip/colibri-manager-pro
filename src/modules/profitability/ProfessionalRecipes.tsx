import { useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateRecipe, normalizeCostUnit, wouldCreateCircularReference } from './recipeCosting'
import type {
  CostUnit,
  MasterItem,
  NumierArticle,
  PurchaseItem,
  Recipe,
  RecipeIngredient,
  RecipeVersion,
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
    fixed_cost: 0,
    status: 'draft',
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
  const [presence, setPresence] = useState<'all' | 'with' | 'without'>('all')
  const [sort, setSort] = useState<'name' | 'margin' | 'cost' | 'sales'>('name')
  const [copyRecipeId, setCopyRecipeId] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [versions, setVersions] = useState<RecipeVersion[]>([])

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
      { recipes, ingredients: recipeIngredients },
    )
    return { recipe, ingredients, calculation }
  }), [masterItems, numierPrices, purchaseItems, recipeIngredients, recipes])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-ES')
    if (presence === 'without') return []
    const filtered = recipeRows.filter(({ recipe }) => {
      if (status === 'active' && recipe.active === false) return false
      if (status === 'archived' && recipe.active !== false) return false
      if (!normalizedQuery) return true
      return [recipe.name, recipe.numier_article_name, recipe.category, recipe.numier_article_code]
        .some((value) => String(value || '').toLocaleLowerCase('es-ES').includes(normalizedQuery))
    })
    return filtered.sort((a, b) => {
      if (sort === 'margin') return Number(b.calculation.marginPct ?? -Infinity) - Number(a.calculation.marginPct ?? -Infinity)
      if (sort === 'cost') return b.calculation.costPerYield - a.calculation.costPerYield
      if (sort === 'sales') {
        const sales = (code: string) => Number(numierCatalog.find(item => String(item.article_code) === String(code))?.sales_quantity || 0)
        return sales(b.recipe.numier_article_code) - sales(a.recipe.numier_article_code)
      }
      return a.recipe.name.localeCompare(b.recipe.name, 'es')
    })
  }, [numierCatalog, presence, query, recipeRows, sort, status])

  const unconfiguredArticles = useMemo(() => {
    if (presence === 'with' || status === 'archived') return []
    const normalizedQuery = query.trim().toLocaleLowerCase('es-ES')
    return numierCatalog.filter(article => !recipes.some(recipe => String(recipe.numier_article_code) === String(article.article_code)) && (!normalizedQuery || `${article.article_name || ''} ${article.article_code}`.toLocaleLowerCase('es-ES').includes(normalizedQuery)))
      .sort((a, b) => sort === 'sales' ? Number(b.sales_quantity || 0) - Number(a.sales_quantity || 0) : String(a.article_name || a.article_code).localeCompare(String(b.article_name || b.article_code), 'es'))
      .slice(0, 100)
  }, [numierCatalog, presence, query, recipes, sort, status])

  const editorCalculation = useMemo(() => {
    if (!editor) return null
    return calculateRecipe(
      { ...editor, id: editor.id || 'new' },
      editor.ingredients,
      masterItems,
      purchaseItems,
      Number(numierPrices.get(String(editor.numier_article_code)) || 0),
      { recipes: [...recipes.filter(item => item.id !== editor.id), { ...editor, id: editor.id || 'new' }], ingredients: recipeIngredients },
    )
  }, [editor, masterItems, numierPrices, purchaseItems, recipeIngredients, recipes])
  const editorNumierArticle = editor
    ? numierCatalog.find((article) => String(article.article_code) === String(editor.numier_article_code))
    : null
  const editorNumierPrice = Number(editorNumierArticle?.sale_price || 0)

  const activeRows = recipeRows.filter(({ recipe }) => recipe.active !== false)
  const averageRows = activeRows.filter(({ recipe, calculation }) => !recipe.excluded_from_margin && calculation.complete && calculation.marginPct !== null)
  const averageMargin = averageRows.length
    ? averageRows.reduce((total, row) => total + Number(row.calculation.marginPct), 0) / averageRows.length
    : 0
  const incompleteRows = activeRows.filter((row) => row.calculation.warnings.length > 0)

  function notify(type: ToastState['type'], message: string) {
    setToast({ type, message })
    window.setTimeout(() => setToast(null), 4200)
  }

  async function openRecipe(recipe: Recipe) {
    const draftRecipe = recipe.draft_payload ? { ...recipe, ...recipe.draft_payload } : recipe
    const draftIngredients = Array.isArray(recipe.draft_ingredients) ? recipe.draft_ingredients : null
    setEditor({
      ...draftRecipe,
      ingredients: (draftIngredients || recipeIngredients
        .filter((ingredient) => String(ingredient.recipe_id) === String(recipe.id))
        .sort((a, b) => Number(a.position || 0) - Number(b.position || 0)))
        .map((ingredient) => ({ ...ingredient })),
    })
    if (supabase) {
      const { data } = await supabase.from('profitability_recipe_versions').select('*').eq('recipe_id', recipe.id).order('version', { ascending: false }).limit(25)
      setVersions((data || []) as RecipeVersion[])
    }
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

  function createForArticle(article: NumierArticle) {
    setEditor({ ...emptyEditor(), name: String(article.article_name || article.article_code), numier_article_code: String(article.article_code), numier_article_name: article.article_name || '', sale_price: Number(article.sale_price || 0) })
  }

  function copyIngredients() {
    if (!editor || !copyRecipeId) return
    const source = recipes.find(recipe => String(recipe.id) === copyRecipeId)
    if (!source) return
    const copied = recipeIngredients.filter(item => String(item.recipe_id) === copyRecipeId).sort((a, b) => Number(a.position || 0) - Number(b.position || 0)).map(({ id: _id, recipe_id: _recipeId, ...item }) => ({ ...item }))
    setEditor({ ...editor, ingredients: copied })
    setCopyRecipeId('')
    notify('success', `Ingredientes copiados desde ${source.name}.`)
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

  function moveIngredient(index: number, direction: -1 | 1) {
    if (!editor) return
    const target = index + direction
    if (target < 0 || target >= editor.ingredients.length) return
    const ingredients = [...editor.ingredients]
    ;[ingredients[index], ingredients[target]] = [ingredients[target], ingredients[index]]
    setEditor({ ...editor, ingredients })
  }

  function payloads() {
    if (!editor) return null
    return {
      recipePayload: {
        id: editor.id || null, name: editor.name.trim(), numier_article_code: String(editor.numier_article_code || ''),
        numier_article_name: editor.numier_article_name || null, sale_price: Number(editor.sale_price || 0),
        yield_quantity: Number(editor.yield_quantity || 1), yield_unit: editor.yield_unit || 'ración',
        category: editor.category || null, notes: editor.notes || null,
        target_margin_pct: Number(editor.target_margin_pct || 0), extra_cost_percent: Number(editor.extra_cost_percent || 0),
        fixed_cost: Number(editor.fixed_cost || 0), active: editor.active !== false,
      },
      ingredientPayload: editor.ingredients.map((ingredient, position) => ({
        master_item_id: ingredient.master_item_id || null, subrecipe_id: ingredient.subrecipe_id || null,
        quantity: Number(ingredient.quantity), unit: ingredient.unit,
        waste_percent: ingredient.waste_percent === null || ingredient.waste_percent === undefined ? null : Number(ingredient.waste_percent),
        notes: ingredient.notes || null, position,
      })),
    }
  }

  async function saveDraft() {
    if (!editor || !supabase) return
    const payload = payloads(); if (!payload) return
    setSaving(true)
    const { data, error } = await supabase.rpc('save_profitability_recipe_draft', { p_recipe: payload.recipePayload, p_ingredients: payload.ingredientPayload, p_actor: 'Usuario ERP' })
    setSaving(false)
    if (error) return notify('error', `${error.message}. Ejecuta la migración RC 3.9.2.`)
    await onRefresh(false)
    setEditor({ ...editor, id: editor.id || String(data), status: 'draft' })
    notify('success', 'Borrador guardado sin alterar la versión publicada.')
  }

  async function saveRecipe() {
    if (!editor || !supabase) return
    if (!editor.name.trim()) return notify('error', 'Indica el nombre del escandallo.')
    if (!editor.numier_article_code) return notify('error', 'Selecciona el artículo de venta de NUMIER.')
    if (Number(editor.yield_quantity || 0) <= 0) return notify('error', 'El rendimiento debe ser mayor que cero.')
    const validIngredients = editor.ingredients.filter((item) => (item.master_item_id || item.subrecipe_id) && Number(item.quantity) > 0)
    if (!validIngredients.length) return notify('error', 'Añade al menos un ingrediente con cantidad válida.')
    if (validIngredients.length !== editor.ingredients.length) return notify('error', 'Revisa los ingredientes incompletos antes de guardar.')

    setSaving(true)
    if (editorCalculation?.circular) { setSaving(false); return notify('error', 'La subreceta seleccionada crea una referencia circular.') }
    const payload = payloads(); if (!payload) return
    const { error } = await supabase.rpc('publish_profitability_recipe', {
      p_recipe: payload.recipePayload,
      p_ingredients: payload.ingredientPayload,
      p_metrics: { cost_total: editorCalculation?.effectiveCost, margin_pct: editorCalculation?.marginPct, sale_price: editorCalculation?.salePrice },
      p_actor: 'Usuario ERP',
    })
    if (error) {
      setSaving(false)
      return notify('error', `${error.message}. Comprueba que la migración RC 3.9.2 esté aplicada.`)
    }
    await onRefresh(false)
    setSaving(false)
    setEditor(null)
    notify('success', editor.id ? 'Nueva versión publicada correctamente.' : 'Escandallo publicado correctamente.')
  }

  async function restoreVersion(version: number) {
    if (!editor?.id || !supabase || !window.confirm(`¿Restaurar la versión ${version} como una nueva versión publicada?`)) return
    setSaving(true)
    const { error } = await supabase.rpc('restore_profitability_recipe_version', { p_recipe_id: editor.id, p_version: version, p_actor: 'Usuario ERP' })
    setSaving(false)
    if (error) return notify('error', error.message)
    await onRefresh(false)
    setEditor(null)
    notify('success', `Versión ${version} restaurada sin borrar el histórico.`)
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
        <select aria-label="Filtrar por configuración" value={presence} onChange={(event) => setPresence(event.target.value as typeof presence)}>
          <option value="all">Con y sin escandallo</option><option value="with">Con escandallo</option><option value="without">Sin escandallo</option>
        </select>
        <select aria-label="Ordenar escandallos" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
          <option value="name">Ordenar por nombre</option><option value="margin">Mayor margen</option><option value="cost">Mayor coste</option><option value="sales">Más vendidos</option>
        </select>
        <button onClick={() => setEditor(emptyEditor())}>Nuevo escandallo</button>
      </div>
    </div>

    <div className="professionalRecipeGrid">
      {filteredRows.map(({ recipe, ingredients, calculation }) => {
        const target = Number(recipe.target_margin_pct || 65)
        const hasSalePrice = calculation.salePrice > 0
        const margin = calculation.marginPct ?? 0
        const marginClass = !hasSalePrice ? 'info' : margin >= target ? 'ok' : margin >= Math.max(0, target - 15) ? 'info' : 'bad'
        return <article className={`card professionalRecipeCard ${recipe.active === false ? 'archived' : ''}`} key={recipe.id} onClick={() => openRecipe(recipe)}>
          <div className="recipeCardHeader">
            <div>
              <span className="sectionEyebrow">{recipe.category || 'PLATO'} · NUMIER {recipe.numier_article_code || 'PENDIENTE'} {recipe.draft_payload && '· BORRADOR'}</span>
              <h3>{recipe.name}</h3>
              <p>{ingredients.length} ingredientes · {amountFormatter.format(Number(recipe.yield_quantity || 1))} {recipe.yield_unit || 'ración'}</p>
            </div>
            <strong className={marginClass}>{hasSalePrice && calculation.marginPct !== null ? `${calculation.marginPct.toFixed(1)}%` : '—'}</strong>
          </div>
          <div className="recipeCostSummary">
            <p><span>Coste por {recipe.yield_unit || 'ración'}</span><b>{calculation.complete ? money(calculation.costPerYield) : 'Coste pendiente'}</b></p>
            <p><span>PVP aplicado</span><b>{hasSalePrice ? money(calculation.salePrice) : 'Precio no disponible en NUMIER'}</b></p>
            <p><span>Beneficio bruto</span><b>{hasSalePrice ? money(calculation.profitPerYield) : 'Pendiente de PVP'}</b></p>
            <p><span>PVP objetivo</span><b>{money(calculation.recommendedSalePrice)}</b></p>
          </div>
          {calculation.warnings.length > 0 && <div className="recipeWarning">
            <b>{calculation.warnings.length} revisión{calculation.warnings.length === 1 ? '' : 'es'} pendiente{calculation.warnings.length === 1 ? '' : 's'}</b>
            <span>{calculation.warnings[0]}</span>
          </div>}
          <div className="recipeCardActions">
            <button onClick={(event) => { event.stopPropagation(); openRecipe(recipe) }}>Editar</button>
            <button className="secondaryButton" onClick={(event) => { event.stopPropagation(); duplicateRecipe(recipe) }}>Duplicar</button>
            <button className="secondaryButton" onClick={(event) => { event.stopPropagation(); toggleRecipe(recipe) }}>{recipe.active === false ? 'Reactivar' : 'Archivar'}</button>
          </div>
        </article>
      })}
      {unconfiguredArticles.map(article => <article className="card professionalRecipeCard incomplete" key={`numier-${article.article_code}`} onClick={() => createForArticle(article)}>
        <div className="recipeCardHeader"><div><span className="sectionEyebrow">NUMIER {article.article_code} · SIN ESCANDALLO</span><h3>{article.article_name || article.article_code}</h3><p>{Number(article.sales_quantity || 0).toLocaleString('es-ES')} unidades vendidas sincronizadas</p></div><strong className="info">—</strong></div>
        <div className="recipeCostSummary"><p><span>Coste</span><b>Escandallo incompleto</b></p><p><span>PVP NUMIER</span><b>{Number(article.sale_price || 0) > 0 ? money(article.sale_price) : 'Precio no disponible en NUMIER'}</b></p></div>
        <div className="recipeCardActions"><button onClick={(event) => { event.stopPropagation(); createForArticle(article) }}>Crear escandallo</button></div>
      </article>)}
    </div>

    {!filteredRows.length && !unconfiguredArticles.length && <div className="emptyState">
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
          <label>Coste fijo por lote
            <input type="number" min="0" step="0.01" value={editor.fixed_cost || ''} onChange={(event) => setEditor({ ...editor, fixed_cost: Number(event.target.value) })} />
          </label>
          <label className="wideField">Notas de elaboración
            <textarea rows={3} value={editor.notes || ''} onChange={(event) => setEditor({ ...editor, notes: event.target.value })} />
          </label>
        </div>

        <div className="recipeIngredientHeading">
          <div><h3>Ingredientes</h3><p>Cantidad neta utilizada y merma específica del plato.</p></div>
          <div className="recipeCopyTools"><select aria-label="Copiar desde otro escandallo" value={copyRecipeId} onChange={event => setCopyRecipeId(event.target.value)}><option value="">Copiar desde otro…</option>{recipes.filter(item => item.id !== editor.id && item.active !== false).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="secondaryButton" disabled={!copyRecipeId} onClick={copyIngredients}>Copiar ingredientes</button><button onClick={addIngredient}>+ Añadir ingrediente</button></div>
        </div>
        <div className="professionalIngredientList">
          {editor.ingredients.map((ingredient, index) => {
            const master = masterItems.find((item) => String(item.id) === String(ingredient.master_item_id))
            const calculation = editorCalculation.ingredients[index]
            const subrecipe = recipes.find((item) => String(item.id) === String(ingredient.subrecipe_id))
            const options = subrecipe ? ['g', 'kg', 'ml', 'l', 'ud'] as CostUnit[] : unitOptions(master?.base_unit)
            return <div className={`professionalIngredient ${calculation.warning ? 'needsReview' : ''}`} key={`${ingredient.id || 'new'}-${index}`}>
              <label className="ingredientName">Materia prima o subreceta
                <input aria-label={`Buscar ingrediente ${index + 1}`} placeholder="Buscar materia prima o subreceta" value={ingredient._search || ''} onChange={event => updateIngredient(index, { _search: event.target.value })} />
                <select value={ingredient.subrecipe_id ? `r:${ingredient.subrecipe_id}` : ingredient.master_item_id ? `m:${ingredient.master_item_id}` : ''} onChange={(event) => {
                  const [kind, id] = event.target.value.split(':')
                  const selected = masterItems.find((item) => String(item.id) === id)
                  updateIngredient(index, kind === 'r'
                    ? { master_item_id: null, subrecipe_id: id, unit: 'ud' }
                    : { master_item_id: id, subrecipe_id: null, unit: unitOptions(selected?.base_unit)[0] })
                }}>
                  <option value="">Seleccionar…</option>
                  {masterItems
                    .filter((item) => item.active !== false && ['recipe', 'sale', 'purchase'].includes(item.usage_type || 'purchase') && (!ingredient._search || item.name.toLocaleLowerCase('es-ES').includes(ingredient._search.toLocaleLowerCase('es-ES'))))
                    .map((item) => <option key={item.id} value={`m:${item.id}`}>{item.name} · base {item.base_unit || 'ud'}</option>)}
                  {recipes.filter(item => item.active !== false && item.id !== editor.id && (!ingredient._search || item.name.toLocaleLowerCase('es-ES').includes(ingredient._search.toLocaleLowerCase('es-ES')))).map(item => <option disabled={Boolean(editor.id && wouldCreateCircularReference(editor.id, item.id, recipeIngredients))} key={`r-${item.id}`} value={`r:${item.id}`}>Subreceta · {item.name}</option>)}
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
                <small>{subrecipe ? `Subreceta · ${subrecipe.name}` : calculation.unitCost.source === 'latest'
                  ? `${calculation.unitCost.supplier || 'Proveedor'} · ${dateLabel(calculation.unitCost.invoiceDate)}`
                  : calculation.unitCost.source === 'average' ? 'Coste medio histórico' : calculation.unitCost.source === 'manual' ? 'Coste manual' : calculation.warning}</small>
                {!subrecipe && <small>Último: {calculation.unitCost.latestCost === null ? '—' : money(calculation.unitCost.latestCost)} · Medio: {calculation.unitCost.averageCost === null ? '—' : money(calculation.unitCost.averageCost)} · Base {master?.base_unit || '—'} · Merma {ingredient.waste_percent ?? master?.waste_percent ?? 0}%</small>}
              </div>
              <div className="ingredientOrder"><button className="secondaryButton" disabled={index === 0} onClick={() => moveIngredient(index, -1)}>↑</button><button className="secondaryButton" disabled={index === editor.ingredients.length - 1} onClick={() => moveIngredient(index, 1)}>↓</button></div>
              <button className="red ingredientRemove" aria-label={`Eliminar ingrediente ${index + 1}`} onClick={() => setEditor({
                ...editor,
                ingredients: editor.ingredients.filter((_, itemIndex) => itemIndex !== index),
              })}>×</button>
            </div>
          })}
          {!editor.ingredients.length && <div className="emptyState"><b>Sin ingredientes.</b><p>Añade las materias primas que componen el plato.</p></div>}
        </div>

        <div className="professionalRecipeTotals">
          <p><span>Ingredientes</span><b>{editorCalculation.complete ? money(editorCalculation.ingredientCost) : 'Pendiente'}</b></p>
          <p><span>Indirectos</span><b>{money(editorCalculation.extraCost)}</b></p>
          <p><span>Fijo por lote</span><b>{money(editorCalculation.fixedCost)}</b></p>
          <p><span>Coste lote</span><b>{editorCalculation.complete ? money(editorCalculation.batchCost) : 'Pendiente'}</b></p>
          <p className="featured"><span>Coste por {editor.yield_unit || 'ración'}</span><b>{editorCalculation.complete ? money(editorCalculation.costPerYield) : 'Pendiente'}</b></p>
          <p><span>Margen actual</span><b className={Number(editorCalculation.marginPct ?? -1) >= Number(editor.target_margin_pct || 65) ? 'ok' : 'bad'}>{editorCalculation.marginPct === null ? 'Pendiente' : `${editorCalculation.marginPct.toFixed(1)}%`}</b></p>
          <p><span>PVP recomendado</span><b>{money(editorCalculation.recommendedSalePrice)}</b></p>
        </div>
        {editorCalculation.warnings.length > 0 && <div className="recipeValidationSummary">
          <b>Revisa el escandallo antes de darlo por definitivo</b>
          {editorCalculation.warnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>}
        {editor.id && <div className="recipeVersions"><h3>Histórico de versiones</h3>{versions.map(item => <div key={item.id}><span>Versión {item.version} · {new Date(item.created_at).toLocaleString('es-ES')} · {item.published_by || 'Usuario ERP'}</span><b>{item.margin_pct === null || item.margin_pct === undefined ? 'Sin margen guardado' : `${Number(item.margin_pct).toFixed(1)}%`}</b><button className="secondaryButton" disabled={saving || Number(item.version) === Number(editor.version)} onClick={() => restoreVersion(item.version)}>Restaurar</button></div>)}</div>}
        <div className="recipeSaveBar">
          <span>El borrador no altera producción. Publicar crea una versión atómica y recalcula los márgenes.</span>
          <div className="row wrap"><button className="secondaryButton" disabled={saving} onClick={saveDraft}>Guardar borrador</button><button disabled={saving} onClick={saveRecipe}>{saving ? 'Guardando…' : 'Publicar versión'}</button></div>
        </div>
      </div>
    </div>}

    {toast && <div className={`profitToast ${toast.type}`} role="status">
      <b>{toast.type === 'success' ? 'Correcto' : 'No se ha podido completar'}</b>
      <span>{toast.message}</span>
    </div>}
  </section>
}

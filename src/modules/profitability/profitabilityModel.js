const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function metrics(cost, sale) {
  if (cost === null || sale === null || sale <= 0) return { profit: null, margin: null, marginOnCost: null };
  const profit = sale - cost;
  return { profit, margin: (profit / sale) * 100, marginOnCost: cost > 0 ? (profit / cost) * 100 : null };
}

function latestPurchaseCost(master, purchaseItems) {
  const candidates = (purchaseItems || []).filter((item) => {
    const masterId = item.master_item_id ?? item.purchase_master_item_id;
    return String(masterId || '') === String(master.id || '');
  }).sort((a, b) => String(b.invoice_date || b.created_at || '').localeCompare(String(a.invoice_date || a.created_at || '')));
  for (const item of candidates) {
    const value = numberOrNull(item.unit_cost ?? item.cost_per_unit ?? item.net_unit_cost);
    if (value !== null && value >= 0) return value;
  }
  return null;
}

function masterCost(master, purchaseItems) {
  const manual = numberOrNull(master.manual_unit_cost);
  if (manual !== null && manual >= 0) return { cost: manual, automaticCost: latestPurchaseCost(master, purchaseItems), corrected: true };
  const direct = numberOrNull(master.unit_cost ?? master.average_cost);
  const purchase = latestPurchaseCost(master, purchaseItems);
  const cost = direct !== null ? direct : purchase;
  return { cost, automaticCost: cost, corrected: false };
}

export function buildMarginProducts({ links = [], masters = [], recipes = [], ingredients = [], purchaseItems = [], numierCatalog = [], articleCosts = [] } = {}) {
  const catalogByCode = new Map((numierCatalog || []).map((item) => [String(item.article_code || '').trim(), item]));
  const manualByCode = new Map((articleCosts || []).map((item) => [String(item.article_code || '').trim(), item]));
  const rows = [];

  for (const link of links || []) {
    const master = (masters || []).find((item) => String(item.id) === String(link.master_item_id));
    if (!master) continue;
    const code = String(link.numier_article_code || '').trim();
    if (!code) continue;
    const article = catalogByCode.get(code);
    const manualArticle = manualByCode.get(code);
    const base = masterCost(master, purchaseItems);
    const factor = Math.max(0, Number(link.quantity_factor || 1));
    const articleManual = numberOrNull(manualArticle?.manual_unit_cost);
    const cost = articleManual !== null ? articleManual : (base.cost === null ? null : base.cost * factor);
    const automaticCost = base.automaticCost === null ? null : base.automaticCost * factor;
    const saleValue = numberOrNull(link.sale_price ?? article?.sale_price ?? article?.price);
    const sale = saleValue !== null && saleValue > 0 ? saleValue : null;
    rows.push({
      id: `master:${master.id}:${link.id || code}`, entityType: 'master_item', entityId: String(master.id),
      productName: master.name || link.numier_article_name || article?.article_name || code,
      articleName: link.numier_article_name || article?.article_name || code, articleCode: code,
      linkedArticles: (links || []).filter((item) => String(item.master_item_id) === String(master.id)),
      cost, automaticCost, sale, ...metrics(cost, sale),
      excluded: Boolean(manualArticle?.excluded_from_margin ?? master.excluded_from_margin),
      corrected: articleManual !== null || base.corrected, complete: cost !== null && sale !== null,
      costResolution: null, recipeCalculation: null, affectedRecipeIds: [], source: master,
    });
  }

  for (const recipe of (recipes || []).filter((item) => item.active !== false)) {
    const code = String(recipe.numier_article_code || '').trim();
    if (!code) continue;
    const article = catalogByCode.get(code);
    const manualArticle = manualByCode.get(code);
    const manual = numberOrNull(manualArticle?.manual_unit_cost ?? recipe.manual_cost);
    const automatic = numberOrNull(recipe.cost_per_yield ?? recipe.unit_cost ?? recipe.calculated_cost);
    const cost = manual !== null ? manual : automatic;
    const saleValue = numberOrNull(article?.sale_price ?? article?.price ?? recipe.sale_price);
    const sale = saleValue !== null && saleValue > 0 ? saleValue : null;
    rows.push({
      id: `recipe:${recipe.id}`, entityType: 'recipe', entityId: String(recipe.id), productName: recipe.name || article?.article_name || code,
      articleName: recipe.numier_article_name || article?.article_name || code, articleCode: code, linkedArticles: [],
      cost, automaticCost: automatic, sale, ...metrics(cost, sale), excluded: Boolean(manualArticle?.excluded_from_margin ?? recipe.excluded_from_margin),
      corrected: manual !== null, complete: cost !== null && sale !== null, costResolution: null, recipeCalculation: null,
      affectedRecipeIds: [], source: recipe,
    });
  }

  const represented = new Set(rows.map((row) => String(row.articleCode)));
  for (const article of numierCatalog || []) {
    const code = String(article.article_code || '').trim();
    if (!code || represented.has(code)) continue;
    const manual = manualByCode.get(code);
    const manualCost = numberOrNull(manual?.manual_unit_cost);
    const saleValue = numberOrNull(article.sale_price ?? article.price);
    const sale = saleValue !== null && saleValue > 0 ? saleValue : null;
    rows.push({
      id: `article:${code}`, entityType: 'numier_article', entityId: code,
      productName: article.article_name || code, articleName: article.article_name || code, articleCode: code, linkedArticles: [],
      cost: manualCost, automaticCost: null, sale, ...metrics(manualCost, sale), excluded: Boolean(manual?.excluded_from_margin),
      corrected: manualCost !== null, complete: manualCost !== null && sale !== null, costResolution: null,
      recipeCalculation: null, affectedRecipeIds: [], source: article,
    });
  }
  return rows;
}

export function includedMarginAverage(rows = []) {
  const values = (rows || []).filter((row) => !row.excluded && row.margin !== null).map((row) => Number(row.margin));
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

const toNumber = (value) => Number(value || 0);

export function buildMarginProducts({
  links = [],
  masters = [],
  recipes = [],
  ingredients = [],
  purchaseItems = [],
  numierCatalog = [],
  articleCosts = [],
} = {}) {
  const costs = new Map(
    (articleCosts || []).map((item) => [
      String(item.entity_id ?? item.master_item_id ?? item.id),
      toNumber(item.effective_cost ?? item.cost ?? item.unit_cost),
    ]),
  );

  const catalog = new Map(
    (numierCatalog || []).map((item) => [String(item.article_code), item]),
  );

  return (masters || []).map((master) => {
    const id = String(master.id);
    const relatedLinks = (links || []).filter(
      (link) => String(link.master_item_id) === id,
    );

    const prices = relatedLinks
      .map(
        (link) =>
          toNumber(link.sale_price) ||
          toNumber(catalog.get(String(link.numier_article_code))?.sale_price),
      )
      .filter((value) => value > 0);

    const salePrice = prices.length
      ? Math.max(...prices)
      : toNumber(master.sale_price);

    const cost =
      costs.get(id) ||
      toNumber(master.manual_unit_cost) ||
      toNumber(master.unit_cost) ||
      toNumber(master.average_cost);

    const marginPercent = salePrice > 0
      ? ((salePrice - cost) / salePrice) * 100
      : 0;

    return {
      ...master,
      id,
      cost,
      sale_price: salePrice,
      margin_percent: marginPercent,
      included: master.exclude_from_margin !== true,
    };
  });
}

export function includedMarginAverage(rows = []) {
  const validRows = (rows || []).filter(
    (row) =>
      row.included !== false &&
      Number.isFinite(toNumber(row.margin_percent)),
  );

  return validRows.length
    ? validRows.reduce(
        (total, row) => total + toNumber(row.margin_percent),
        0,
      ) / validRows.length
    : 0;
}

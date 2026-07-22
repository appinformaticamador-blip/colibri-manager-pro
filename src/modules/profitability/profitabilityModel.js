const n=v=>Number(v||0);
export function buildMarginProducts({links=[],masters=[],recipes=[],ingredients=[],purchaseItems=[],numierCatalog=[],articleCosts=[]}={}){
 const costs=new Map((articleCosts||[]).map(x=>[String(x.entity_id??x.master_item_id??x.id),n(x.effective_cost??x.cost??x.unit_cost)]));
 const catalog=new Map((numierCatalog||[]).map(x=>[String(x.article_code),x]));
 return (masters||[]).map(m=>{const id=String(m.id);const rel=(links||[]).filter(l=>String(l.master_item_id)===id);const prices=rel.map(l=>n(l.sale_price)||n(catalog.get(String(l.numier_article_code))?.sale_price)).filter(v=>v>0);const salePrice=prices.length?Math.max(...prices):n(m.sale_price);const cost=costs.get(id)||n(m.manual_unit_cost)||n(m.unit_cost)||n(m.average_cost);const margin=salePrice>0?(salePrice-cost)/salePrice*100:0;return {...m,id,cost,sale_price:salePrice,margin_percent:margin,included:m.exclude_from_margin!==true}}
}
export function includedMarginAverage(rows=[]){const valid=(rows||[]).filter(r=>r.included!==false&&Number.isFinite(n(r.margin_percent)));return valid.length?valid.reduce((s,r)=>s+n(r.margin_percent),0)/valid.length:0}

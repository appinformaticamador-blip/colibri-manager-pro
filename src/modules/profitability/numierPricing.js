const n=v=>Number(v||0);
export function buildNumierCatalog(articles=[],lines=[]){
 const latest=new Map();
 for(const l of lines||[]){const c=String(l.articulo??l.article_code??'').trim();const p=n(l.precio??l.price);if(c&&p>0&&!latest.has(c))latest.set(c,p)}
 return (articles||[]).map(a=>{const code=String(a.codigo??a.article_code??a.articulo??a.id??'');const name=a.descripcion??a.article_name??a.nombre??code;const direct=n(a.precio??a.sale_price??a.pvp);const lp=latest.get(code)||0;return {...a,article_code:code,article_name:name,sale_price:direct||lp,price:direct||lp,price_source:direct?'catalog':lp?'ticket':'unknown',price_checked:Boolean(direct||lp),price_loading:false,price_error:false}})
}
export function mergeResolvedNumierPrice(article,line,error=false){const p=n(line?.precio??line?.price);return {...article,sale_price:p||n(article?.sale_price),price:p||n(article?.price),price_source:p?'ticket':article?.price_source,price_checked:true,price_loading:false,price_error:Boolean(error)}}
export function numierPriceText(article){const p=n(article?.sale_price??article?.price);return p>0?`${p.toFixed(2)} €`:(article?.price_loading?'Comprobando…':'Sin PVP')}
export function resolveLinkSalePrice(article,manual){const m=n(manual);return m>0?m:n(article?.sale_price??article?.price)}

-- COLIBRÍ ERP PRO · RC 3.7.1
-- Catálogo maestro, vinculación con NUMIER y cálculo de márgenes
alter table public.purchase_master_items add column if not exists numier_article_name text;
alter table public.purchase_master_items add column if not exists sale_price numeric(12,4) not null default 0;
alter table public.purchase_master_items add column if not exists sale_price_source text;
create index if not exists idx_purchase_master_numier_code on public.purchase_master_items(numier_article_code);

-- Consolida automáticamente líneas ya confirmadas de versiones anteriores.
insert into public.purchase_master_items(name,normalized_name,category,sub_category,base_unit,usage_type,active)
select distinct on (lower(regexp_replace(trim(i.product_name),'\\s+',' ','g')))
 i.product_name,
 lower(regexp_replace(trim(i.product_name),'\\s+',' ','g')),
 coalesce(i.category,'Otros gastos'),
 i.sub_category,
 coalesce(nullif(i.unit,''),'ud'),
 case
  when i.category='Materia prima' then 'recipe'
  when i.category='Bebidas' then 'sale'
  when i.category in ('Consumibles de servicio','Limpieza e higiene') then 'consumable'
  when i.category in ('Menaje','Utensilios y pequeño equipamiento') then 'asset'
  when i.category in ('Energía y suministros','Mantenimiento y reparación','Otros gastos') then 'expense'
  else 'purchase'
 end,
 true
from public.purchase_invoice_items i
where i.review_status='confirmed' and trim(coalesce(i.product_name,''))<>''
on conflict (normalized_name) do nothing;

update public.purchase_invoice_items i
set master_item_id=m.id
from public.purchase_master_items m
where i.master_item_id is null
and m.normalized_name=lower(regexp_replace(trim(i.product_name),'\\s+',' ','g'));

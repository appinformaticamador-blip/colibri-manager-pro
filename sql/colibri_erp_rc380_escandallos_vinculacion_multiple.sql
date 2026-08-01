-- COLIBRÍ ERP PRO · RC 3.8.0
-- Vinculación múltiple NUMIER + escandallos por gramos/ml/unidades

alter table public.purchase_master_items
  add column if not exists waste_percent numeric(6,2) not null default 0,
  add column if not exists manual_unit_cost numeric(14,6);

create table if not exists public.purchase_product_numier_links (
  id uuid primary key default gen_random_uuid(),
  master_item_id uuid not null references public.purchase_master_items(id) on delete cascade,
  numier_article_code text not null,
  numier_article_name text,
  sale_price numeric(12,4) not null default 0,
  quantity_factor numeric(14,6) not null default 1,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(master_item_id,numier_article_code)
);
create index if not exists idx_purchase_product_numier_links_master on public.purchase_product_numier_links(master_item_id);
create index if not exists idx_purchase_product_numier_links_code on public.purchase_product_numier_links(numier_article_code);

-- Migra los vínculos únicos ya existentes sin perder información.
insert into public.purchase_product_numier_links(master_item_id,numier_article_code,numier_article_name,sale_price,is_primary)
select id,numier_article_code,numier_article_name,coalesce(sale_price,0),true
from public.purchase_master_items
where nullif(trim(coalesce(numier_article_code,'')),'') is not null
on conflict(master_item_id,numier_article_code) do update set
  numier_article_name=excluded.numier_article_name,
  sale_price=excluded.sale_price,
  is_primary=true,
  updated_at=now();

create table if not exists public.profitability_recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  numier_article_code text not null,
  numier_article_name text,
  sale_price numeric(12,4) not null default 0,
  yield_quantity numeric(12,4) not null default 1,
  yield_unit text not null default 'ración',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(numier_article_code)
);

create table if not exists public.profitability_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.profitability_recipes(id) on delete cascade,
  master_item_id uuid not null references public.purchase_master_items(id) on delete restrict,
  quantity numeric(14,6) not null check(quantity > 0),
  unit text not null default 'g',
  waste_percent numeric(6,2),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_recipe_ingredients_recipe on public.profitability_recipe_ingredients(recipe_id);
create index if not exists idx_recipe_ingredients_master on public.profitability_recipe_ingredients(master_item_id);

alter table public.purchase_product_numier_links enable row level security;
alter table public.profitability_recipes enable row level security;
alter table public.profitability_recipe_ingredients enable row level security;

-- El ERP actual usa acceso anon controlado por su propia clave de gerente.
do $$ begin
 create policy "erp all purchase numier links" on public.purchase_product_numier_links for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
 create policy "erp all profitability recipes" on public.profitability_recipes for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
 create policy "erp all profitability ingredients" on public.profitability_recipe_ingredients for all using (true) with check (true);
exception when duplicate_object then null; end $$;

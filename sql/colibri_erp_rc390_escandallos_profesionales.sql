-- COLIBRÍ ERP PRO · RC 3.9.0
-- Escandallos profesionales, versionado y guardado atómico.

create extension if not exists pgcrypto;

alter table public.profitability_recipes
  add column if not exists category text,
  add column if not exists notes text,
  add column if not exists target_margin_pct numeric(6,2) not null default 65,
  add column if not exists extra_cost_percent numeric(6,2) not null default 0,
  add column if not exists version integer not null default 1;

alter table public.profitability_recipe_ingredients
  add column if not exists notes text;

update public.profitability_recipes
set category = coalesce(nullif(trim(category), ''), 'Plato'),
    target_margin_pct = least(95, greatest(0, coalesce(target_margin_pct, 65))),
    extra_cost_percent = least(100, greatest(0, coalesce(extra_cost_percent, 0))),
    version = greatest(1, coalesce(version, 1));

alter table public.profitability_recipes
  drop constraint if exists profitability_recipes_target_margin_check,
  add constraint profitability_recipes_target_margin_check check (target_margin_pct between 0 and 95),
  drop constraint if exists profitability_recipes_extra_cost_check,
  add constraint profitability_recipes_extra_cost_check check (extra_cost_percent between 0 and 100),
  drop constraint if exists profitability_recipes_version_check,
  add constraint profitability_recipes_version_check check (version >= 1),
  drop constraint if exists profitability_recipes_yield_check,
  add constraint profitability_recipes_yield_check check (yield_quantity > 0);

alter table public.profitability_recipe_ingredients
  drop constraint if exists profitability_recipe_ingredients_waste_check,
  add constraint profitability_recipe_ingredients_waste_check
    check (waste_percent is null or waste_percent between 0 and 95),
  drop constraint if exists profitability_recipe_ingredients_unit_check,
  add constraint profitability_recipe_ingredients_unit_check
    check (unit in ('g', 'kg', 'ml', 'l', 'ud'));

create index if not exists idx_profitability_recipes_active_name
  on public.profitability_recipes(active, lower(name));
create index if not exists idx_profitability_recipes_category
  on public.profitability_recipes(category) where active = true;
create index if not exists idx_profitability_recipe_ingredients_order
  on public.profitability_recipe_ingredients(recipe_id, position);
create index if not exists idx_purchase_items_master_created
  on public.purchase_invoice_items(master_item_id, created_at desc)
  where master_item_id is not null and net_total > 0;

create table if not exists public.profitability_recipe_versions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.profitability_recipes(id) on delete cascade,
  version integer not null check (version >= 1),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(recipe_id, version)
);

create index if not exists idx_profitability_recipe_versions_recipe
  on public.profitability_recipe_versions(recipe_id, version desc);

alter table public.profitability_recipe_versions enable row level security;
drop policy if exists "erp all profitability recipe versions" on public.profitability_recipe_versions;
create policy "erp all profitability recipe versions"
  on public.profitability_recipe_versions
  for all to anon, authenticated
  using (true)
  with check (true);

-- La aplicación existente utiliza la clave anónima detrás de su acceso de gerente.
-- Se mantienen los permisos actuales de RC 3.8.0, explicitando los roles necesarios.
drop policy if exists "erp all profitability recipes" on public.profitability_recipes;
create policy "erp all profitability recipes"
  on public.profitability_recipes
  for all to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "erp all profitability ingredients" on public.profitability_recipe_ingredients;
create policy "erp all profitability ingredients"
  on public.profitability_recipe_ingredients
  for all to anon, authenticated
  using (true)
  with check (true);

create or replace function public.set_profitability_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profitability_recipes_updated_at on public.profitability_recipes;
create trigger trg_profitability_recipes_updated_at
before update on public.profitability_recipes
for each row execute function public.set_profitability_updated_at();

drop trigger if exists trg_purchase_product_numier_links_updated_at on public.purchase_product_numier_links;
create trigger trg_purchase_product_numier_links_updated_at
before update on public.purchase_product_numier_links
for each row execute function public.set_profitability_updated_at();

create or replace function public.save_profitability_recipe(
  p_recipe jsonb,
  p_ingredients jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_recipe_id uuid;
  v_version integer;
  v_ingredient_count integer;
begin
  if nullif(trim(p_recipe->>'name'), '') is null then
    raise exception 'El nombre del escandallo es obligatorio';
  end if;
  if nullif(trim(p_recipe->>'numier_article_code'), '') is null then
    raise exception 'El artículo NUMIER es obligatorio';
  end if;
  if coalesce((p_recipe->>'yield_quantity')::numeric, 0) <= 0 then
    raise exception 'El rendimiento debe ser mayor que cero';
  end if;
  if jsonb_typeof(coalesce(p_ingredients, '[]'::jsonb)) <> 'array' then
    raise exception 'Los ingredientes deben enviarse como una lista';
  end if;

  select count(*) into v_ingredient_count
  from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) ingredient
  where nullif(ingredient->>'master_item_id', '') is not null
    and coalesce((ingredient->>'quantity')::numeric, 0) > 0;

  if v_ingredient_count = 0 then
    raise exception 'El escandallo debe contener al menos un ingrediente válido';
  end if;

  if nullif(p_recipe->>'id', '') is null then
    insert into public.profitability_recipes (
      name, numier_article_code, numier_article_name, sale_price,
      yield_quantity, yield_unit, category, notes,
      target_margin_pct, extra_cost_percent, active, version
    ) values (
      trim(p_recipe->>'name'),
      trim(p_recipe->>'numier_article_code'),
      nullif(trim(p_recipe->>'numier_article_name'), ''),
      greatest(0, coalesce((p_recipe->>'sale_price')::numeric, 0)),
      (p_recipe->>'yield_quantity')::numeric,
      coalesce(nullif(trim(p_recipe->>'yield_unit'), ''), 'ración'),
      coalesce(nullif(trim(p_recipe->>'category'), ''), 'Plato'),
      nullif(trim(p_recipe->>'notes'), ''),
      least(95, greatest(0, coalesce((p_recipe->>'target_margin_pct')::numeric, 65))),
      least(100, greatest(0, coalesce((p_recipe->>'extra_cost_percent')::numeric, 0))),
      coalesce((p_recipe->>'active')::boolean, true),
      1
    )
    returning id, version into v_recipe_id, v_version;
  else
    v_recipe_id := (p_recipe->>'id')::uuid;
    update public.profitability_recipes
    set name = trim(p_recipe->>'name'),
        numier_article_code = trim(p_recipe->>'numier_article_code'),
        numier_article_name = nullif(trim(p_recipe->>'numier_article_name'), ''),
        sale_price = greatest(0, coalesce((p_recipe->>'sale_price')::numeric, 0)),
        yield_quantity = (p_recipe->>'yield_quantity')::numeric,
        yield_unit = coalesce(nullif(trim(p_recipe->>'yield_unit'), ''), 'ración'),
        category = coalesce(nullif(trim(p_recipe->>'category'), ''), 'Plato'),
        notes = nullif(trim(p_recipe->>'notes'), ''),
        target_margin_pct = least(95, greatest(0, coalesce((p_recipe->>'target_margin_pct')::numeric, 65))),
        extra_cost_percent = least(100, greatest(0, coalesce((p_recipe->>'extra_cost_percent')::numeric, 0))),
        active = coalesce((p_recipe->>'active')::boolean, true),
        version = version + 1
    where id = v_recipe_id
    returning version into v_version;

    if not found then
      raise exception 'El escandallo que intentas actualizar ya no existe';
    end if;

    delete from public.profitability_recipe_ingredients where recipe_id = v_recipe_id;
  end if;

  insert into public.profitability_recipe_ingredients (
    recipe_id, master_item_id, quantity, unit, waste_percent, notes, position
  )
  select
    v_recipe_id,
    (ingredient->>'master_item_id')::uuid,
    (ingredient->>'quantity')::numeric,
    ingredient->>'unit',
    case when nullif(ingredient->>'waste_percent', '') is null then null else (ingredient->>'waste_percent')::numeric end,
    nullif(trim(ingredient->>'notes'), ''),
    (ordinality - 1)::integer
  from jsonb_array_elements(p_ingredients) with ordinality as rows(ingredient, ordinality);

  insert into public.profitability_recipe_versions(recipe_id, version, snapshot)
  select
    recipe.id,
    recipe.version,
    jsonb_build_object(
      'recipe', to_jsonb(recipe),
      'ingredients', coalesce((
        select jsonb_agg(to_jsonb(ingredient) order by ingredient.position)
        from public.profitability_recipe_ingredients ingredient
        where ingredient.recipe_id = recipe.id
      ), '[]'::jsonb)
    )
  from public.profitability_recipes recipe
  where recipe.id = v_recipe_id
  on conflict (recipe_id, version) do update set snapshot = excluded.snapshot;

  return v_recipe_id;
end;
$$;

revoke all on function public.save_profitability_recipe(jsonb, jsonb) from public;
grant execute on function public.save_profitability_recipe(jsonb, jsonb) to anon, authenticated;

-- Registra una instantánea inicial de los escandallos creados en RC anteriores.
insert into public.profitability_recipe_versions(recipe_id, version, snapshot)
select
  recipe.id,
  recipe.version,
  jsonb_build_object(
    'recipe', to_jsonb(recipe),
    'ingredients', coalesce((
      select jsonb_agg(to_jsonb(ingredient) order by ingredient.position)
      from public.profitability_recipe_ingredients ingredient
      where ingredient.recipe_id = recipe.id
    ), '[]'::jsonb)
  )
from public.profitability_recipes recipe
on conflict (recipe_id, version) do nothing;

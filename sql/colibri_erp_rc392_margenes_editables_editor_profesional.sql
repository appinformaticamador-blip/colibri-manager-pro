-- COLIBRI ERP PRO · RC 3.9.2
-- Márgenes editables auditables, borradores, publicación, subrecetas y restauración.
-- Migración aditiva y compatible con RC 3.8.0 / 3.9.0 / 3.9.1.

begin;

create extension if not exists pgcrypto;

alter table public.purchase_master_items
  add column if not exists manual_unit_cost_reason text,
  add column if not exists manual_unit_cost_updated_at timestamptz,
  add column if not exists manual_unit_cost_updated_by text,
  add column if not exists excluded_from_margin boolean not null default false,
  add column if not exists excluded_reason text,
  add column if not exists excluded_at timestamptz,
  add column if not exists excluded_by text;

update public.purchase_master_items
set manual_unit_cost = null
where manual_unit_cost is not null and manual_unit_cost <= 0;

alter table public.purchase_master_items
  drop constraint if exists purchase_master_items_manual_unit_cost_check,
  add constraint purchase_master_items_manual_unit_cost_check
    check (manual_unit_cost is null or manual_unit_cost > 0);

alter table public.profitability_recipes
  add column if not exists fixed_cost numeric(14,6) not null default 0,
  add column if not exists manual_cost numeric(14,6),
  add column if not exists manual_cost_reason text,
  add column if not exists manual_cost_updated_at timestamptz,
  add column if not exists manual_cost_updated_by text,
  add column if not exists excluded_from_margin boolean not null default false,
  add column if not exists excluded_reason text,
  add column if not exists excluded_at timestamptz,
  add column if not exists excluded_by text,
  add column if not exists status text not null default 'published',
  add column if not exists draft_payload jsonb,
  add column if not exists draft_ingredients jsonb,
  add column if not exists draft_updated_at timestamptz,
  add column if not exists draft_updated_by text,
  add column if not exists published_at timestamptz,
  add column if not exists published_by text;

alter table public.profitability_recipes
  drop constraint if exists profitability_recipes_fixed_cost_check,
  add constraint profitability_recipes_fixed_cost_check check (fixed_cost >= 0),
  drop constraint if exists profitability_recipes_manual_cost_check,
  add constraint profitability_recipes_manual_cost_check check (manual_cost is null or manual_cost > 0),
  drop constraint if exists profitability_recipes_status_check,
  add constraint profitability_recipes_status_check check (status in ('draft', 'published'));

-- Un borrador puede existir antes de seleccionar el producto final NUMIER.
alter table public.profitability_recipes alter column numier_article_code drop not null;
alter table public.profitability_recipes drop constraint if exists profitability_recipes_numier_article_code_key;
create unique index if not exists uq_profitability_recipes_numier_article_code
  on public.profitability_recipes(numier_article_code)
  where nullif(trim(numier_article_code), '') is not null and active = true;

update public.profitability_recipes
set status = coalesce(status, 'published'),
    published_at = coalesce(published_at, updated_at, created_at),
    fixed_cost = greatest(0, coalesce(fixed_cost, 0));

alter table public.profitability_recipe_ingredients
  alter column master_item_id drop not null,
  add column if not exists subrecipe_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profitability_recipe_ingredients_subrecipe_id_fkey'
      and conrelid = 'public.profitability_recipe_ingredients'::regclass
  ) then
    alter table public.profitability_recipe_ingredients
      add constraint profitability_recipe_ingredients_subrecipe_id_fkey
      foreign key (subrecipe_id) references public.profitability_recipes(id) on delete restrict;
  end if;
end $$;

alter table public.profitability_recipe_ingredients
  drop constraint if exists profitability_recipe_ingredients_source_check,
  add constraint profitability_recipe_ingredients_source_check
    check ((master_item_id is not null) <> (subrecipe_id is not null));

create index if not exists idx_recipe_ingredients_subrecipe
  on public.profitability_recipe_ingredients(subrecipe_id)
  where subrecipe_id is not null;
create index if not exists idx_master_items_margin_control
  on public.purchase_master_items(excluded_from_margin, active);
create index if not exists idx_recipes_margin_control
  on public.profitability_recipes(excluded_from_margin, status, active);

alter table public.profitability_recipe_versions
  add column if not exists published_by text,
  add column if not exists cost_total numeric(14,6),
  add column if not exists margin_pct numeric(8,3),
  add column if not exists sale_price numeric(14,6);

create table if not exists public.profitability_cost_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('master_item', 'recipe')),
  entity_id uuid not null,
  event_type text not null check (event_type in ('manual_cost_set', 'automatic_cost_restored', 'excluded', 'included')),
  previous_cost numeric(14,6),
  new_cost numeric(14,6),
  reason text not null check (length(trim(reason)) > 0),
  actor text not null check (length(trim(actor)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_profitability_cost_events_entity
  on public.profitability_cost_events(entity_type, entity_id, created_at desc);

alter table public.profitability_cost_events enable row level security;
drop policy if exists "erp all profitability cost events" on public.profitability_cost_events;
create policy "erp all profitability cost events"
  on public.profitability_cost_events for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "erp all purchase master items" on public.purchase_master_items;
create policy "erp all purchase master items"
  on public.purchase_master_items for all to anon, authenticated
  using (true) with check (true);

create or replace function public.set_profitability_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_purchase_master_items_updated_at on public.purchase_master_items;
create trigger trg_purchase_master_items_updated_at
before update on public.purchase_master_items
for each row execute function public.set_profitability_updated_at();

drop trigger if exists trg_profitability_recipes_updated_at on public.profitability_recipes;
create trigger trg_profitability_recipes_updated_at
before update on public.profitability_recipes
for each row execute function public.set_profitability_updated_at();

create or replace function public.set_profitability_cost_control(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_manual_cost numeric default null,
  p_reason text default null,
  p_actor text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_previous numeric;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_actor text := nullif(trim(coalesce(p_actor, '')), '');
  v_event text;
begin
  if p_entity_type not in ('master_item', 'recipe') then
    raise exception 'Tipo de entidad no válido';
  end if;
  if p_action not in ('set_manual', 'restore_auto', 'exclude', 'include') then
    raise exception 'Acción de control no válida';
  end if;
  if v_actor is null then raise exception 'El usuario es obligatorio'; end if;
  if p_action in ('set_manual', 'exclude') and v_reason is null then
    raise exception 'El motivo es obligatorio';
  end if;
  if p_action = 'set_manual' and coalesce(p_manual_cost, 0) <= 0 then
    raise exception 'El coste manual debe ser mayor que cero';
  end if;

  if p_entity_type = 'master_item' then
    select manual_unit_cost into v_previous from public.purchase_master_items where id = p_entity_id for update;
    if not found then raise exception 'El artículo maestro no existe'; end if;
    update public.purchase_master_items set
      manual_unit_cost = case when p_action = 'set_manual' then p_manual_cost when p_action = 'restore_auto' then null else manual_unit_cost end,
      manual_unit_cost_reason = case when p_action = 'set_manual' then v_reason when p_action = 'restore_auto' then null else manual_unit_cost_reason end,
      manual_unit_cost_updated_at = case when p_action in ('set_manual', 'restore_auto') then now() else manual_unit_cost_updated_at end,
      manual_unit_cost_updated_by = case when p_action in ('set_manual', 'restore_auto') then v_actor else manual_unit_cost_updated_by end,
      excluded_from_margin = case when p_action = 'exclude' then true when p_action = 'include' then false else excluded_from_margin end,
      excluded_reason = case when p_action = 'exclude' then v_reason when p_action = 'include' then null else excluded_reason end,
      excluded_at = case when p_action = 'exclude' then now() when p_action = 'include' then null else excluded_at end,
      excluded_by = case when p_action = 'exclude' then v_actor when p_action = 'include' then null else excluded_by end
    where id = p_entity_id;
  else
    select manual_cost into v_previous from public.profitability_recipes where id = p_entity_id for update;
    if not found then raise exception 'El escandallo no existe'; end if;
    update public.profitability_recipes set
      manual_cost = case when p_action = 'set_manual' then p_manual_cost when p_action = 'restore_auto' then null else manual_cost end,
      manual_cost_reason = case when p_action = 'set_manual' then v_reason when p_action = 'restore_auto' then null else manual_cost_reason end,
      manual_cost_updated_at = case when p_action in ('set_manual', 'restore_auto') then now() else manual_cost_updated_at end,
      manual_cost_updated_by = case when p_action in ('set_manual', 'restore_auto') then v_actor else manual_cost_updated_by end,
      excluded_from_margin = case when p_action = 'exclude' then true when p_action = 'include' then false else excluded_from_margin end,
      excluded_reason = case when p_action = 'exclude' then v_reason when p_action = 'include' then null else excluded_reason end,
      excluded_at = case when p_action = 'exclude' then now() when p_action = 'include' then null else excluded_at end,
      excluded_by = case when p_action = 'exclude' then v_actor when p_action = 'include' then null else excluded_by end
    where id = p_entity_id;
  end if;

  v_event := case p_action when 'set_manual' then 'manual_cost_set' when 'restore_auto' then 'automatic_cost_restored' when 'exclude' then 'excluded' else 'included' end;
  insert into public.profitability_cost_events(entity_type, entity_id, event_type, previous_cost, new_cost, reason, actor)
  values (p_entity_type, p_entity_id, v_event, v_previous,
    case when p_action = 'set_manual' then p_manual_cost when p_action = 'restore_auto' then null else v_previous end,
    coalesce(v_reason, case when p_action = 'include' then 'Producto incluido de nuevo' else 'Coste automático restaurado' end), v_actor);
end;
$$;

create or replace function public.save_profitability_recipe_draft(
  p_recipe jsonb,
  p_ingredients jsonb,
  p_actor text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare v_recipe_id uuid;
begin
  if jsonb_typeof(coalesce(p_ingredients, '[]'::jsonb)) <> 'array' then
    raise exception 'Los ingredientes deben enviarse como una lista';
  end if;
  if nullif(p_recipe->>'id', '') is null then
    insert into public.profitability_recipes(name, numier_article_code, status, active, draft_payload, draft_ingredients, draft_updated_at, draft_updated_by)
    values (coalesce(nullif(trim(p_recipe->>'name'), ''), 'Escandallo sin título'), nullif(trim(p_recipe->>'numier_article_code'), ''), 'draft', true, p_recipe - 'id', p_ingredients, now(), nullif(trim(p_actor), ''))
    returning id into v_recipe_id;
  else
    v_recipe_id := (p_recipe->>'id')::uuid;
    update public.profitability_recipes set
      draft_payload = p_recipe - 'id', draft_ingredients = p_ingredients,
      draft_updated_at = now(), draft_updated_by = nullif(trim(p_actor), ''),
      status = case when published_at is null then 'draft' else status end
    where id = v_recipe_id;
    if not found then raise exception 'El escandallo ya no existe'; end if;
  end if;
  return v_recipe_id;
end;
$$;

create or replace function public.publish_profitability_recipe(
  p_recipe jsonb,
  p_ingredients jsonb,
  p_metrics jsonb default '{}'::jsonb,
  p_actor text default 'Usuario ERP'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_recipe_id uuid;
  v_version integer;
  v_valid integer;
  v_has_cycle boolean;
begin
  if nullif(trim(p_recipe->>'name'), '') is null then raise exception 'El nombre es obligatorio'; end if;
  if nullif(trim(p_recipe->>'numier_article_code'), '') is null then raise exception 'El artículo NUMIER es obligatorio'; end if;
  if coalesce((p_recipe->>'yield_quantity')::numeric, 0) <= 0 then raise exception 'El rendimiento debe ser mayor que cero'; end if;
  if jsonb_typeof(coalesce(p_ingredients, '[]'::jsonb)) <> 'array' then raise exception 'Los ingredientes deben enviarse como una lista'; end if;

  select count(*) into v_valid from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) item
  where ((nullif(item->>'master_item_id', '') is not null) <> (nullif(item->>'subrecipe_id', '') is not null))
    and coalesce((item->>'quantity')::numeric, 0) > 0
    and item->>'unit' in ('g', 'kg', 'ml', 'l', 'ud');
  if v_valid = 0 or v_valid <> jsonb_array_length(p_ingredients) then raise exception 'Revisa los ingredientes incompletos'; end if;

  if nullif(p_recipe->>'id', '') is null then
    insert into public.profitability_recipes(name, numier_article_code, numier_article_name, sale_price, yield_quantity, yield_unit, category, notes, target_margin_pct, extra_cost_percent, fixed_cost, active, status, version, published_at, published_by)
    values (trim(p_recipe->>'name'), trim(p_recipe->>'numier_article_code'), nullif(trim(p_recipe->>'numier_article_name'), ''), greatest(0, coalesce((p_recipe->>'sale_price')::numeric, 0)), (p_recipe->>'yield_quantity')::numeric, coalesce(nullif(trim(p_recipe->>'yield_unit'), ''), 'ración'), coalesce(nullif(trim(p_recipe->>'category'), ''), 'Plato'), nullif(trim(p_recipe->>'notes'), ''), least(95, greatest(0, coalesce((p_recipe->>'target_margin_pct')::numeric, 65))), least(100, greatest(0, coalesce((p_recipe->>'extra_cost_percent')::numeric, 0))), greatest(0, coalesce((p_recipe->>'fixed_cost')::numeric, 0)), coalesce((p_recipe->>'active')::boolean, true), 'published', 1, now(), nullif(trim(p_actor), ''))
    returning id into v_recipe_id;
  else
    v_recipe_id := (p_recipe->>'id')::uuid;
    if exists (select 1 from jsonb_array_elements(p_ingredients) i where nullif(i->>'subrecipe_id', '')::uuid = v_recipe_id) then raise exception 'Un escandallo no puede contenerse a sí mismo'; end if;
    select coalesce(max(version), 0) + 1 into v_version from public.profitability_recipe_versions where recipe_id = v_recipe_id;
    update public.profitability_recipes set
      name=trim(p_recipe->>'name'), numier_article_code=trim(p_recipe->>'numier_article_code'), numier_article_name=nullif(trim(p_recipe->>'numier_article_name'), ''), sale_price=greatest(0, coalesce((p_recipe->>'sale_price')::numeric, 0)), yield_quantity=(p_recipe->>'yield_quantity')::numeric, yield_unit=coalesce(nullif(trim(p_recipe->>'yield_unit'), ''), 'ración'), category=coalesce(nullif(trim(p_recipe->>'category'), ''), 'Plato'), notes=nullif(trim(p_recipe->>'notes'), ''), target_margin_pct=least(95, greatest(0, coalesce((p_recipe->>'target_margin_pct')::numeric, 65))), extra_cost_percent=least(100, greatest(0, coalesce((p_recipe->>'extra_cost_percent')::numeric, 0))), fixed_cost=greatest(0, coalesce((p_recipe->>'fixed_cost')::numeric, 0)), active=coalesce((p_recipe->>'active')::boolean, true), status='published', version=v_version, published_at=now(), published_by=nullif(trim(p_actor), ''), draft_payload=null, draft_ingredients=null, draft_updated_at=null, draft_updated_by=null
    where id=v_recipe_id;
    if not found then raise exception 'El escandallo ya no existe'; end if;
  end if;

  -- Valida el grafo propuesto antes de reemplazar los ingredientes publicados.
  with recursive edges(parent_id, child_id) as (
    select recipe_id, subrecipe_id from public.profitability_recipe_ingredients
      where subrecipe_id is not null and recipe_id <> v_recipe_id
    union all
    select v_recipe_id, (item->>'subrecipe_id')::uuid from jsonb_array_elements(p_ingredients) item
      where nullif(item->>'subrecipe_id', '') is not null
  ), walk(node_id, path, cycle) as (
    select child_id, array[v_recipe_id, child_id], child_id = v_recipe_id from edges where parent_id = v_recipe_id
    union all
    select e.child_id, w.path || e.child_id, e.child_id = any(w.path)
    from walk w join edges e on e.parent_id = w.node_id where not w.cycle
  ) select coalesce(bool_or(cycle), false) into v_has_cycle from walk;
  if v_has_cycle then raise exception 'La subreceta crea una referencia circular'; end if;

  delete from public.profitability_recipe_ingredients where recipe_id = v_recipe_id;
  insert into public.profitability_recipe_ingredients(recipe_id, master_item_id, subrecipe_id, quantity, unit, waste_percent, notes, position)
  select v_recipe_id, nullif(item->>'master_item_id', '')::uuid, nullif(item->>'subrecipe_id', '')::uuid,
    (item->>'quantity')::numeric, item->>'unit', nullif(item->>'waste_percent', '')::numeric,
    nullif(trim(item->>'notes'), ''), (ordinality - 1)::integer
  from jsonb_array_elements(p_ingredients) with ordinality rows(item, ordinality);

  select version into v_version from public.profitability_recipes where id = v_recipe_id;
  insert into public.profitability_recipe_versions(recipe_id, version, snapshot, published_by, cost_total, margin_pct, sale_price)
  select r.id, r.version, jsonb_build_object('recipe', to_jsonb(r), 'ingredients', coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.profitability_recipe_ingredients i where i.recipe_id=r.id), '[]'::jsonb)),
    nullif(trim(p_actor), ''), nullif(p_metrics->>'cost_total', '')::numeric, nullif(p_metrics->>'margin_pct', '')::numeric, nullif(p_metrics->>'sale_price', '')::numeric
  from public.profitability_recipes r where r.id=v_recipe_id
  on conflict(recipe_id, version) do update set snapshot=excluded.snapshot, published_by=excluded.published_by, cost_total=excluded.cost_total, margin_pct=excluded.margin_pct, sale_price=excluded.sale_price;
  return v_recipe_id;
end;
$$;

create or replace function public.restore_profitability_recipe_version(
  p_recipe_id uuid,
  p_version integer,
  p_actor text default 'Usuario ERP'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare v_snapshot jsonb; v_recipe jsonb;
begin
  select snapshot into v_snapshot from public.profitability_recipe_versions where recipe_id=p_recipe_id and version=p_version;
  if v_snapshot is null then raise exception 'La versión solicitada no existe'; end if;
  v_recipe := (v_snapshot->'recipe') || jsonb_build_object('id', p_recipe_id);
  return public.publish_profitability_recipe(v_recipe, v_snapshot->'ingredients', '{}'::jsonb, p_actor || ' · restauración v' || p_version);
end;
$$;

-- Mantiene compatibles los clientes RC 3.9.0.
create or replace function public.save_profitability_recipe(p_recipe jsonb, p_ingredients jsonb)
returns uuid language sql security invoker set search_path = public as $$
  select public.publish_profitability_recipe(p_recipe, p_ingredients, '{}'::jsonb, 'Cliente RC 3.9.0');
$$;

revoke all on function public.set_profitability_cost_control(text, uuid, text, numeric, text, text) from public;
revoke all on function public.save_profitability_recipe_draft(jsonb, jsonb, text) from public;
revoke all on function public.publish_profitability_recipe(jsonb, jsonb, jsonb, text) from public;
revoke all on function public.restore_profitability_recipe_version(uuid, integer, text) from public;
grant execute on function public.set_profitability_cost_control(text, uuid, text, numeric, text, text) to anon, authenticated;
grant execute on function public.save_profitability_recipe_draft(jsonb, jsonb, text) to anon, authenticated;
grant execute on function public.publish_profitability_recipe(jsonb, jsonb, jsonb, text) to anon, authenticated;
grant execute on function public.restore_profitability_recipe_version(uuid, integer, text) to anon, authenticated;
grant execute on function public.save_profitability_recipe(jsonb, jsonb) to anon, authenticated;

commit;

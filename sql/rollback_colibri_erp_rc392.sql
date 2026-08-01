-- ROLLBACK RC 3.9.2
-- Ejecutar solo después de desplegar un frontend RC 3.9.1.
-- Se detiene si existen subrecetas, borradores o controles manuales nuevos para no perder datos.

begin;

do $$
begin
  if exists (select 1 from public.profitability_recipe_ingredients where subrecipe_id is not null)
     or exists (select 1 from public.profitability_recipes where draft_payload is not null or draft_ingredients is not null)
     or exists (select 1 from public.profitability_cost_events) then
    raise exception 'Rollback cancelado: exporta o elimina primero los datos creados con RC 3.9.2';
  end if;
  if exists (
    select numier_article_code from public.profitability_recipes
    where nullif(trim(numier_article_code), '') is not null
    group by numier_article_code having count(*) > 1
  ) then
    raise exception 'Rollback cancelado: existen códigos NUMIER duplicados permitidos por el archivado de RC 3.9.2';
  end if;
end $$;

drop function if exists public.restore_profitability_recipe_version(uuid, integer, text);
drop function if exists public.publish_profitability_recipe(jsonb, jsonb, jsonb, text);
drop function if exists public.save_profitability_recipe_draft(jsonb, jsonb, text);
drop function if exists public.set_profitability_cost_control(text, uuid, text, numeric, text, text);
drop table if exists public.profitability_cost_events;

drop index if exists public.idx_recipe_ingredients_subrecipe;
drop index if exists public.idx_master_items_margin_control;
drop index if exists public.idx_recipes_margin_control;
drop index if exists public.uq_profitability_recipes_numier_article_code;

alter table public.profitability_recipe_ingredients drop constraint if exists profitability_recipe_ingredients_source_check;
alter table public.profitability_recipe_ingredients drop constraint if exists profitability_recipe_ingredients_subrecipe_id_fkey;
alter table public.profitability_recipe_ingredients drop column if exists subrecipe_id;
alter table public.profitability_recipe_ingredients alter column master_item_id set not null;

alter table public.profitability_recipe_versions
  drop column if exists published_by,
  drop column if exists cost_total,
  drop column if exists margin_pct,
  drop column if exists sale_price;

delete from public.profitability_recipes where nullif(trim(numier_article_code), '') is null;
alter table public.profitability_recipes alter column numier_article_code set not null;
alter table public.profitability_recipes add constraint profitability_recipes_numier_article_code_key unique(numier_article_code);
alter table public.profitability_recipes
  drop column if exists fixed_cost,
  drop column if exists manual_cost,
  drop column if exists manual_cost_reason,
  drop column if exists manual_cost_updated_at,
  drop column if exists manual_cost_updated_by,
  drop column if exists excluded_from_margin,
  drop column if exists excluded_reason,
  drop column if exists excluded_at,
  drop column if exists excluded_by,
  drop column if exists status,
  drop column if exists draft_payload,
  drop column if exists draft_ingredients,
  drop column if exists draft_updated_at,
  drop column if exists draft_updated_by,
  drop column if exists published_at,
  drop column if exists published_by;

alter table public.purchase_master_items
  drop constraint if exists purchase_master_items_manual_unit_cost_check,
  drop column if exists manual_unit_cost_reason,
  drop column if exists manual_unit_cost_updated_at,
  drop column if exists manual_unit_cost_updated_by,
  drop column if exists excluded_from_margin,
  drop column if exists excluded_reason,
  drop column if exists excluded_at,
  drop column if exists excluded_by;

commit;

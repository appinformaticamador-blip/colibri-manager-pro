-- Colibrí ERP · Inteligencia por beneficio y costes manuales de artículos NUMIER
create table if not exists public.profitability_article_costs (
  article_code text primary key,
  manual_unit_cost numeric(14,4),
  reason text,
  updated_by text,
  updated_at timestamptz not null default now(),
  excluded_from_margin boolean not null default false
);

alter table public.profitability_article_costs enable row level security;

drop policy if exists "profitability_article_costs_read" on public.profitability_article_costs;
create policy "profitability_article_costs_read" on public.profitability_article_costs
for select using (true);

drop policy if exists "profitability_article_costs_write" on public.profitability_article_costs;
create policy "profitability_article_costs_write" on public.profitability_article_costs
for all using (true) with check (true);

create index if not exists profitability_article_costs_updated_idx
on public.profitability_article_costs(updated_at desc);

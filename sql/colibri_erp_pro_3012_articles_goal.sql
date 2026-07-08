-- Colibrí ERP PRO 3.0.1.2
-- Objetivo inteligente +10% y catálogo de artículos NUMIER.
-- No borra datos existentes.

create table if not exists public.numier_articles (
  id uuid primary key default gen_random_uuid(),
  article_code text not null unique,
  article_name text not null,
  family text,
  category_code text,
  category_name text,
  price numeric default 0,
  iva numeric default 0,
  active boolean default true,
  updated_at timestamptz default now()
);

alter table public.numier_articles enable row level security;

drop policy if exists "allow all numier_articles" on public.numier_articles;
create policy "allow all numier_articles"
on public.numier_articles for all using (true) with check (true);

create index if not exists idx_numier_articles_code on public.numier_articles(article_code);
create index if not exists idx_numier_articles_name on public.numier_articles(article_name);
create index if not exists idx_numier_articles_family on public.numier_articles(family);

-- Configuración simple del objetivo de crecimiento para futuras pantallas de configuración.
create table if not exists public.erp_business_settings (
  id text primary key default 'default',
  growth_target numeric default 0.10,
  default_daily_goal numeric default 750,
  updated_at timestamptz default now()
);

insert into public.erp_business_settings(id,growth_target,default_daily_goal)
values ('default',0.10,750)
on conflict (id) do update set
  growth_target = excluded.growth_target,
  default_daily_goal = excluded.default_daily_goal,
  updated_at = now();

alter table public.erp_business_settings enable row level security;

drop policy if exists "allow all erp_business_settings" on public.erp_business_settings;
create policy "allow all erp_business_settings"
on public.erp_business_settings for all using (true) with check (true);

notify pgrst, 'reload schema';

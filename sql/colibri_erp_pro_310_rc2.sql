-- Colibrí ERP PRO 3.1.0 RC2
-- Consolidación: cuentas rápidas mesa 0, auditoría N/X/G, gestoría, ticket PRO.
-- Seguro: no borra datos existentes.

-- Catálogo de artículos NUMIER
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
create policy "allow all numier_articles" on public.numier_articles for all using (true) with check (true);

create index if not exists idx_numier_articles_code on public.numier_articles(article_code);
create index if not exists idx_numier_articles_name on public.numier_articles(article_name);
create index if not exists idx_numier_articles_family on public.numier_articles(family);

-- Estado del servicio LIVE
create table if not exists public.numier_open_accounts (
  id uuid primary key default gen_random_uuid(),
  cab_id bigint not null unique,
  mesa text,
  mesa_numero integer,
  zona text check (zona in ('terraza','salon','barra')),
  opened_at timestamptz,
  numdoc text,
  status text default 'P',
  total numeric default 0,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.numier_open_accounts enable row level security;
drop policy if exists "allow all numier_open_accounts" on public.numier_open_accounts;
create policy "allow all numier_open_accounts" on public.numier_open_accounts for all using (true) with check (true);

create index if not exists idx_numier_open_accounts_last_seen on public.numier_open_accounts(last_seen_at desc);
create index if not exists idx_numier_open_accounts_zona on public.numier_open_accounts(zona);

create table if not exists public.numier_service_status (
  status_key text primary key default 'service',
  updated_at timestamptz default now()
);

alter table public.numier_service_status enable row level security;
drop policy if exists "allow all numier_service_status" on public.numier_service_status;
create policy "allow all numier_service_status" on public.numier_service_status for all using (true) with check (true);

-- Auditoría operativa NUMIER: N/X/G no suman como venta ni pendiente.
create table if not exists public.numier_audit_events (
  id uuid primary key default gen_random_uuid(),
  cab_id bigint not null unique,
  estado text not null,
  mesa text,
  mesa_numero integer,
  zona text,
  hora timestamptz,
  numdoc text,
  total numeric default 0,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.numier_audit_events enable row level security;
drop policy if exists "allow all numier_audit_events" on public.numier_audit_events;
create policy "allow all numier_audit_events" on public.numier_audit_events for all using (true) with check (true);

create index if not exists idx_numier_audit_events_hora on public.numier_audit_events(hora desc);
create index if not exists idx_numier_audit_events_estado on public.numier_audit_events(estado);

-- Configuración de negocio / objetivo IA
create table if not exists public.erp_business_settings (
  id text primary key default 'default',
  growth_target numeric default 0.10,
  default_daily_goal numeric default 750,
  updated_at timestamptz default now()
);

insert into public.erp_business_settings(id,growth_target,default_daily_goal)
values ('default',0.10,750)
on conflict (id) do update set growth_target=excluded.growth_target, default_daily_goal=excluded.default_daily_goal, updated_at=now();

alter table public.erp_business_settings enable row level security;
drop policy if exists "allow all erp_business_settings" on public.erp_business_settings;
create policy "allow all erp_business_settings" on public.erp_business_settings for all using (true) with check (true);

notify pgrst, 'reload schema';

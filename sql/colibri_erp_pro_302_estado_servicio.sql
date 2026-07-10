-- Colibrí ERP PRO 3.0.2 · Estado del Servicio LIVE
-- Ejecutar en Supabase SQL Editor antes de compilar el nuevo Engine.

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

create index if not exists idx_numier_open_accounts_last_seen
on public.numier_open_accounts(last_seen_at desc);

create index if not exists idx_numier_open_accounts_zona
on public.numier_open_accounts(zona);

create table if not exists public.numier_service_status (
  status_key text primary key default 'service',
  updated_at timestamptz default now()
);

alter table public.numier_open_accounts enable row level security;
alter table public.numier_service_status enable row level security;

drop policy if exists "allow all numier_open_accounts" on public.numier_open_accounts;
create policy "allow all numier_open_accounts"
on public.numier_open_accounts for all using (true) with check (true);

drop policy if exists "allow all numier_service_status" on public.numier_service_status;
create policy "allow all numier_service_status"
on public.numier_service_status for all using (true) with check (true);

notify pgrst, 'reload schema';

create table if not exists public.numier_tickets (
  id text primary key,
  restaurant_id text not null default 'braseria-el-colibri',
  cab_id text,
  numdoc text,
  ticket_date timestamptz,
  total numeric,
  payment_method text,
  raw jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.numier_sync_log (
  id bigserial primary key,
  restaurant_id text not null default 'braseria-el-colibri',
  status text not null,
  message text,
  tickets_processed int default 0,
  created_at timestamptz not null default now()
);

alter table public.numier_tickets enable row level security;
alter table public.numier_sync_log enable row level security;

drop policy if exists "numier_tickets_read" on public.numier_tickets;
create policy "numier_tickets_read" on public.numier_tickets for select using (true);

drop policy if exists "numier_tickets_insert" on public.numier_tickets;
create policy "numier_tickets_insert" on public.numier_tickets for insert with check (true);

drop policy if exists "numier_tickets_update" on public.numier_tickets;
create policy "numier_tickets_update" on public.numier_tickets for update using (true) with check (true);

drop policy if exists "numier_sync_log_read" on public.numier_sync_log;
create policy "numier_sync_log_read" on public.numier_sync_log for select using (true);

drop policy if exists "numier_sync_log_insert" on public.numier_sync_log;
create policy "numier_sync_log_insert" on public.numier_sync_log for insert with check (true);

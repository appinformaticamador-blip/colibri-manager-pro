-- Colibrí ERP - NUMIER Dashboard v5.2
-- Añade compatibilidad con Colibrí Sync 2.2 y el selector de días anteriores.

create extension if not exists pgcrypto;

create table if not exists public.numier_sync_files (
  id uuid primary key default gen_random_uuid(),
  source text default 'numier',
  file_name text not null unique,
  file_path text,
  file_size bigint,
  modified_at timestamptz,
  checksum text,
  records_sent integer default 0,
  status text default 'ok',
  error_message text,
  synced_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.numier_sync_files add column if not exists source text default 'numier';
alter table public.numier_sync_files add column if not exists file_name text;
alter table public.numier_sync_files add column if not exists file_size bigint;
alter table public.numier_sync_files add column if not exists modified_at timestamptz;
alter table public.numier_sync_files add column if not exists synced_at timestamptz default now();

create unique index if not exists idx_numier_sync_files_file_name_unique on public.numier_sync_files(file_name);

create table if not exists public.numier_daily_sales (
  business_date date primary key,
  total_sales numeric(12,2) default 0,
  total_cash numeric(12,2) default 0,
  total_card numeric(12,2) default 0,
  ticket_count integer default 0,
  average_ticket numeric(12,2) default 0,
  updated_at timestamptz default now()
);

alter table public.numier_sync_files enable row level security;
alter table public.numier_daily_sales enable row level security;

drop policy if exists "anon read numier_sync_files" on public.numier_sync_files;
drop policy if exists "anon insert numier_sync_files" on public.numier_sync_files;
drop policy if exists "anon update numier_sync_files" on public.numier_sync_files;
create policy "anon read numier_sync_files" on public.numier_sync_files for select to anon using (true);
create policy "anon insert numier_sync_files" on public.numier_sync_files for insert to anon with check (true);
create policy "anon update numier_sync_files" on public.numier_sync_files for update to anon using (true) with check (true);

drop policy if exists "anon read numier_daily_sales" on public.numier_daily_sales;
drop policy if exists "anon insert numier_daily_sales" on public.numier_daily_sales;
drop policy if exists "anon update numier_daily_sales" on public.numier_daily_sales;
create policy "anon read numier_daily_sales" on public.numier_daily_sales for select to anon using (true);
create policy "anon insert numier_daily_sales" on public.numier_daily_sales for insert to anon with check (true);
create policy "anon update numier_daily_sales" on public.numier_daily_sales for update to anon using (true) with check (true);

notify pgrst, 'reload schema';

create table if not exists public.numier_sync_log (
  id uuid primary key default gen_random_uuid(),
  source_file text not null,
  file_size bigint,
  modified_at_numier timestamptz,
  synced_at timestamptz default now(),
  status text default 'detected',
  created_at timestamptz default now()
);

alter table public.numier_sync_log enable row level security;

drop policy if exists "allow numier sync insert" on public.numier_sync_log;
create policy "allow numier sync insert" on public.numier_sync_log
for insert with check (true);

drop policy if exists "allow numier sync read" on public.numier_sync_log;
create policy "allow numier sync read" on public.numier_sync_log
for select using (true);

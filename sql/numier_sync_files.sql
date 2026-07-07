create table if not exists public.numier_sync_files (
  id uuid primary key default gen_random_uuid(),
  source text default 'numier',
  file_name text not null,
  file_size bigint,
  modified_at timestamptz,
  synced_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.numier_sync_files enable row level security;

drop policy if exists "allow anon insert numier_sync_files" on public.numier_sync_files;
create policy "allow anon insert numier_sync_files"
on public.numier_sync_files for insert
to anon
with check (true);

drop policy if exists "allow anon read numier_sync_files" on public.numier_sync_files;
create policy "allow anon read numier_sync_files"
on public.numier_sync_files for select
to anon
using (true);

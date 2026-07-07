create table if not exists public.numier_raw_records (
  id bigserial primary key,
  source_file text not null,
  record_index integer not null,
  payload jsonb not null,
  synced_at timestamptz default now(),
  unique(source_file, record_index)
);

alter table public.numier_raw_records enable row level security;

drop policy if exists "numier raw insert anon" on public.numier_raw_records;
create policy "numier raw insert anon"
on public.numier_raw_records
for insert
to anon
with check (true);

drop policy if exists "numier raw update anon" on public.numier_raw_records;
create policy "numier raw update anon"
on public.numier_raw_records
for update
to anon
using (true)
with check (true);

drop policy if exists "numier raw select anon" on public.numier_raw_records;
create policy "numier raw select anon"
on public.numier_raw_records
for select
to anon
using (true);

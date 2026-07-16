-- RC 3.9.3 · Colibrí Sync Guardian
create table if not exists public.colibri_runtime_status (
  status_key text primary key,
  component text not null default 'sync',
  business_name text,
  machine_name text,
  equipment_name text,
  version text,
  state text not null default 'UNKNOWN',
  process_running boolean not null default false,
  sync_running boolean,
  numier_running boolean,
  internet_ok boolean,
  pending_items integer not null default 0,
  last_error text,
  started_at timestamptz,
  last_sync_restart_at timestamptz,
  last_numier_restart_at timestamptz,
  heartbeat_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.colibri_runtime_status enable row level security;

drop policy if exists "runtime status readable" on public.colibri_runtime_status;
create policy "runtime status readable" on public.colibri_runtime_status
for select to anon, authenticated using (true);

drop policy if exists "runtime status upsert anon" on public.colibri_runtime_status;
create policy "runtime status upsert anon" on public.colibri_runtime_status
for insert to anon, authenticated with check (true);

drop policy if exists "runtime status update anon" on public.colibri_runtime_status;
create policy "runtime status update anon" on public.colibri_runtime_status
for update to anon, authenticated using (true) with check (true);

create or replace function public.touch_colibri_runtime_status()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_colibri_runtime_status on public.colibri_runtime_status;
create trigger trg_touch_colibri_runtime_status
before update on public.colibri_runtime_status
for each row execute function public.touch_colibri_runtime_status();

create index if not exists idx_colibri_runtime_status_heartbeat
on public.colibri_runtime_status (heartbeat_at desc);

create table if not exists public.numier_sync_status (
  status_key text primary key default 'numier',
  business_name text default 'Brasería El Colibrí',
  mode text default 'SINCRONIZANDO',
  progress_percent numeric default 0,
  processed_tickets bigint default 0,
  total_tickets bigint default 0,
  pending_tickets bigint default 0,
  last_cab_id bigint default 0,
  max_cab_id bigint default 0,
  last_batch_tickets integer default 0,
  last_batch_lines integer default 0,
  message text,
  updated_at timestamptz default now()
);

alter table public.numier_sync_status enable row level security;

drop policy if exists "allow all numier_sync_status" on public.numier_sync_status;
create policy "allow all numier_sync_status"
on public.numier_sync_status for all using (true) with check (true);

insert into public.numier_sync_status(status_key,business_name,mode,progress_percent,message,updated_at)
values('numier','Brasería El Colibrí','SINCRONIZANDO',0,'Pendiente de sincronización',now())
on conflict (status_key) do update set updated_at=excluded.updated_at;

notify pgrst, 'reload schema';

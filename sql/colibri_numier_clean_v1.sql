-- Colibrí ERP - NUMIER clean schema v1
-- Ejecutar en Supabase SQL Editor.

drop table if exists public.numier_ticket_lines cascade;
drop table if exists public.numier_tickets cascade;
drop table if exists public.numier_daily_sales cascade;
drop table if exists public.numier_sync_files cascade;
drop table if exists public.numier_dbf_schema cascade;

create table public.numier_sync_files (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'numier',
  file_name text not null,
  file_size bigint,
  modified_at timestamptz,
  synced_at timestamptz default now(),
  unique(source, file_name)
);

create table public.numier_dbf_schema (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'numier',
  dbf_table text not null,
  field_name text not null,
  field_type text,
  field_length integer,
  field_decimal integer,
  created_at timestamptz default now(),
  unique(source, dbf_table, field_name)
);

create table public.numier_tickets (
  id uuid primary key default gen_random_uuid(),
  cab_id bigint not null unique,
  fecha date,
  hora timestamptz,
  estado text,
  forma_pago text,
  numdoc text,
  total numeric default 0,
  efectivo numeric default 0,
  tarjeta numeric default 0,
  cheque numeric default 0,
  raw_json jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.numier_ticket_lines (
  id uuid primary key default gen_random_uuid(),
  cab_id bigint not null,
  line_key text not null unique,
  articulo text,
  descripcion text,
  cantidad numeric,
  precio numeric,
  importe numeric,
  iva numeric,
  raw_json jsonb,
  created_at timestamptz default now()
);

create table public.numier_daily_sales (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  total numeric default 0,
  tickets integer default 0,
  ticket_medio numeric default 0,
  efectivo numeric default 0,
  tarjeta numeric default 0,
  cheque numeric default 0,
  updated_at timestamptz default now()
);

create or replace function public.rebuild_numier_daily_sales()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.numier_daily_sales;
  insert into public.numier_daily_sales(fecha,total,tickets,ticket_medio,efectivo,tarjeta,cheque,updated_at)
  select
    fecha,
    coalesce(sum(total),0),
    count(*),
    case when count(*) = 0 then 0 else coalesce(sum(total),0) / count(*) end,
    coalesce(sum(efectivo),0),
    coalesce(sum(tarjeta),0),
    coalesce(sum(cheque),0),
    now()
  from public.numier_tickets
  where fecha is not null
  group by fecha
  on conflict (fecha) do update set
    total = excluded.total,
    tickets = excluded.tickets,
    ticket_medio = excluded.ticket_medio,
    efectivo = excluded.efectivo,
    tarjeta = excluded.tarjeta,
    cheque = excluded.cheque,
    updated_at = now();
end;
$$;

alter table public.numier_sync_files enable row level security;
alter table public.numier_dbf_schema enable row level security;
alter table public.numier_tickets enable row level security;
alter table public.numier_ticket_lines enable row level security;
alter table public.numier_daily_sales enable row level security;

create policy "allow all numier_sync_files" on public.numier_sync_files for all using (true) with check (true);
create policy "allow all numier_dbf_schema" on public.numier_dbf_schema for all using (true) with check (true);
create policy "allow all numier_tickets" on public.numier_tickets for all using (true) with check (true);
create policy "allow all numier_ticket_lines" on public.numier_ticket_lines for all using (true) with check (true);
create policy "allow all numier_daily_sales" on public.numier_daily_sales for all using (true) with check (true);

notify pgrst, 'reload schema';

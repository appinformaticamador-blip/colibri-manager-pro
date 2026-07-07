-- Colibrí ERP - NUMIER Sync v2
-- Crea las tablas limpias para tickets, líneas, resumen diario y estado de sincronización.

drop table if exists public.numier_ticket_lines cascade;
drop table if exists public.numier_tickets cascade;
drop table if exists public.numier_daily_sales cascade;
drop table if exists public.numier_sync_files cascade;

create table public.numier_sync_files (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'numier',
  file_name text not null,
  file_size bigint,
  modified_at timestamptz,
  synced_at timestamptz default now(),
  unique (source, file_name)
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
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.numier_ticket_lines (
  id uuid primary key default gen_random_uuid(),
  cab_id bigint not null references public.numier_tickets(cab_id) on delete cascade,
  line_key text not null unique,
  articulo text,
  descripcion text,
  cantidad numeric default 0,
  precio numeric default 0,
  importe numeric default 0,
  iva numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
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

create or replace function public.refresh_numier_daily_sales(p_fecha date)
returns void
language plpgsql
as $$
begin
  insert into public.numier_daily_sales(fecha,total,tickets,ticket_medio,efectivo,tarjeta,cheque,updated_at)
  select
    p_fecha,
    coalesce(sum(total),0),
    count(*)::int,
    case when count(*) > 0 then coalesce(sum(total),0) / count(*) else 0 end,
    coalesce(sum(efectivo),0),
    coalesce(sum(tarjeta),0),
    coalesce(sum(cheque),0),
    now()
  from public.numier_tickets
  where fecha = p_fecha
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

create or replace function public.trg_refresh_numier_daily_sales()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    perform public.refresh_numier_daily_sales(new.fecha);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.refresh_numier_daily_sales(old.fecha);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists refresh_daily_sales_on_ticket on public.numier_tickets;
create trigger refresh_daily_sales_on_ticket
after insert or update or delete on public.numier_tickets
for each row execute function public.trg_refresh_numier_daily_sales();

alter table public.numier_sync_files enable row level security;
alter table public.numier_tickets enable row level security;
alter table public.numier_ticket_lines enable row level security;
alter table public.numier_daily_sales enable row level security;

create policy "allow all numier_sync_files" on public.numier_sync_files for all using (true) with check (true);
create policy "allow all numier_tickets" on public.numier_tickets for all using (true) with check (true);
create policy "allow all numier_ticket_lines" on public.numier_ticket_lines for all using (true) with check (true);
create policy "allow all numier_daily_sales" on public.numier_daily_sales for all using (true) with check (true);

notify pgrst, 'reload schema';

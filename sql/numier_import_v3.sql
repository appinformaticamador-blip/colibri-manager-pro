create table if not exists public.numier_sync_files (
  id uuid primary key default gen_random_uuid(),
  source text default 'numier',
  file_name text not null,
  file_size bigint,
  modified_at timestamptz,
  synced_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.numier_tickets (
  id uuid primary key default gen_random_uuid(),
  cab_id bigint not null unique,
  numdoc text,
  fecha date,
  hora timestamptz,
  estado text,
  forma_pago text,
  total numeric(12,2) default 0,
  efectivo numeric(12,2) default 0,
  tarjeta numeric(12,2) default 0,
  cheque numeric(12,2) default 0,
  mesa numeric,
  comensales numeric,
  raw jsonb,
  synced_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.numier_ticket_lines (
  id uuid primary key default gen_random_uuid(),
  cab_id bigint not null references public.numier_tickets(cab_id) on delete cascade,
  line_hash text not null,
  articulo text,
  cantidad numeric(12,3),
  importe numeric(12,2),
  precio numeric(12,2),
  iva numeric(10,2),
  descripcion text,
  raw jsonb,
  synced_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(cab_id, line_hash)
);

create table if not exists public.numier_daily_sales (
  fecha date primary key,
  total numeric(12,2) default 0,
  tickets integer default 0,
  ticket_medio numeric(12,2) default 0,
  efectivo numeric(12,2) default 0,
  tarjeta numeric(12,2) default 0,
  cheque numeric(12,2) default 0,
  updated_at timestamptz default now()
);

create or replace function public.refresh_numier_daily_sales(p_fecha date)
returns void language sql security definer as $$
  insert into public.numier_daily_sales(fecha,total,tickets,ticket_medio,efectivo,tarjeta,cheque,updated_at)
  select p_fecha,
         coalesce(sum(total),0),
         count(*),
         case when count(*)=0 then 0 else round(coalesce(sum(total),0)/count(*),2) end,
         coalesce(sum(efectivo),0), coalesce(sum(tarjeta),0), coalesce(sum(cheque),0), now()
  from public.numier_tickets
  where fecha = p_fecha and estado = 'C'
  on conflict(fecha) do update set
    total=excluded.total, tickets=excluded.tickets, ticket_medio=excluded.ticket_medio,
    efectivo=excluded.efectivo, tarjeta=excluded.tarjeta, cheque=excluded.cheque,
    updated_at=now();
$$;

alter table public.numier_sync_files enable row level security;
alter table public.numier_tickets enable row level security;
alter table public.numier_ticket_lines enable row level security;
alter table public.numier_daily_sales enable row level security;

drop policy if exists "anon all numier_sync_files" on public.numier_sync_files;
create policy "anon all numier_sync_files" on public.numier_sync_files for all to anon using (true) with check (true);
drop policy if exists "anon all numier_tickets" on public.numier_tickets;
create policy "anon all numier_tickets" on public.numier_tickets for all to anon using (true) with check (true);
drop policy if exists "anon all numier_ticket_lines" on public.numier_ticket_lines;
create policy "anon all numier_ticket_lines" on public.numier_ticket_lines for all to anon using (true) with check (true);
drop policy if exists "anon all numier_daily_sales" on public.numier_daily_sales;
create policy "anon all numier_daily_sales" on public.numier_daily_sales for all to anon using (true) with check (true);

notify pgrst, 'reload schema';

-- Colibrí ERP v2.3 Business Intelligence
-- Ejecutar en Supabase SQL Editor. No borra datos.

alter table public.numier_tickets add column if not exists imported_at timestamptz default now();
alter table public.numier_ticket_lines add column if not exists imported_at timestamptz default now();

create index if not exists idx_numier_tickets_hora on public.numier_tickets(hora);
create index if not exists idx_numier_tickets_fecha on public.numier_tickets(fecha);
create index if not exists idx_numier_tickets_cab_id on public.numier_tickets(cab_id);
create index if not exists idx_numier_lines_cab_id on public.numier_ticket_lines(cab_id);
create index if not exists idx_clock_records_created_at on public.clock_records(created_at);

create table if not exists public.daily_business_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  total numeric default 0,
  tickets integer default 0,
  ticket_medio numeric default 0,
  efectivo numeric default 0,
  tarjeta numeric default 0,
  cheque numeric default 0,
  top_product text,
  top_product_units numeric default 0,
  top_revenue_product text,
  top_revenue numeric default 0,
  staff_cost_hour numeric default 7,
  generated_at timestamptz default now()
);

alter table public.daily_business_reports enable row level security;
drop policy if exists "allow all daily_business_reports" on public.daily_business_reports;
create policy "allow all daily_business_reports" on public.daily_business_reports for all using (true) with check (true);

create or replace function public.generate_daily_business_report(p_date date)
returns public.daily_business_reports
language plpgsql
security definer
as $$
declare
  r public.daily_business_reports;
  p1 record;
  p2 record;
begin
  select coalesce(sum(total),0), count(*), coalesce(avg(total),0), coalesce(sum(efectivo),0), coalesce(sum(tarjeta),0), coalesce(sum(cheque),0)
  into r.total, r.tickets, r.ticket_medio, r.efectivo, r.tarjeta, r.cheque
  from public.numier_tickets
  where fecha = p_date;

  select l.descripcion as name, sum(l.cantidad) as qty, sum(l.importe) as total
  into p1
  from public.numier_ticket_lines l
  join public.numier_tickets t on t.cab_id = l.cab_id
  where t.fecha = p_date
  group by l.descripcion
  order by sum(l.cantidad) desc nulls last
  limit 1;

  select l.descripcion as name, sum(l.cantidad) as qty, sum(l.importe) as total
  into p2
  from public.numier_ticket_lines l
  join public.numier_tickets t on t.cab_id = l.cab_id
  where t.fecha = p_date
  group by l.descripcion
  order by sum(l.importe) desc nulls last
  limit 1;

  insert into public.daily_business_reports(report_date,total,tickets,ticket_medio,efectivo,tarjeta,cheque,top_product,top_product_units,top_revenue_product,top_revenue,generated_at)
  values(p_date,r.total,r.tickets,r.ticket_medio,r.efectivo,r.tarjeta,r.cheque,p1.name,coalesce(p1.qty,0),p2.name,coalesce(p2.total,0),now())
  on conflict(report_date) do update set
    total=excluded.total,
    tickets=excluded.tickets,
    ticket_medio=excluded.ticket_medio,
    efectivo=excluded.efectivo,
    tarjeta=excluded.tarjeta,
    cheque=excluded.cheque,
    top_product=excluded.top_product,
    top_product_units=excluded.top_product_units,
    top_revenue_product=excluded.top_revenue_product,
    top_revenue=excluded.top_revenue,
    generated_at=now()
  returning * into r;
  return r;
end;
$$;

notify pgrst, 'reload schema';

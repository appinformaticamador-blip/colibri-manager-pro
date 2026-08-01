create table if not exists public.numier_cash_closures (
  fecha date primary key,
  fondo_inicial numeric(12,2) not null default 0,
  entradas numeric(12,2) not null default 0,
  salidas numeric(12,2) not null default 0,
  ventas_total numeric(12,2) not null default 0,
  ventas_efectivo numeric(12,2) not null default 0,
  ventas_tarjeta numeric(12,2) not null default 0,
  tickets integer not null default 0,
  ticket_medio numeric(12,2) not null default 0,
  efectivo_esperado numeric(12,2) not null default 0,
  efectivo_contado numeric(12,2) not null default 0,
  tarjeta_datafono numeric(12,2) not null default 0,
  diferencia_efectivo numeric(12,2) not null default 0,
  diferencia_tarjeta numeric(12,2) not null default 0,
  responsable text,
  notas text,
  estado text not null default 'REVISAR',
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.numier_cash_closures enable row level security;
drop policy if exists "numier_cash_closures_all" on public.numier_cash_closures;
create policy "numier_cash_closures_all" on public.numier_cash_closures for all using (true) with check (true);
grant select,insert,update,delete on public.numier_cash_closures to anon, authenticated;

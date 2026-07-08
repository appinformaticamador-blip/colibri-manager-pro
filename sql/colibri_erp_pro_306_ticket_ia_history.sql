-- Colibrí ERP PRO 3.0.6
-- Ticket PRO + soporte de IA histórica.
-- No borra datos existentes.

create or replace view public.colibri_ia_daily_history as
select
  fecha,
  extract(year from fecha)::int as year,
  extract(month from fecha)::int as month,
  extract(dow from fecha)::int as dow,
  total,
  tickets,
  ticket_medio,
  efectivo,
  tarjeta,
  cheque,
  updated_at
from public.numier_daily_sales
where total is not null;

grant select on public.colibri_ia_daily_history to anon, authenticated;

create or replace view public.colibri_ia_hourly_history as
select
  date(hora) as fecha,
  extract(hour from hora)::int as hour,
  count(*)::int as tickets,
  coalesce(sum(total),0)::numeric as total,
  case when count(*) > 0 then coalesce(sum(total),0) / count(*) else 0 end::numeric as ticket_medio
from public.numier_tickets
where hora is not null
  and estado = 'C'
group by date(hora), extract(hour from hora);

grant select on public.colibri_ia_hourly_history to anon, authenticated;

notify pgrst, 'reload schema';

-- COLIBRÍ ERP PRO - RC 3.3.2
-- Cuadrantes: fuente única real en Supabase mediante una fila JSON por semana.

create table if not exists public.work_schedule_weeks (
  id bigserial primary key,
  restaurant_id text not null default 'colibri',
  week_id text not null,
  data jsonb not null default '{}'::jsonb,
  employees jsonb not null default '[]'::jsonb,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, week_id)
);

create index if not exists idx_work_schedule_weeks_restaurant_week
on public.work_schedule_weeks (restaurant_id, week_id);

alter table public.work_schedule_weeks enable row level security;

drop policy if exists "work_schedule_weeks_public_read" on public.work_schedule_weeks;
drop policy if exists "work_schedule_weeks_public_write" on public.work_schedule_weeks;

create policy "work_schedule_weeks_public_read"
on public.work_schedule_weeks for select
using (true);

create policy "work_schedule_weeks_public_write"
on public.work_schedule_weeks for all
using (true)
with check (true);

-- Migración opcional desde la tabla por filas de RC 3.3.1 si ya existían datos.
insert into public.work_schedule_weeks (restaurant_id, week_id, data, employees, revision, updated_at)
select
  restaurant_id,
  week_id,
  jsonb_object_agg(day_name, day_data) as data,
  '[]'::jsonb as employees,
  1,
  now()
from (
  select restaurant_id, week_id, day_name,
    jsonb_object_agg(slot_label, employees order by slot_index) as day_data
  from (
    select restaurant_id, week_id, day_name, day_index, slot_label, slot_index,
      jsonb_agg(employee_id order by position) as employees
    from public.work_schedules
    group by restaurant_id, week_id, day_name, day_index, slot_label, slot_index
  ) s
  group by restaurant_id, week_id, day_name, day_index
) d
group by restaurant_id, week_id
on conflict (restaurant_id, week_id) do nothing;

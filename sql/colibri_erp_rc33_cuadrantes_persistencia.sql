-- COLIBRÍ ERP PRO - RC 3.3
-- Persistencia de cuadrantes en Supabase

create table if not exists public.work_schedule_employees (
  id bigserial primary key,
  restaurant_id text not null default 'colibri',
  employee_id text not null,
  name text not null,
  category text default 'Sala',
  color text default '#607d8b',
  active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, employee_id)
);

create table if not exists public.work_schedules (
  id bigserial primary key,
  restaurant_id text not null default 'colibri',
  week_id text not null,
  day_name text not null,
  day_index integer not null,
  slot_label text not null,
  slot_index integer not null,
  employee_id text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, week_id, day_index, slot_index, employee_id)
);

create index if not exists idx_work_schedules_restaurant_week
on public.work_schedules (restaurant_id, week_id, day_index, slot_index);

create index if not exists idx_work_schedules_employee
on public.work_schedules (restaurant_id, employee_id);

alter table public.work_schedule_employees enable row level security;
alter table public.work_schedules enable row level security;

drop policy if exists "work_schedule_employees_public_read" on public.work_schedule_employees;
drop policy if exists "work_schedule_employees_public_write" on public.work_schedule_employees;
drop policy if exists "work_schedules_public_read" on public.work_schedules;
drop policy if exists "work_schedules_public_write" on public.work_schedules;

create policy "work_schedule_employees_public_read"
on public.work_schedule_employees for select
using (true);

create policy "work_schedule_employees_public_write"
on public.work_schedule_employees for all
using (true)
with check (true);

create policy "work_schedules_public_read"
on public.work_schedules for select
using (true);

create policy "work_schedules_public_write"
on public.work_schedules for all
using (true)
with check (true);

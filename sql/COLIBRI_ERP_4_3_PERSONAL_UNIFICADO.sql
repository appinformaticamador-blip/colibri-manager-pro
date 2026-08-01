-- COLIBRÍ ERP 4.3 · Personal unificado
-- Seguro e idempotente. No elimina empleados, fichajes ni cuadrantes.

alter table if exists public.employees add column if not exists role text default 'Sala';
alter table if exists public.employees add column if not exists color text default '#31b9d4';
alter table if exists public.employees add column if not exists hourly_rate numeric(10,2) default 7;
alter table if exists public.employees add column if not exists can_clock boolean default true;
alter table if exists public.employees add column if not exists active boolean default true;
alter table if exists public.employees add column if not exists updated_at timestamptz default now();

update public.employees set hourly_rate=7 where hourly_rate is null or hourly_rate=0;
update public.employees set role='Sala' where role is null or btrim(role)='';
update public.employees set color='#31b9d4' where color is null or btrim(color)='';
update public.employees set can_clock=true where can_clock is null;
update public.employees set active=true where active is null;

create index if not exists employees_active_name_idx on public.employees(active,name);
create index if not exists clock_records_employee_created_idx on public.clock_records(employee_id,created_at desc);
create index if not exists clock_records_name_created_idx on public.clock_records(employee_name,created_at desc);
create index if not exists schedule_restaurant_week_idx on public.work_schedule_weeks(restaurant_id,week_id);

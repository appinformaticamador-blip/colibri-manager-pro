-- COLIBRÍ ERP 4.4 CORE · Personal + Rentabilidad unificada
-- Seguro para ejecutar varias veces. No elimina datos.
create extension if not exists pgcrypto;

alter table if exists public.employees add column if not exists hourly_rate numeric(12,4) not null default 7;
alter table if exists public.employees add column if not exists role text default 'Sala';
alter table if exists public.employees add column if not exists color text default '#31b9d4';
alter table if exists public.employees add column if not exists can_clock boolean not null default true;
alter table if exists public.employees add column if not exists active boolean not null default true;

create table if not exists public.business_fixed_expenses (
 id uuid primary key default gen_random_uuid(), name text not null, category text,
 monthly_amount numeric(12,2) not null check(monthly_amount>=0), start_date date not null,
 end_date date, notes text, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(end_date is null or end_date>=start_date)
);
create table if not exists public.business_variable_expenses (
 id uuid primary key default gen_random_uuid(), name text not null, category text,
 expense_date date not null, amount numeric(12,2) not null check(amount>=0),
 payment_method text, notes text, created_at timestamptz not null default now()
);
create index if not exists idx_fixed_expense_dates on public.business_fixed_expenses(start_date,end_date);
create index if not exists idx_variable_expense_date on public.business_variable_expenses(expense_date);
create index if not exists idx_clock_employee_date on public.clock_records(employee_id,created_at);

alter table public.business_fixed_expenses enable row level security;
alter table public.business_variable_expenses enable row level security;
do $$ begin create policy "erp fixed expenses all" on public.business_fixed_expenses for all using(true) with check(true); exception when duplicate_object then null; end $$;
do $$ begin create policy "erp variable expenses all" on public.business_variable_expenses for all using(true) with check(true); exception when duplicate_object then null; end $$;

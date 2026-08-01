-- COLIBRÍ ERP · Rentabilidad real, gastos y pagos de personal
create extension if not exists pgcrypto;

create table if not exists public.business_fixed_expenses (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 category text,
 monthly_amount numeric(12,2) not null check (monthly_amount >= 0),
 start_date date not null,
 end_date date,
 notes text,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (end_date is null or end_date >= start_date)
);

create table if not exists public.business_variable_expenses (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 category text,
 expense_date date not null,
 amount numeric(12,2) not null check (amount >= 0),
 payment_method text,
 notes text,
 created_at timestamptz not null default now()
);

create table if not exists public.employee_cost_profiles (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null unique,
 employee_name text not null,
 hourly_cost numeric(12,4) not null default 0 check (hourly_cost >= 0),
 payment_frequency text not null default 'variable',
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.employee_payments (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null,
 employee_name text not null,
 period_start date not null,
 period_end date not null,
 payment_date date not null,
 amount numeric(12,2) not null check (amount > 0),
 payment_method text not null,
 payment_type text not null,
 notes text,
 created_at timestamptz not null default now(),
 check (period_end >= period_start)
);

create index if not exists idx_fixed_expense_dates on public.business_fixed_expenses(start_date,end_date);
create index if not exists idx_variable_expense_date on public.business_variable_expenses(expense_date);
create index if not exists idx_employee_payment_date on public.employee_payments(payment_date);
create index if not exists idx_employee_payment_period on public.employee_payments(employee_id,period_start,period_end);

alter table public.business_fixed_expenses enable row level security;
alter table public.business_variable_expenses enable row level security;
alter table public.employee_cost_profiles enable row level security;
alter table public.employee_payments enable row level security;

do $$ begin
 create policy "erp fixed expenses all" on public.business_fixed_expenses for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
 create policy "erp variable expenses all" on public.business_variable_expenses for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
 create policy "erp employee costs all" on public.employee_cost_profiles for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
 create policy "erp employee payments all" on public.employee_payments for all using (true) with check (true);
exception when duplicate_object then null; end $$;

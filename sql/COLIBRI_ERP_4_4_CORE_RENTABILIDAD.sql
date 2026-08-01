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

-- Identidad y ciclo de vida del empleado.
alter table if exists public.employees add column if not exists hire_date date default current_date;
alter table if exists public.employees add column if not exists termination_date date;
alter table if exists public.employees add column if not exists updated_at timestamptz default now();

-- Datos completos de gastos variables.
alter table if exists public.business_variable_expenses add column if not exists supplier text;
alter table if exists public.business_variable_expenses add column if not exists receipt_url text;
alter table if exists public.business_variable_expenses add column if not exists updated_at timestamptz default now();

-- Cierre transaccional de un turno abierto. Evita cierres huérfanos y conserva auditoría.
create or replace function public.close_employee_open_shift(
 p_employee_id uuid,
 p_closed_at timestamptz default now(),
 p_reason text default 'Cierre manual por gerencia'
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
 v_employee public.employees%rowtype;
 v_open public.clock_records%rowtype;
 v_last_type text;
begin
 select * into v_employee from public.employees where id=p_employee_id;
 if not found then return jsonb_build_object('ok',false,'message','Empleado no encontrado'); end if;

 select type into v_last_type from public.clock_records
 where employee_id=p_employee_id order by created_at desc,id desc limit 1;
 if coalesce(lower(v_last_type),'')<>'entrada' then
  return jsonb_build_object('ok',false,'message','El empleado no tiene un turno abierto');
 end if;

 select * into v_open from public.clock_records
 where employee_id=p_employee_id and lower(type)='entrada'
 order by created_at desc,id desc limit 1;
 if p_closed_at < v_open.created_at then
  return jsonb_build_object('ok',false,'message','La salida no puede ser anterior a la entrada');
 end if;

 insert into public.clock_records(employee_id,employee_name,type,method,inside_radius,note,created_at)
 values(v_employee.id,v_employee.name,'salida','manual',true,
        'SALIDA MANUAL POR GERENCIA · '||coalesce(nullif(btrim(p_reason),''),'Sin motivo'),p_closed_at);
 return jsonb_build_object('ok',true,'message','Turno cerrado','employee_id',v_employee.id,'closed_at',p_closed_at);
end $$;
grant execute on function public.close_employee_open_shift(uuid,timestamptz,text) to anon,authenticated;

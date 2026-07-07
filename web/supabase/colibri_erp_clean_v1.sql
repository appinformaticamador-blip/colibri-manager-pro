-- COLIBRI ERP 1.0 - MIGRACIÓN LIMPIA
-- ADVERTENCIA: elimina tablas antiguas de pruebas de Colibrí ERP.

create extension if not exists pgcrypto;

drop function if exists registrar_fichaje_v2(text,text,text,text,double precision,double precision,double precision,text);
drop function if exists registrar_fichaje(text,text,text,text);
drop table if exists time_compare cascade;
drop table if exists time_reports cascade;
drop table if exists schedule_slots cascade;
drop table if exists schedules cascade;
drop table if exists clock_records cascade;
drop table if exists time_clock cascade;
drop table if exists sales_daily cascade;
drop table if exists sales_tickets cascade;
drop table if exists sales cascade;
drop table if exists employees cascade;
drop table if exists settings cascade;

create table settings (
  id int primary key default 1,
  company_name text not null default 'Brasería El Colibrí',
  bar_lat double precision not null default 37.3800974,
  bar_lng double precision not null default -5.9837951,
  gps_radius_m int not null default 75,
  qr_secret text not null default 'COLIBRI_BAR_QR_2026',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint only_one_settings check (id=1)
);
insert into settings (id) values (1) on conflict (id) do nothing;

create table employees (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  pin text not null,
  role text not null default 'empleado',
  color text default '#19b394',
  phone text,
  can_clock boolean default true,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into employees (name,pin,role,color,can_clock,active) values
('Sonia','1313','empleado','#29b6f6',true,true),
('Álvaro','1001','empleado','#66bb6a',true,true),
('Jose','1002','empleado','#ffa726',true,true),
('Kathy','1003','empleado','#ec407a',true,true),
('Orlando','1004','empleado','#ab47bc',true,true),
('Pablo','1005','empleado','#ffee58',true,true)
on conflict (name) do update set pin=excluded.pin, role=excluded.role, color=excluded.color, can_clock=excluded.can_clock, active=excluded.active;

create table clock_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete set null,
  employee_name text not null,
  type text not null check (type in ('entrada','salida')),
  method text not null default 'gps' check (method in ('gps','qr','manual')),
  gps_lat double precision,
  gps_lng double precision,
  accuracy_m double precision,
  distance_m double precision,
  inside_radius boolean,
  note text,
  created_at timestamptz default now()
);

create table schedules (
  id uuid primary key default gen_random_uuid(),
  week_code text not null,
  title text,
  created_at timestamptz default now(),
  unique(week_code)
);

create table schedule_slots (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references schedules(id) on delete cascade,
  day_name text not null,
  slot text not null,
  employee_id uuid references employees(id) on delete cascade,
  created_at timestamptz default now(),
  unique(schedule_id, day_name, slot, employee_id)
);

create table time_reports (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete set null,
  employee_name text not null,
  week_code text not null,
  whatsapp_text text,
  declared_hours numeric default 0,
  scheduled_hours numeric default 0,
  difference_hours numeric default 0,
  status text,
  created_at timestamptz default now()
);

create table sales_daily (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  total numeric default 0,
  cash numeric default 0,
  card numeric default 0,
  mixed numeric default 0,
  tickets int default 0,
  avg_ticket numeric default 0,
  source text default 'numier',
  created_at timestamptz default now()
);

create table sales_tickets (
  id uuid primary key default gen_random_uuid(),
  numdoc text,
  date timestamptz,
  payment_method text,
  total numeric default 0,
  iva10 numeric default 0,
  iva21 numeric default 0,
  source text default 'numier',
  created_at timestamptz default now()
);

create or replace function haversine_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    pow(sin(radians(lat2-lat1)/2),2) + cos(radians(lat1))*cos(radians(lat2))*pow(sin(radians(lon2-lon1)/2),2)
  ));
$$;

create or replace function registrar_fichaje_v2(
  p_employee_name text,
  p_pin text,
  p_type text,
  p_note text default null,
  p_gps_lat double precision default null,
  p_gps_lng double precision default null,
  p_accuracy double precision default null,
  p_method text default 'gps'
)
returns json language plpgsql security definer as $$
declare
  v_employee employees%rowtype;
  v_settings settings%rowtype;
  v_last_type text;
  v_distance double precision;
  v_inside boolean;
begin
  select * into v_employee from employees where name=p_employee_name and active=true and can_clock=true;
  if not found then return json_build_object('ok',false,'message','Empleado no autorizado'); end if;
  if v_employee.pin is distinct from p_pin then return json_build_object('ok',false,'message','PIN incorrecto'); end if;
  if p_type not in ('entrada','salida') then return json_build_object('ok',false,'message','Tipo no válido'); end if;
  select * into v_settings from settings where id=1;
  if p_method='gps' then
    if p_gps_lat is null or p_gps_lng is null then
      return json_build_object('ok',false,'message','GPS no recibido','outside_radius',true);
    end if;
    v_distance := haversine_m(v_settings.bar_lat, v_settings.bar_lng, p_gps_lat, p_gps_lng);
    v_inside := v_distance <= v_settings.gps_radius_m or (p_accuracy is not null and v_distance <= (v_settings.gps_radius_m + p_accuracy));
    if not v_inside then
      return json_build_object('ok',false,'message','Fuera del radio del bar','outside_radius',true,'distance_m',v_distance,'radius_m',v_settings.gps_radius_m);
    end if;
  else
    v_distance := null; v_inside := true;
  end if;
  select type into v_last_type from clock_records where employee_id=v_employee.id order by created_at desc limit 1;
  if v_last_type = p_type then return json_build_object('ok',false,'message','El último fichaje ya es de tipo '||p_type); end if;
  insert into clock_records(employee_id,employee_name,type,method,gps_lat,gps_lng,accuracy_m,distance_m,inside_radius,note)
  values(v_employee.id,v_employee.name,p_type,coalesce(p_method,'gps'),p_gps_lat,p_gps_lng,p_accuracy,v_distance,v_inside,p_note);
  return json_build_object('ok',true,'message','Fichaje registrado','employee',v_employee.name,'type',p_type,'method',p_method,'distance_m',v_distance);
end;
$$;

alter table employees enable row level security;
alter table clock_records enable row level security;
alter table settings enable row level security;
alter table schedules enable row level security;
alter table schedule_slots enable row level security;
alter table time_reports enable row level security;
alter table sales_daily enable row level security;
alter table sales_tickets enable row level security;

create policy "public employees read" on employees for select using (true);
create policy "public employees insert" on employees for insert with check (true);
create policy "public employees update" on employees for update using (true);
create policy "public clock read" on clock_records for select using (true);
create policy "public clock insert" on clock_records for insert with check (true);
create policy "public settings read" on settings for select using (true);
create policy "public settings update" on settings for update using (true);
create policy "public schedules all" on schedules for all using (true) with check (true);
create policy "public schedule_slots all" on schedule_slots for all using (true) with check (true);
create policy "public reports all" on time_reports for all using (true) with check (true);
create policy "public sales_daily all" on sales_daily for all using (true) with check (true);
create policy "public sales_tickets all" on sales_tickets for all using (true) with check (true);
